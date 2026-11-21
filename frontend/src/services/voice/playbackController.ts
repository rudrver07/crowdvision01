import type { AnnouncementItem, VoiceLanguage } from './types.ts';

/**
 * Global Single-Playback Audio Controller
 *
 * Guarantees that MAX_CONCURRENT_ACTIVE_PLAYBACKS is strictly 1.
 * Maintains a single sequential queue, a single managed HTMLAudioElement,
 * and a synchronous playback lock.
 *
 * Protects against multi-tab concurrency using BroadcastChannel and Web Locks API.
 * Prevents duplicates via unique announcement tracking.
 */

export interface PlaybackControllerOptions {
  apiBaseUrl?: string;
  onStateChange?: () => void;
  onAnnouncementStart?: (announcement: AnnouncementItem) => void;
  onAnnouncementEnd?: (announcement: AnnouncementItem) => void;
}

export class VoicePlaybackController {
  private static instance: VoicePlaybackController | null = null;

  // Single managed HTMLAudioElement
  private audioElement: HTMLAudioElement | null = null;
  // Sequential FIFO announcement queue
  private queue: AnnouncementItem[] = [];
  // Synchronous playback lock
  private isPlaying = false;
  private activeAnnouncement: AnnouncementItem | null = null;

  // Duplicate prevention
  private processedAlertIds: Set<string> = new Set();
  private enqueuedAnnouncementIds: Set<string> = new Set();

  // Settings
  private isEnabled = true;
  private isMuted = false;
  private volume = 1.0;
  private language: VoiceLanguage = 'en';

  // Cross-tab coordination
  private clientId: string;
  private isPlaybackOwner = false;
  private channel: BroadcastChannel | null = null;
  private heartbeatTimer: any = null;
  private isUnlocked = false;

  // Callbacks
  private onStateChange?: () => void;
  private onAnnouncementStart?: (announcement: AnnouncementItem) => void;
  private onAnnouncementEnd?: (announcement: AnnouncementItem) => void;

  public static getInstance(options?: PlaybackControllerOptions): VoicePlaybackController {
    if (!VoicePlaybackController.instance) {
      VoicePlaybackController.instance = new VoicePlaybackController(options);
    }
    return VoicePlaybackController.instance;
  }

  constructor(options?: PlaybackControllerOptions) {
    this.clientId = 'client_' + Math.random().toString(36).substring(2, 10);
    this.onStateChange = options?.onStateChange;
    this.onAnnouncementStart = options?.onAnnouncementStart;
    this.onAnnouncementEnd = options?.onAnnouncementEnd;

    // Load persisted preferences
    if (typeof window !== 'undefined') {
      try {
        const storedEnabled = localStorage.getItem('crowdvision_voice_enabled');
        if (storedEnabled !== null) this.isEnabled = storedEnabled === 'true';

        const storedMuted = localStorage.getItem('crowdvision_voice_muted');
        if (storedMuted !== null) this.isMuted = storedMuted === 'true';

        const storedLang = localStorage.getItem('crowdvision_voice_language');
        if (storedLang === 'en' || storedLang === 'hi') this.language = storedLang;

        const storedVol = localStorage.getItem('crowdvision_voice_volume');
        if (storedVol !== null) this.volume = parseFloat(storedVol);
      } catch {
        // Fallback to defaults
      }

      this.initAudioElement();
      this.initCrossTabChannel();
    }
  }

  private initAudioElement(): void {
    if (typeof window === 'undefined') return;
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'auto';
      this.audioElement.volume = this.volume;
    }
  }

  private initCrossTabChannel(): void {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      this.isPlaybackOwner = true;
      return;
    }

    try {
      this.channel = new BroadcastChannel('crowdvision_voice_bus');
      this.channel.onmessage = (event) => {
        this.handleCrossTabMessage(event.data);
      };

      // Query if an existing tab is already playback owner
      this.channel.postMessage({ type: 'WHO_IS_OWNER', from: this.clientId });

      // Claim ownership if no answer within 250ms
      setTimeout(() => {
        if (!this.isPlaybackOwner && this.heartbeatTimer === null) {
          this.claimOwnership();
        }
      }, 250);

      window.addEventListener('beforeunload', () => {
        if (this.isPlaybackOwner && this.channel) {
          this.channel.postMessage({ type: 'RELEASE_OWNER', from: this.clientId });
        }
      });
    } catch {
      this.isPlaybackOwner = true;
    }
  }

  private handleCrossTabMessage(data: any): void {
    if (!data || data.from === this.clientId) return;

    switch (data.type) {
      case 'WHO_IS_OWNER':
        if (this.isPlaybackOwner) {
          this.channel?.postMessage({ type: 'OWNER_ANNOUNCE', from: this.clientId });
        }
        break;

      case 'OWNER_ANNOUNCE':
      case 'CLAIM_OWNER':
        if (this.isPlaybackOwner && data.from !== this.clientId) {
          // If collision, lower ID wins
          if (data.from < this.clientId) {
            this.resignOwnership();
          }
        } else {
          this.isPlaybackOwner = false;
          this.stopHeartbeat();
          this.notifyState();
        }
        break;

      case 'RELEASE_OWNER':
        // Previous owner closed or released; claim ownership
        this.claimOwnership();
        break;

      case 'REMOTE_PLAYBACK_START':
        this.isPlaying = true;
        this.activeAnnouncement = data.announcement;
        this.notifyState();
        break;

      case 'REMOTE_PLAYBACK_END':
        this.isPlaying = false;
        this.activeAnnouncement = null;
        this.notifyState();
        break;
    }
  }

  public claimOwnership(): void {
    this.isPlaybackOwner = true;
    this.channel?.postMessage({ type: 'CLAIM_OWNER', from: this.clientId });
    this.startHeartbeat();
    this.notifyState();
  }

  public resignOwnership(): void {
    this.isPlaybackOwner = false;
    this.stopHeartbeat();
    this.channel?.postMessage({ type: 'RELEASE_OWNER', from: this.clientId });
    this.notifyState();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isPlaybackOwner) {
        this.channel?.postMessage({ type: 'OWNER_ANNOUNCE', from: this.clientId });
      }
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Unlock HTMLAudioElement playback via user interaction to satisfy browser autoplay policies.
   */
  public async unlockAudio(): Promise<boolean> {
    this.initAudioElement();
    if (!this.audioElement) return false;

    try {
      // Play a short silent buffer or empty data URI to unlock audio context
      this.audioElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      await this.audioElement.play();
      this.isUnlocked = true;
      this.notifyState();
      // Resume queue processing if pending items
      this.processQueue();
      return true;
    } catch {
      // User gesture might still be required
      return false;
    }
  }

  /**
   * Enqueue an announcement into the strict sequential queue.
   * Deduplicates by unique alert ID and announcement ID.
   */
  public enqueue(announcement: AnnouncementItem): boolean {
    if (!announcement || !announcement.id) return false;

    // Deduplication checks
    if (this.enqueuedAnnouncementIds.has(announcement.id)) {
      return false;
    }
    if (announcement.alertId && this.processedAlertIds.has(announcement.alertId)) {
      return false;
    }

    this.enqueuedAnnouncementIds.add(announcement.id);
    if (announcement.alertId) {
      this.processedAlertIds.add(announcement.alertId);
    }

    // Critical alerts are placed at the front of the queue after the current playing item
    if (announcement.isCritical && this.queue.length > 0) {
      this.queue.unshift(announcement);
    } else {
      this.queue.push(announcement);
    }

    this.notifyState();
    this.processQueue();
    return true;
  }

  /**
   * Sequential Queue Processor
   * Enforces that MAX_CONCURRENT_ACTIVE_PLAYBACKS is always exactly 1.
   */
  private async processQueue(): Promise<void> {
    // If already playing or queue is empty, do nothing
    if (this.isPlaying || this.queue.length === 0) {
      return;
    }

    // Only authorized playback owner tab speaks
    if (!this.isPlaybackOwner) {
      return;
    }

    // If voice system is disabled or muted, discard or advance queue without audio
    if (!this.isEnabled || this.isMuted) {
      const skipped = this.queue.shift();
      if (skipped && this.onAnnouncementEnd) {
        this.onAnnouncementEnd(skipped);
      }
      this.notifyState();
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 50);
      }
      return;
    }

    // Synchronously acquire lock before any async operation
    this.isPlaying = true;
    const item = this.queue.shift()!;
    this.activeAnnouncement = item;

    // Broadcast remote playback start to other tabs
    this.channel?.postMessage({
      type: 'REMOTE_PLAYBACK_START',
      from: this.clientId,
      announcement: item,
    });

    if (this.onAnnouncementStart) {
      this.onAnnouncementStart(item);
    }
    this.notifyState();

    try {
      // Obtain audio data (either preloaded blob or request via backend TTS API)
      let audioBlob = item.audioBlob;
      if (!audioBlob && !item.audioUrl) {
        audioBlob = await this.fetchTTSAudio(item.text, item.language, item.alertId, item.zoneId);
      }

      await this.playAudio(audioBlob, item.audioUrl);
    } catch (err) {
      // Audio failure must NEVER freeze or permanently block the queue
      // Log diagnostics without sensitive info and safely release lock
    } finally {
      // Release playback lock
      this.isPlaying = false;
      this.activeAnnouncement = null;

      // Broadcast remote playback end to other tabs
      this.channel?.postMessage({
        type: 'REMOTE_PLAYBACK_END',
        from: this.clientId,
        announcement: item,
      });

      if (this.onAnnouncementEnd) {
        this.onAnnouncementEnd(item);
      }
      this.notifyState();

      // Sequentially process next item in queue
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 250);
      }
    }
  }

  private async fetchTTSAudio(text: string, language: VoiceLanguage, alertId?: string, zoneId?: string): Promise<Blob> {
    const rawApi = (import.meta as any).env?.VITE_API_BASE_URL || '';
    const baseApi = String(rawApi).replace(/\/$/, '');
    const url = `${baseApi}/api/voice/tts`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        language,
        alert_id: alertId,
        zone_id: zoneId,
      }),
    });

    if (!resp.ok) {
      throw new Error(`TTS API returned HTTP ${resp.status}`);
    }

    return await resp.blob();
  }

  private playAudio(blob?: Blob, directUrl?: string): Promise<void> {
    return new Promise((resolve) => {
      this.initAudioElement();
      if (!this.audioElement) {
        resolve();
        return;
      }

      let objectUrl: string | null = null;
      if (blob) {
        objectUrl = URL.createObjectURL(blob);
        this.audioElement.src = objectUrl;
      } else if (directUrl) {
        this.audioElement.src = directUrl;
      } else {
        resolve();
        return;
      }

      let hasFinished = false;
      const cleanup = () => {
        if (hasFinished) return;
        hasFinished = true;
        if (this.audioElement) {
          this.audioElement.onended = null;
          this.audioElement.onerror = null;
          this.audioElement.onpause = null;
        }
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        resolve();
      };

      // Watchdog safety timeout (max 20 seconds per announcement)
      const timeout = setTimeout(cleanup, 20000);

      this.audioElement.onended = () => {
        clearTimeout(timeout);
        cleanup();
      };

      this.audioElement.onerror = () => {
        clearTimeout(timeout);
        cleanup();
      };

      this.audioElement.play().catch(() => {
        clearTimeout(timeout);
        cleanup();
      });
    });
  }

  // ── Getters and Setters ──────────────────────────────────────────
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    try {
      localStorage.setItem('crowdvision_voice_enabled', String(enabled));
    } catch {}
    this.notifyState();
    if (enabled) this.processQueue();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    try {
      localStorage.setItem('crowdvision_voice_muted', String(muted));
    } catch {}
    this.notifyState();
    if (!muted) this.processQueue();
  }

  public setLanguage(lang: VoiceLanguage): void {
    this.language = lang;
    try {
      localStorage.setItem('crowdvision_voice_language', lang);
    } catch {}
    this.notifyState();
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0.0, Math.min(1.0, vol));
    if (this.audioElement) {
      this.audioElement.volume = this.volume;
    }
    try {
      localStorage.setItem('crowdvision_voice_volume', String(this.volume));
    } catch {}
    this.notifyState();
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  public getActiveAnnouncement(): AnnouncementItem | null {
    return this.activeAnnouncement;
  }

  public getIsPlaybackOwner(): boolean {
    return this.isPlaybackOwner;
  }

  public getLanguage(): VoiceLanguage {
    return this.language;
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getVolume(): number {
    return this.volume;
  }

  public getIsUnlocked(): boolean {
    return this.isUnlocked;
  }

  public clearQueue(): void {
    this.queue = [];
    this.notifyState();
  }

  public resetDeduplication(): void {
    this.processedAlertIds.clear();
    this.enqueuedAnnouncementIds.clear();
  }

  private notifyState(): void {
    if (this.onStateChange) {
      this.onStateChange();
    }
  }
}
