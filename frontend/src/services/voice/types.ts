export type VoiceLanguage = 'en' | 'hi';

export interface VoiceStatus {
  enabled: boolean;
  configured: boolean;
  voice_id: string;
  model_id: string;
  output_format: string;
  active_lease_owner?: string | null;
  cached_audio_items?: number;
}

export interface AnnouncementItem {
  id: string;
  alertId: string;
  eventId?: string;
  zoneId: string;
  zoneName: string;
  severity: string;
  category: string;
  occupancyPct?: number;
  text: string;
  language: VoiceLanguage;
  timestamp: number;
  isCritical: boolean;
  audioBlob?: Blob;
  audioUrl?: string;
}

export interface VoiceSystemState {
  isEnabled: boolean;
  isMuted: boolean;
  language: VoiceLanguage;
  volume: number;
  isCollecting: boolean;
  collectionTimeRemainingMs: number;
  collectionWindowSec: number;
  queueLength: number;
  isPlaying: boolean;
  currentAnnouncement: AnnouncementItem | null;
  isPlaybackOwner: boolean;
  audioUnlocked: boolean;
  lastError: string | null;
}
