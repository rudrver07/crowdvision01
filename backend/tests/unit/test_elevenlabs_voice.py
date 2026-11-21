"""Unit and integration tests for ElevenLabs Voice Alert integration."""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.services.elevenlabs_service import ElevenLabsService, ElevenLabsError


@pytest.fixture
def test_client():
    return TestClient(app)


@pytest.fixture
def voice_service():
    service = ElevenLabsService()
    return service


def test_voice_status_endpoint(test_client):
    response = test_client.get("/api/voice/status")
    assert response.status_code == 200
    data = response.json()
    assert "enabled" in data
    assert "voice_id" in data
    assert "model_id" in data
    assert "output_format" in data
    assert data["voice_id"] == "tnSpp4vdxKPjI9w0GnoV"
    assert data["model_id"] == "eleven_flash_v2_5"


def test_announcement_formatting_english(voice_service):
    alert_high = {
        "zone_name": "Main Stage",
        "severity": "HIGH",
        "category": "occupancy_warning",
        "supporting_measurements": {"occupancy_ratio": 0.82},
    }
    en_text = voice_service.format_announcement(alert_high, language="en")
    assert "Attention. High crowd density detected at Main Stage." in en_text
    assert "82 percent" in en_text

    alert_crit = {
        "zone_name": "Emergency Corridor",
        "severity": "CRITICAL",
        "category": "critical_density",
        "supporting_measurements": {"occupancy_ratio": 0.95},
    }
    crit_text = voice_service.format_announcement(alert_crit, language="en")
    assert "Critical crowd surge detected at Emergency Corridor" in crit_text
    assert "Immediate action required" in crit_text


def test_announcement_formatting_hindi(voice_service):
    alert_high = {
        "zone_name": "मेन स्टेज",
        "severity": "HIGH",
        "category": "occupancy_warning",
        "supporting_measurements": {"occupancy_ratio": 0.82},
    }
    hi_text = voice_service.format_announcement(alert_high, language="hi")
    assert "सावधान।" in hi_text
    assert "82 प्रतिशत" in hi_text

    alert_crit = {
        "zone_name": "आपातकालीन द्वार",
        "severity": "CRITICAL",
        "category": "critical_density",
    }
    crit_text = voice_service.format_announcement(alert_crit, language="hi")
    assert "आपातकालीन स्थिति और अत्यधिक भीड़" in crit_text


def test_lease_coordination(voice_service):
    # Tab 1 acquires lease
    assert voice_service.acquire_lease("tab-1", ttl_sec=10.0) is True
    assert voice_service.get_active_owner() == "tab-1"

    # Tab 2 attempts to acquire lease while Tab 1 active
    assert voice_service.acquire_lease("tab-2", ttl_sec=10.0) is False
    assert voice_service.get_active_owner() == "tab-1"

    # Tab 1 sends heartbeat
    assert voice_service.heartbeat_lease("tab-1", ttl_sec=10.0) is True

    # Tab 1 releases lease
    assert voice_service.release_lease("tab-1") is True
    assert voice_service.get_active_owner() is None

    # Tab 2 can now acquire lease
    assert voice_service.acquire_lease("tab-2", ttl_sec=10.0) is True
    assert voice_service.get_active_owner() == "tab-2"


@pytest.mark.asyncio
async def test_synthesis_caching(voice_service):
    # Mock httpx post
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.content = b"ID3\x04\x00\x00\x00\x00\x00\x23" + (b"\x00" * 256)

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        # First synthesis call hits API
        audio1 = await voice_service.synthesize("Attention. High crowd density detected at Entrance A.")
        assert audio1 == mock_resp.content
        assert mock_post.call_count == 1

        # Second synthesis call with identical text serves from cache
        audio2 = await voice_service.synthesize("Attention. High crowd density detected at Entrance A.")
        assert audio2 == mock_resp.content
        assert mock_post.call_count == 1  # Not incremented due to cache hit


@pytest.mark.asyncio
async def test_synthesis_api_failure_handling(voice_service):
    mock_resp = MagicMock()
    mock_resp.status_code = 502
    mock_resp.text = "Service temporarily unavailable"

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        with pytest.raises(ElevenLabsError) as exc_info:
            await voice_service.synthesize("Test error handling.")
        assert exc_info.value.status_code == 502
