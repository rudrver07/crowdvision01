"""Unit tests for Dynamic Alert Generation, Severity Escalation, Auto-Resolution, and ElevenLabs Speech Phrasing."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.risk.alert_service import (
    AlertService,
    DEFAULT_THRESHOLDS,
    generate_recommended_action,
    generate_spoken_announcement,
)
from app.risk.engine import RiskResult


@pytest.fixture
def test_client():
    return TestClient(app)


def test_configurable_thresholds_and_recommendations():
    # Verify recommended actions across severities and zones
    act_crit = generate_recommended_action("Train Door Boarding & Clearance Zone", "CRITICAL", is_bottleneck=True)
    assert "platform marshals" in act_crit.lower()
    assert "doorways" in act_crit.lower()

    act_plat = generate_recommended_action("Platform Edge Safety Zone", "CRITICAL")
    assert "platform edge acoustic warnings" in act_plat.lower()

    act_high = generate_recommended_action("Passenger Waiting & Queue Zone", "HIGH")
    assert "queue" in act_high.lower()

    act_normal = generate_recommended_action("Passenger Circulation & Walking Corridor", "NORMAL")
    assert "automated surveillance" in act_normal.lower()


def test_dynamic_spoken_announcement_phrasing():
    # English phrasing uses actual values
    en_msg = generate_spoken_announcement(
        zone_name="Platform Zone A",
        severity="HIGH",
        people_count=85,
        occupancy_pct=85,
        recommended_action="Deploy station attendants to regulate ingress.",
        language="en",
    )
    assert "Platform Zone A" in en_msg
    assert "85 people are present" in en_msg
    assert "85 percent" in en_msg

    # Critical English announcement
    crit_msg = generate_spoken_announcement(
        zone_name="Train Door Boarding & Clearance Zone",
        severity="CRITICAL",
        people_count=25,
        occupancy_pct=100,
        recommended_action="Dispatch platform marshals immediately.",
        language="en",
    )
    assert "Train Door Boarding & Clearance Zone" in crit_msg
    assert "25 people are present" in crit_msg
    assert "100 percent" in crit_msg
    assert "Crowd risk is critical" in crit_msg

    # Hindi phrasing
    hi_msg = generate_spoken_announcement(
        zone_name="प्लेटफ़ॉर्म ज़ोन",
        severity="CRITICAL",
        people_count=45,
        occupancy_pct=95,
        language="hi",
    )
    assert "सावधान।" in hi_msg
    assert "45 यात्री उपस्थित हैं" in hi_msg
    assert "95 प्रतिशत" in hi_msg


def test_alert_service_escalation_and_cooldown():
    service = AlertService(cooldown_seconds=30.0)

    # 1. Medium risk event at ts = 10.0
    r_med = RiskResult(
        zone_id="z_door",
        zone_name="Door Area",
        risk_level="MODERATE",
        reason="Moderate congestion",
        supporting_measurements={"occupancy_ratio": 0.60, "people_count": 15, "capacity": 25},
        monitoring_priority="ELEVATED",
        requires_human_review=False,
        contributing_factors=["occupancy_warning"],
    )
    alerts_1 = service.evaluate([r_med], "task_test", 10.0)
    assert len(alerts_1) == 1
    assert alerts_1[0].severity == "MEDIUM"

    # 2. Duplicate Medium risk event at ts = 15.0 within cooldown -> should be suppressed
    alerts_dup = service.evaluate([r_med], "task_test", 15.0)
    assert len(alerts_dup) == 0

    # 3. Severity escalation from MEDIUM to CRITICAL at ts = 18.0 -> MUST fire immediately!
    r_crit = RiskResult(
        zone_id="z_door",
        zone_name="Door Area",
        risk_level="CRITICAL",
        reason="Critical doorway bottleneck surge",
        supporting_measurements={"occupancy_ratio": 1.05, "people_count": 26, "capacity": 25},
        monitoring_priority="IMMEDIATE",
        requires_human_review=True,
        contributing_factors=["bottleneck", "critical_density"],
    )
    alerts_escalated = service.evaluate([r_crit], "task_test", 18.0)
    assert len(alerts_escalated) == 1
    assert alerts_escalated[0].severity == "CRITICAL"
    assert alerts_escalated[0].risk_score > 80
    assert "Immediate action required" in alerts_escalated[0].spoken_text or "initiate crowd management immediately" in alerts_escalated[0].spoken_text


def test_api_alert_evaluation_endpoint(test_client):
    # Test POST /api/alerts/evaluate with high occupancy -> creates alert
    resp = test_client.post(
        "/api/alerts/evaluate",
        json={
            "task_id": "task_railway_cctv_analysis",
            "zone_id": "zone-boarding-edge",
            "zone_name": "Train Door Boarding & Clearance Zone",
            "people_count": 25,
            "capacity": 25,
            "occupancy_ratio": 1.0,
            "density_value": 1.8,
            "is_bottleneck": True,
            "is_counterflow": False,
            "video_timestamp_sec": 8.5,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["action"] in ("CREATED", "SUPPRESSED_COOLDOWN")
    assert data["severity"] == "CRITICAL"

    if data["action"] == "CREATED":
        alert_obj = data["alert"]
        assert alert_obj["severity"] == "CRITICAL"
        assert alert_obj["zone_name"] == "Train Door Boarding & Clearance Zone"
        assert "recommended_action" in alert_obj["supporting_measurements"]
        assert "risk_score" in alert_obj["supporting_measurements"]

    # Test condition cleared -> returns action RESOLVED or NORMAL
    resp_clear = test_client.post(
        "/api/alerts/evaluate",
        json={
            "task_id": "task_railway_cctv_analysis",
            "zone_id": "zone-boarding-edge",
            "zone_name": "Train Door Boarding & Clearance Zone",
            "people_count": 2,
            "capacity": 25,
            "occupancy_ratio": 0.08,
            "density_value": 0.1,
            "is_bottleneck": False,
            "is_counterflow": False,
            "video_timestamp_sec": 42.0,
        },
    )
    assert resp_clear.status_code == 200
    data_clear = resp_clear.json()
    assert data_clear["action"] in ("RESOLVED", "NORMAL")
