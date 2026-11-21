"""ElevenLabs Text-to-Speech integration service for operational crowd voice alerts."""
from __future__ import annotations

import hashlib
import time
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.core.logging import get_logger

logger = get_logger("services.elevenlabs")


class ElevenLabsError(Exception):
    """Custom exception raised for ElevenLabs integration errors."""

    def __init__(self, message: str, status_code: int = 500, detail: Optional[str] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.detail = detail


class ElevenLabsService:
    """Singleton service managing ElevenLabs voice synthesis, caching, and multi-client lease coordination."""

    def __init__(self) -> None:
        self._cache: dict[str, tuple[bytes, float]] = {}  # key -> (audio_bytes, timestamp)
        self._cache_ttl_sec: float = 3600.0  # 1 hour audio cache
        self._lease_owner: Optional[str] = None
        self._lease_expires_at: float = 0.0

    @property
    def is_enabled(self) -> bool:
        return bool(get_settings().elevenlabs_enabled)

    @property
    def is_configured(self) -> bool:
        settings = get_settings()
        return bool(settings.elevenlabs_api_key and settings.elevenlabs_api_key.strip())

    def get_status(self) -> dict[str, Any]:
        settings = get_settings()
        now = time.time()
        active_owner = self._lease_owner if self._lease_expires_at > now else None
        return {
            "enabled": self.is_enabled,
            "configured": self.is_configured,
            "voice_id": settings.elevenlabs_voice_id,
            "model_id": settings.elevenlabs_model_id,
            "output_format": settings.elevenlabs_output_format,
            "active_lease_owner": active_owner,
            "cached_audio_items": len(self._cache),
        }

    # ── Multi-client Venue Playback Lease ─────────────────────────────
    def acquire_lease(self, client_id: str, ttl_sec: float = 30.0) -> bool:
        now = time.time()
        if not client_id:
            return False
        if self._lease_owner is None or self._lease_expires_at <= now or self._lease_owner == client_id:
            self._lease_owner = client_id
            self._lease_expires_at = now + ttl_sec
            logger.info("Playback lease acquired", client_id=client_id, ttl_sec=ttl_sec)
            return True
        return False

    def heartbeat_lease(self, client_id: str, ttl_sec: float = 30.0) -> bool:
        now = time.time()
        if self._lease_owner == client_id and self._lease_expires_at > now:
            self._lease_expires_at = now + ttl_sec
            return True
        if self._lease_owner is None or self._lease_expires_at <= now:
            return self.acquire_lease(client_id, ttl_sec)
        return False

    def release_lease(self, client_id: str) -> bool:
        if self._lease_owner == client_id:
            logger.info("Playback lease released", client_id=client_id)
            self._lease_owner = None
            self._lease_expires_at = 0.0
            return True
        return False

    def get_active_owner(self) -> Optional[str]:
        if self._lease_expires_at > time.time():
            return self._lease_owner
        return None

    # ── Operational Voice Message Formatter ──────────────────────────
    def format_announcement(self, alert: dict[str, Any], language: str = "en") -> str:
        """Construct natural, professional, concise operational announcements in English or Hindi.

        Uses strictly verified fields from the alert (zone_name, severity, category, supporting measurements).
        Never fabricates values or mentions unverified parameters.
        """
        zone_name = str(alert.get("zone_name") or "designated zone").strip()
        severity = str(alert.get("severity") or "HIGH").upper()
        category = str(alert.get("category") or "occupancy_warning").lower()

        measurements = alert.get("supporting_measurements") or {}
        occ_ratio = measurements.get("occupancy_ratio")
        occ_pct: Optional[int] = None
        if occ_ratio is not None:
            try:
                occ_pct = int(round(float(occ_ratio) * 100.0))
            except (ValueError, TypeError):
                occ_pct = None

        lang = language.lower().strip()
        if lang in ("hi", "hindi"):
            return self._format_hindi(zone_name, severity, category, occ_pct)
        return self._format_english(zone_name, severity, category, occ_pct)

    def _format_english(
        self, zone_name: str, severity: str, category: str, occ_pct: Optional[int]
    ) -> str:
        if severity == "CRITICAL" or category == "critical_density":
            if occ_pct is not None:
                return (
                    f"Attention. Critical crowd surge detected at {zone_name}. "
                    f"Current occupancy is {occ_pct} percent. Immediate action required."
                )
            return (
                f"Attention. Critical crowd surge detected at {zone_name}. "
                "Immediate action required."
            )

        if "bottleneck" in category:
            return f"Attention. Crowd bottleneck detected at {zone_name}."

        if "counterflow" in category:
            return f"Warning. Counterflow detected at {zone_name}."

        if "rapid" in category or "accumulation" in category:
            return f"Warning. Rapid crowd accumulation at {zone_name}."

        if occ_pct is not None:
            return f"Attention. High crowd density detected at {zone_name}. Current occupancy is {occ_pct} percent."

        return f"Attention. High crowd density detected at {zone_name}."

    def _format_hindi(
        self, zone_name: str, severity: str, category: str, occ_pct: Optional[int]
    ) -> str:
        if severity == "CRITICAL" or category == "critical_density":
            if occ_pct is not None:
                return (
                    f"सावधान। {zone_name} पर आपातकालीन स्थिति और अत्यधिक भीड़ है। "
                    f"वर्तमान ऑक्यूपेंसी {occ_pct} प्रतिशत है। तुरंत कार्रवाई की आवश्यकता है।"
                )
            return (
                f"सावधान। {zone_name} पर आपातकालीन स्थिति और अत्यधिक भीड़ है। "
                "तुरंत कार्रवाई की आवश्यकता है।"
            )

        if "bottleneck" in category:
            return f"सावधान। {zone_name} पर बॉटलनेक की स्थिति बनी है।"

        if "counterflow" in category:
            return f"सावधान। {zone_name} पर विपरीत दिशा में भीड़ का प्रवाह देखा गया है।"

        if "rapid" in category or "accumulation" in category:
            return f"चेतावनी। {zone_name} पर भीड़ तेज़ी से बढ़ रही है।"

        if occ_pct is not None:
            return f"सावधान। {zone_name} पर भीड़ का घनत्व अधिक है। वर्तमान ऑक्यूपेंसी {occ_pct} प्रतिशत है।"

        return f"सावधान। {zone_name} पर भीड़ का घनत्व अधिक है।"

    # ── Text-to-Speech Synthesis ─────────────────────────────────────
    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        model_id: Optional[str] = None,
    ) -> bytes:
        """Synthesize text into MP3 audio via ElevenLabs TTS API with local deduplication caching."""
        clean_text = text.strip()
        if not clean_text:
            raise ElevenLabsError("Announcement text cannot be empty", status_code=400)

        settings = get_settings()
        if not self.is_enabled:
            raise ElevenLabsError("ElevenLabs voice alert integration is disabled", status_code=503)

        api_key = settings.elevenlabs_api_key.strip()
        if not api_key:
            raise ElevenLabsError("ElevenLabs API key is not configured on the backend", status_code=503)

        effective_voice_id = (voice_id or settings.elevenlabs_voice_id).strip()
        effective_model_id = (model_id or settings.elevenlabs_model_id).strip()
        output_format = settings.elevenlabs_output_format.strip()

        # Check in-memory cache
        cache_key = hashlib.sha256(
            f"{effective_voice_id}:{effective_model_id}:{output_format}:{clean_text}".encode("utf-8")
        ).hexdigest()

        now = time.time()
        cached = self._cache.get(cache_key)
        if cached:
            audio_bytes, timestamp = cached
            if now - timestamp < self._cache_ttl_sec:
                logger.debug("Serving audio from synthesis cache", cache_key=cache_key[:8])
                return audio_bytes

        url = f"https://api.elevenlabs.io/v1/text-to-speech/{effective_voice_id}"
        headers = {
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        }
        params = {"output_format": output_format}
        payload = {
            "text": clean_text,
            "model_id": effective_model_id,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }

        t0 = time.perf_counter()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(url, headers=headers, params=params, json=payload)

            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)

            if response.status_code == 200:
                audio_bytes = response.content
                if not audio_bytes or len(audio_bytes) < 10:
                    raise ElevenLabsError(
                        "Received empty audio payload from ElevenLabs",
                        status_code=502,
                    )
                self._cache[cache_key] = (audio_bytes, now)
                logger.info(
                    "Synthesized audio successfully",
                    voice_id=effective_voice_id,
                    bytes_len=len(audio_bytes),
                    elapsed_ms=elapsed_ms,
                )
                return audio_bytes

            status_code = response.status_code
            err_text = response.text[:300]
            logger.warning(
                "ElevenLabs API returned error",
                status_code=status_code,
                error_snippet=err_text,
                elapsed_ms=elapsed_ms,
            )

            if status_code in (401, 403):
                raise ElevenLabsError(
                    "ElevenLabs authentication failed. Please verify API key.",
                    status_code=502,
                    detail=err_text,
                )
            elif status_code == 429:
                raise ElevenLabsError(
                    "ElevenLabs rate limit exceeded. Please retry shortly.",
                    status_code=429,
                    detail=err_text,
                )
            else:
                raise ElevenLabsError(
                    f"ElevenLabs TTS service returned HTTP {status_code}",
                    status_code=502,
                    detail=err_text,
                )

        except httpx.TimeoutException as exc:
            elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 1)
            logger.error("ElevenLabs TTS request timed out", elapsed_ms=elapsed_ms)
            raise ElevenLabsError("ElevenLabs TTS request timed out", status_code=504) from exc
        except httpx.RequestError as exc:
            logger.error("Network communication failure with ElevenLabs API", error=str(exc))
            raise ElevenLabsError(f"Network error connecting to ElevenLabs: {str(exc)}", status_code=503) from exc


elevenlabs_service = ElevenLabsService()
