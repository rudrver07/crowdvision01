"""Alert queries, statistics, creation, and acknowledge/resolve workflow endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token, security_scheme
from app.database.models import Alert, User
from app.database.session import get_db
from app.risk.alert_service import (
    DEFAULT_COOLDOWN_SECONDS,
    DEFAULT_THRESHOLDS,
    SEVERITY_ORDER,
    generate_recommended_action,
    generate_spoken_announcement,
)
from app.schemas.api_schemas import (
    AlertAcknowledgeRequest,
    AlertCreateRequest,
    AlertResolveRequest,
    AlertResponse,
    AlertStatsResponse,
)

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _resolve_operator(credentials, db: AsyncSession) -> str:
    if credentials:
        payload = decode_access_token(credentials.credentials)
        if payload and "sub" in payload:
            return payload["sub"]
    return "operator"


class AlertStatusPatchRequest(BaseModel):
    status: str
    note: Optional[str] = None


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    db: Annotated[AsyncSession, Depends(get_db)],
    event_id: Optional[str] = Query(None),
    task_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    zone_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    target_id = event_id or task_id
    stmt = select(Alert).order_by(desc(Alert.created_at))
    if target_id:
        stmt = stmt.where(Alert.event_id == target_id)
    if status:
        stmt = stmt.where(Alert.status == status.upper())
    if severity:
        stmt = stmt.where(Alert.severity == severity.upper())
    if category:
        stmt = stmt.where(Alert.category == category.lower())
    if zone_id:
        stmt = stmt.where(Alert.zone_id == zone_id)
    stmt = stmt.offset(offset).limit(limit)

    alerts = (await db.execute(stmt)).scalars().all()
    return [AlertResponse.model_validate(a) for a in alerts]


@router.get("/stats", response_model=AlertStatsResponse)
async def get_alert_stats(
    db: Annotated[AsyncSession, Depends(get_db)],
    event_id: Optional[str] = Query(None),
    task_id: Optional[str] = Query(None),
):
    """Retrieve statistical breakdown of alerts across severities, categories, and resolution states."""
    target_id = event_id or task_id
    stmt = select(Alert)
    if target_id:
        stmt = stmt.where(Alert.event_id == target_id)

    alerts = (await db.execute(stmt)).scalars().all()

    total = len(alerts)
    active = sum(1 for a in alerts if a.status == "ACTIVE")
    acknowledged = sum(1 for a in alerts if a.status == "ACKNOWLEDGED")
    resolved = sum(1 for a in alerts if a.status == "RESOLVED")

    by_sev: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    by_cat: dict[str, int] = {}

    for a in alerts:
        s = a.severity.upper()
        by_sev[s] = by_sev.get(s, 0) + 1
        c = a.category.lower()
        by_cat[c] = by_cat.get(c, 0) + 1

    return AlertStatsResponse(
        total=total,
        active=active,
        acknowledged=acknowledged,
        resolved=resolved,
        by_severity=by_sev,
        by_category=by_cat,
    )


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(
    payload: AlertCreateRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Manually create or inject an alert from operator or external monitoring sensor."""
    alert = Alert(
        id=f"alt_{uuid.uuid4().hex[:12]}",
        event_id=payload.event_id,
        zone_id=payload.zone_id or "zone_general",
        zone_name=payload.zone_name or "General Area",
        category=payload.category,
        severity=payload.severity.upper(),
        title=payload.title,
        description=payload.description,
        supporting_measurements=payload.supporting_measurements,
        status="ACTIVE",
        video_timestamp_sec=0.0,
        source=payload.source,
        created_at=_utcnow(),
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return AlertResponse.model_validate(alert)


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return AlertResponse.model_validate(alert)


@router.post("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    alert_id: str,
    payload: AlertAcknowledgeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Optional[Any] = Depends(security_scheme),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    if alert.status == "RESOLVED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Alert is already resolved")

    user_email = await _resolve_operator(credentials, db)
    alert.status = "ACKNOWLEDGED"
    alert.acknowledged_by = user_email
    alert.acknowledged_at = _utcnow()
    if payload.note:
        alert.resolution_note = (
            f"[Ack Note: {payload.note}] " + (alert.resolution_note or "")
        ).strip()

    await db.commit()
    await db.refresh(alert)
    return AlertResponse.model_validate(alert)


@router.post("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(
    alert_id: str,
    payload: AlertResolveRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Optional[Any] = Depends(security_scheme),
):
    alert = await db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")

    user_email = await _resolve_operator(credentials, db)
    alert.status = "RESOLVED"
    alert.resolved_by = user_email
    alert.resolved_at = _utcnow()
    if payload.resolution_note:
        alert.resolution_note = payload.resolution_note

    await db.commit()
    await db.refresh(alert)
    return AlertResponse.model_validate(alert)


@router.patch("/{alert_id}/status", response_model=AlertResponse)
async def update_alert_status(
    alert_id: str,
    payload: AlertStatusPatchRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    credentials: Optional[Any] = Depends(security_scheme),
):
    """Backwards-compatible PATCH endpoint for quick alert state update."""
    st = payload.status.upper()
    if st == "ACKNOWLEDGED":
        return await acknowledge_alert(
            alert_id=alert_id,
            payload=AlertAcknowledgeRequest(note=payload.note),
            db=db,
            credentials=credentials,
        )
    elif st == "RESOLVED":
        return await resolve_alert(
            alert_id=alert_id,
            payload=AlertResolveRequest(resolution_note=payload.note),
            db=db,
            credentials=credentials,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported status '{payload.status}'. Must be ACKNOWLEDGED or RESOLVED.",
        )


class AlertEvaluationRequest(BaseModel):
    task_id: str
    zone_id: str
    zone_name: str
    people_count: int = 0
    capacity: int = 50
    occupancy_ratio: float = 0.0
    density_value: float = 0.0
    is_bottleneck: bool = False
    is_counterflow: bool = False
    video_timestamp_sec: float = 0.0
    threshold_low: Optional[float] = None
    threshold_medium: Optional[float] = None
    threshold_high: Optional[float] = None
    threshold_critical: Optional[float] = None


class AlertEvaluationResponse(BaseModel):
    action: str  # "CREATED" | "RESOLVED" | "SUPPRESSED_COOLDOWN" | "NORMAL"
    severity: str
    alert: Optional[AlertResponse] = None


@router.post("/evaluate", response_model=AlertEvaluationResponse)
async def evaluate_telemetry_alert(
    payload: AlertEvaluationRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Dynamically evaluate incoming detection telemetry against thresholds and create/resolve persistent alerts."""
    th_crit = payload.threshold_critical or DEFAULT_THRESHOLDS["CRITICAL"]
    th_high = payload.threshold_high or DEFAULT_THRESHOLDS["HIGH"]
    th_med = payload.threshold_medium or DEFAULT_THRESHOLDS["MEDIUM"]
    th_low = payload.threshold_low or DEFAULT_THRESHOLDS["LOW"]

    occ = payload.occupancy_ratio
    is_bn = payload.is_bottleneck
    is_cf = payload.is_counterflow

    # Calculate severity from actual detection data
    if occ >= th_crit or (is_bn and occ >= 0.70):
        severity = "CRITICAL"
        category = "critical_density" if occ >= th_crit else "bottleneck"
    elif occ >= th_high or is_bn:
        severity = "HIGH"
        category = "bottleneck" if is_bn else "occupancy_warning"
    elif occ >= th_med or is_cf:
        severity = "MEDIUM"
        category = "counterflow" if is_cf else "occupancy_warning"
    elif occ >= th_low:
        severity = "LOW"
        category = "occupancy_warning"
    else:
        severity = "NORMAL"
        category = "occupancy_warning"

    # 1. Condition cleared: Check if an active alert exists to auto-resolve
    if severity in ("NORMAL", "LOW"):
        active_stmt = (
            select(Alert)
            .where(Alert.event_id == payload.task_id)
            .where(Alert.zone_id == payload.zone_id)
            .where(Alert.status == "ACTIVE")
            .order_by(desc(Alert.created_at))
            .limit(1)
        )
        active_alert = (await db.execute(active_stmt)).scalar_one_or_none()
        if active_alert:
            active_alert.status = "RESOLVED"
            active_alert.resolved_by = "AI_DETECTION_ENGINE"
            active_alert.resolved_at = _utcnow()
            active_alert.resolution_note = (
                f"Crowd cleared. Occupancy returned to normal bounds ({occ:.0%})."
            )
            await db.commit()
            await db.refresh(active_alert)
            return AlertEvaluationResponse(
                action="RESOLVED",
                severity=severity,
                alert=AlertResponse.model_validate(active_alert),
            )
        return AlertEvaluationResponse(action="NORMAL", severity=severity)

    # 2. Check recent alerts for cooldown and escalation
    recent_stmt = (
        select(Alert)
        .where(Alert.event_id == payload.task_id)
        .where(Alert.zone_id == payload.zone_id)
        .order_by(desc(Alert.created_at))
        .limit(1)
    )
    last_alert = (await db.execute(recent_stmt)).scalar_one_or_none()

    is_escalation = False
    in_cooldown = False

    if last_alert:
        last_sev = last_alert.severity.upper()
        if SEVERITY_ORDER.get(severity, 0) > SEVERITY_ORDER.get(last_sev, 0):
            is_escalation = True
        else:
            time_diff = abs(payload.video_timestamp_sec - last_alert.video_timestamp_sec)
            if time_diff < DEFAULT_COOLDOWN_SECONDS:
                in_cooldown = True

    if in_cooldown and not is_escalation:
        return AlertEvaluationResponse(
            action="SUPPRESSED_COOLDOWN",
            severity=severity,
            alert=AlertResponse.model_validate(last_alert) if last_alert else None,
        )

    # 3. Create persistent alert with real measurements & recommended response
    occ_pct = int(round(occ * 100.0))
    base_score = int(min(100.0, occ_pct * 0.75))
    if is_bn:
        base_score = min(100, base_score + 18)
    if is_cf:
        base_score = min(100, base_score + 12)
    risk_score = max(10, min(100, base_score))

    recommended_action = generate_recommended_action(
        zone_name=payload.zone_name,
        severity=severity,
        is_bottleneck=is_bn,
        is_counterflow=is_cf,
    )

    spoken_text = generate_spoken_announcement(
        zone_name=payload.zone_name,
        severity=severity,
        people_count=payload.people_count,
        occupancy_pct=occ_pct,
        recommended_action=recommended_action,
        language="en",
    )

    if category == "critical_density":
        title = f"Critical Density Alert: {payload.zone_name} at {occ_pct}%"
    elif category == "bottleneck":
        title = f"Bottleneck Detected: {payload.zone_name}"
    elif category == "counterflow":
        title = f"Counterflow Detected: {payload.zone_name}"
    else:
        title = f"{severity} Risk Warning: {payload.zone_name}"

    description = (
        f"Detected {payload.people_count} persons in {payload.zone_name} (Capacity: {payload.capacity}, "
        f"Occupancy: {occ_pct}%). Density: {payload.density_value:.2f}. "
        f"Action: {recommended_action}"
    )

    measurements = {
        "people_count": payload.people_count,
        "capacity": payload.capacity,
        "occupancy_ratio": occ,
        "density_value": payload.density_value,
        "risk_score": risk_score,
        "recommended_action": recommended_action,
        "spoken_text": spoken_text,
        "is_bottleneck": is_bn,
        "is_counterflow": is_cf,
        "is_escalation": is_escalation,
    }

    new_alert = Alert(
        id=f"alt_rt_{uuid.uuid4().hex[:10]}",
        event_id=payload.task_id,
        zone_id=payload.zone_id,
        zone_name=payload.zone_name,
        category=category,
        severity=severity,
        title=title,
        description=description,
        supporting_measurements=measurements,
        status="ACTIVE",
        video_timestamp_sec=round(payload.video_timestamp_sec, 2),
        source="AI_DETECTION_ENGINE",
        created_at=_utcnow(),
    )
    db.add(new_alert)
    await db.commit()
    await db.refresh(new_alert)

    return AlertEvaluationResponse(
        action="CREATED",
        severity=severity,
        alert=AlertResponse.model_validate(new_alert),
    )

