"""Voice alert synthesis and multi-client lease API endpoints."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.core.logging import get_logger
from app.services.elevenlabs_service import ElevenLabsError, elevenlabs_service

logger = get_logger("api.voice")
router = APIRouter()


class VoiceStatusResponse(BaseModel):
    enabled: bool
    configured: bool
    voice_id: str
    model_id: str
    output_format: str
    active_lease_owner: Optional[str] = None
    cached_audio_items: int = 0


class FormatAnnouncementRequest(BaseModel):
    alert: dict[str, Any]
    language: str = Field(default="en", description="Target language ('en' or 'hi')")


class FormatAnnouncementResponse(BaseModel):
    text: str
    language: str


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)
    language: Optional[str] = "en"
    voice_id: Optional[str] = None
    model_id: Optional[str] = None
    alert_id: Optional[str] = None
    zone_id: Optional[str] = None


class LeaseRequest(BaseModel):
    client_id: str = Field(..., min_length=1, max_length=128)
    ttl_sec: Optional[float] = Field(default=30.0, ge=5.0, le=300.0)


class LeaseResponse(BaseModel):
    acquired: bool
    owner: Optional[str] = None


@router.get("/status", response_model=VoiceStatusResponse)
async def get_voice_status():
    """Retrieve operational status of the ElevenLabs voice alert subsystem."""
    return elevenlabs_service.get_status()


@router.post("/format", response_model=FormatAnnouncementResponse)
async def format_announcement(payload: FormatAnnouncementRequest):
    """Format an alert into concise, verified operational speech text for English or Hindi."""
    text = elevenlabs_service.format_announcement(payload.alert, language=payload.language)
    return FormatAnnouncementResponse(text=text, language=payload.language)


@router.post("/tts")
async def synthesize_speech(payload: TTSRequest):
    """Synthesize operational announcement into MP3 audio via ElevenLabs TTS API."""
    try:
        audio_bytes = await elevenlabs_service.synthesize(
            text=payload.text,
            voice_id=payload.voice_id,
            model_id=payload.model_id,
        )
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Content-Type": "audio/mpeg",
                "Content-Length": str(len(audio_bytes)),
                "Cache-Control": "public, max-age=3600",
                "X-Voice-Provider": "ElevenLabs",
            },
        )
    except ElevenLabsError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "error": exc.message,
                "detail": exc.detail,
                "provider": "ElevenLabs",
            },
        )
    except Exception as exc:
        logger.exception("Unexpected error in voice synthesis", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Speech synthesis error: {str(exc)}",
        )


@router.post("/lease/acquire", response_model=LeaseResponse)
async def acquire_lease(payload: LeaseRequest):
    """Acquire single-client venue playback lease for multi-screen/multi-tab environments."""
    success = elevenlabs_service.acquire_lease(payload.client_id, ttl_sec=payload.ttl_sec or 30.0)
    return LeaseResponse(acquired=success, owner=elevenlabs_service.get_active_owner())


@router.post("/lease/heartbeat", response_model=LeaseResponse)
async def heartbeat_lease(payload: LeaseRequest):
    """Renew active playback lease."""
    success = elevenlabs_service.heartbeat_lease(payload.client_id, ttl_sec=payload.ttl_sec or 30.0)
    return LeaseResponse(acquired=success, owner=elevenlabs_service.get_active_owner())


@router.post("/lease/release")
async def release_lease(payload: LeaseRequest):
    """Release active playback lease."""
    released = elevenlabs_service.release_lease(payload.client_id)
    return {"released": released}
