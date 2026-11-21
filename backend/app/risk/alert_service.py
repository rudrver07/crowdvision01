"""Alert generation service with configurable thresholds, cooldown deduplication, and severity escalation."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.core.logging import get_logger
from app.risk.engine import RiskResult

logger = get_logger("crowdvision.risk.alert_service")

# Configurable threshold defaults (occupancy ratio & density)
DEFAULT_THRESHOLDS: dict[str, float] = {
    "NORMAL": 0.25,     # < 25% occupancy
    "LOW": 0.50,        # 25% - 50% occupancy
    "MEDIUM": 0.75,     # 50% - 75% occupancy
    "HIGH": 0.90,       # 75% - 90% occupancy
    "CRITICAL": 1.00,   # >= 90% occupancy or bottleneck / hazard
}

RISK_TO_SEVERITY: dict[str, str] = {
    "LOW": "LOW",
    "MODERATE": "MEDIUM",
    "HIGH": "HIGH",
    "CRITICAL": "CRITICAL",
}

SEVERITY_ORDER: dict[str, int] = {
    "NORMAL": 0,
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4,
}

DEFAULT_COOLDOWN_SECONDS = 30.0


def generate_recommended_action(
    zone_name: str,
    severity: str,
    is_bottleneck: bool = False,
    is_counterflow: bool = False,
) -> str:
    """Generate professional, tactical operational response recommendations for railway staff."""
    z_lower = zone_name.lower()
    if severity == "CRITICAL":
        if "boarding" in z_lower or "door" in z_lower:
            return "Dispatch platform marshals immediately to train coach doorways and hold boarding flow."
        elif "platform" in z_lower or "edge" in z_lower:
            return "Activate platform edge acoustic warnings and clear tactile yellow safety line immediately."
        elif "stair" in z_lower or "escalator" in z_lower:
            return "Halt escalator flow and divert pedestrian traffic to auxiliary stairwells."
        elif "queue" in z_lower or "waiting" in z_lower:
            return "Open perimeter overflow staging and announce temporary train boarding delay."
        return "Initiate emergency crowd dispersion and request immediate railway police dispatch."
    elif severity == "HIGH":
        if "boarding" in z_lower or "door" in z_lower:
            return "Deploy station attendants to regulate coach queue ingress and ease doorway buildup."
        elif "platform" in z_lower or "edge" in z_lower:
            return "Enforce safety buffer along platform edge and sound periodic arrival chimes."
        elif "queue" in z_lower or "waiting" in z_lower:
            return "Organize passenger queues into parallel lanes and open auxiliary concourse gates."
        return "Increase physical surveillance and prepare auxiliary transit corridors."
    elif severity == "MEDIUM":
        return "Monitor zone flow dynamics and broadcast passenger queue advisories."
    elif severity == "LOW":
        return "Maintain routine automated CCTV monitoring and track density trends."
    return "All parameters normal. Continue automated surveillance."


def generate_spoken_announcement(
    zone_name: str,
    severity: str,
    people_count: int,
    occupancy_pct: int,
    recommended_action: str = "",
    language: str = "en",
) -> str:
    """Construct natural, concise operational announcements using verified actual detection values."""
    lang = language.lower().strip()
    if lang in ("hi", "hindi"):
        if severity == "CRITICAL":
            return (
                f"सावधान। {zone_name} पर आपातकालीन स्थिति और अत्यधिक भीड़ है। "
                f"लगभग {people_count} यात्री उपस्थित हैं और वर्तमान ऑक्यूपेंसी {occupancy_pct} प्रतिशत है। "
                f"रेलवे कर्मचारियों से अनुरोध है कि तत्काल भीड़ प्रबंधन शुरू करें।"
            )
        elif severity == "HIGH":
            return (
                f"सावधान। {zone_name} पर उच्च भीड़ घनत्व दर्ज किया गया है। "
                f"लगभग {people_count} यात्री उपस्थित हैं और वर्तमान ऑक्यूपेंसी {occupancy_pct} प्रतिशत है। "
                f"रेलवे सुरक्षा बल स्थिति पर निगरानी रखें।"
            )
        elif severity == "MEDIUM":
            return (
                f"सावधान। {zone_name} पर भीड़ बढ़ रही है। ऑक्यूपेंसी {occupancy_pct} प्रतिशत है।"
            )
        return f"सावधान। {zone_name} पर भीड़ का घनत्व सामान्य सीमा में है।"

    # English natural phrasing
    if severity == "CRITICAL":
        return (
            f"Attention. Critical crowd surge detected at {zone_name}. "
            f"Approximately {people_count} people are present in the monitored area with {occupancy_pct} percent occupancy. "
            f"Crowd risk is critical. Railway staff are advised to initiate crowd management immediately."
        )
    elif severity == "HIGH":
        return (
            f"Attention. High crowd density detected at {zone_name}. "
            f"Approximately {people_count} people are present in the monitored area. "
            f"Current occupancy is {occupancy_pct} percent. Railway staff are advised to monitor ingress."
        )
    elif severity == "MEDIUM":
        return (
            f"Notice. Moderate crowd buildup at {zone_name}. "
            f"Approximately {people_count} people present. Staff advisories in effect."
        )
    return f"Notice. Crowd density at {zone_name} is within normal operating limits."


@dataclass
class AlertData:
    """An alert emitted by the risk pipeline."""

    event_id: str
    zone_id: str
    zone_name: str
    category: str
    severity: str  # LOW / MEDIUM / HIGH / CRITICAL
    title: str
    description: str
    supporting_measurements: dict
    video_timestamp_sec: float
    recommended_action: str = ""
    risk_score: int = 50
    spoken_text: str = ""
    status: str = "ACTIVE"
    source: str = "RISK_ENGINE"
    id: Optional[str] = None
    created_at: Optional[str] = None


class AlertService:
    """Generates alerts from RiskResult objects, deduplicating via per-zone cooldowns and escalation tracking."""

    def __init__(
        self,
        cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
        thresholds: Optional[dict[str, float]] = None,
    ) -> None:
        self.cooldown_seconds = cooldown_seconds
        self.thresholds = dict(DEFAULT_THRESHOLDS)
        if thresholds:
            self.thresholds.update(thresholds)
        self._last_fired: dict[tuple[str, str, str], float] = {}
        self._last_severity: dict[tuple[str, str], str] = {}
        logger.info(
            "AlertService initialised",
            cooldown_seconds=self.cooldown_seconds,
            thresholds=self.thresholds,
        )

    def process_risk_assessments(
        self,
        risk_assessments: list[RiskResult],
        snapshots: Optional[list[Any]] = None,
        video_timestamp_sec: float = 0.0,
        event_id: str = "event_default",
    ) -> list[Any]:
        return self.evaluate(
            risk_results=risk_assessments,
            event_id=event_id,
            video_timestamp_sec=video_timestamp_sec,
        )

    def evaluate(
        self,
        risk_results: list[RiskResult],
        event_id: str,
        video_timestamp_sec: float,
    ) -> list[AlertData]:
        alerts: list[AlertData] = []
        for res in risk_results:
            if res.risk_level not in RISK_TO_SEVERITY:
                continue

            severity = RISK_TO_SEVERITY[res.risk_level]
            category = self._determine_category(res)
            cooldown_key = (event_id, res.zone_id, category)
            sev_key = (event_id, res.zone_id)

            last_ts = self._last_fired.get(cooldown_key)
            prev_sev = self._last_severity.get(sev_key, "NORMAL")

            # Check if this is a genuine severity escalation (e.g. MEDIUM -> HIGH, or HIGH -> CRITICAL)
            is_escalation = SEVERITY_ORDER.get(severity, 0) > SEVERITY_ORDER.get(prev_sev, 0)

            # If within cooldown and NOT an escalation, skip duplicate alert
            if not is_escalation:
                if last_ts is not None and abs(video_timestamp_sec - last_ts) < self.cooldown_seconds:
                    continue

            self._last_fired[cooldown_key] = video_timestamp_sec
            self._last_severity[sev_key] = severity

            m = dict(res.supporting_measurements or {})
            occ_pct = float(m.get("occupancy_ratio", 0.0)) * 100.0
            people = int(m.get("people_count", 0))
            cap = int(m.get("capacity", 50))
            inflow = float(m.get("inflow_rate", 0.0))
            outflow = float(m.get("outflow_rate", 0.0))

            is_bn = "bottleneck" in category or "bottleneck" in res.reason.lower()
            is_cf = "counterflow" in category or "counterflow" in res.reason.lower()

            # Deterministic risk score calculation (0 - 100)
            base_score = int(min(100.0, occ_pct * 0.75))
            if is_bn:
                base_score = min(100, base_score + 18)
            if is_cf:
                base_score = min(100, base_score + 12)
            risk_score = max(10, min(100, base_score))

            recommended_action = generate_recommended_action(
                zone_name=res.zone_name,
                severity=severity,
                is_bottleneck=is_bn,
                is_counterflow=is_cf,
            )

            spoken_text = generate_spoken_announcement(
                zone_name=res.zone_name,
                severity=severity,
                people_count=people,
                occupancy_pct=int(round(occ_pct)),
                recommended_action=recommended_action,
                language="en",
            )

            # Store rich properties in measurements
            m["risk_score"] = risk_score
            m["recommended_action"] = recommended_action
            m["spoken_text"] = spoken_text
            m["is_bottleneck"] = is_bn
            m["is_counterflow"] = is_cf

            title = self._build_title(category, res.risk_level, res.zone_name, occ_pct)
            description = (
                f"{res.reason} | Current count: {people}/{cap} ({occ_pct:.1f}%), "
                f"inflow: {inflow:.1f}/min, outflow: {outflow:.1f}/min. "
                f"Action: {recommended_action}"
            )
            if res.requires_human_review:
                description += " Human safety-team review recommended."

            alerts.append(
                AlertData(
                    event_id=event_id,
                    zone_id=res.zone_id,
                    zone_name=res.zone_name,
                    category=category,
                    severity=severity,
                    title=title,
                    description=description,
                    supporting_measurements=m,
                    video_timestamp_sec=round(video_timestamp_sec, 2),
                    recommended_action=recommended_action,
                    risk_score=risk_score,
                    spoken_text=spoken_text,
                    source="RISK_ENGINE",
                )
            )

        return alerts

    def _determine_category(self, res: RiskResult) -> str:
        factors_joined = " ".join(res.contributing_factors).lower()
        if res.risk_level == "CRITICAL":
            return "critical_density"
        elif "bottleneck" in factors_joined:
            return "bottleneck"
        elif "counterflow" in factors_joined:
            return "counterflow"
        elif "rapid" in factors_joined or "accumulation" in factors_joined:
            return "rapid_accumulation"
        return "occupancy_warning"

    def _build_title(self, category: str, risk_level: str, zone_name: str, occ_pct: float) -> str:
        if category == "critical_density":
            return f"Critical Density Alert: {zone_name} at {occ_pct:.0f}%"
        elif category == "bottleneck":
            return f"Bottleneck Detected: {zone_name}"
        elif category == "counterflow":
            return f"Counterflow Detected: {zone_name}"
        elif category == "rapid_accumulation":
            return f"Rapid Crowd Accumulation: {zone_name}"
        return f"{risk_level} Risk Warning: {zone_name}"
