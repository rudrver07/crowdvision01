import { AlertAggregator } from './alertAggregator.ts';
import { formatOperationalAnnouncement } from './announcementFormatter.ts';
import { VoicePlaybackController } from './playbackController.ts';
import type { AnnouncementItem, VoiceLanguage, VoiceSystemState } from './types.ts';
import { wsClient } from '../websocket.ts';

/**
 * Unified Voice Alert Orchestrator Service
 *
 * Bridges the real-time alert event stream, 17-second aggregation,
 * operational natural language synthesis, and the single-playback controller.
 */

export class VoiceAlertService {
  private static instance: VoiceAlertService | null = null;

  private aggregator: AlertAggregator;
  private controller: VoicePlaybackController;

  // Single subscription guard
  private isSubscribed = false;
  private wsUnsubscribe: (() => void) | null = null;

  // Duplicate delivery and reconnection tracking
  private ingestedAlertIds: Set<string> = new Set();
  private maxIngestedHistory = 1000;

  // UI state listeners
  private stateListeners: Set<(state: VoiceSystemState) => void> = new Set();

  public static getInstance(): VoiceAlertService {
    if (!VoiceAlertService.instance) {
      VoiceAlertService.instance = new VoiceAlertService();
    }
    return VoiceAlertService.instance;
  }

  constructor() {
    this.controller = VoicePlaybackController.getInstance({
      onStateChange: () => this.notifyListeners(),
      onAnnouncementStart: (ann) => {
        this.notifyListeners();
      },
      onAnnouncementEnd: (ann) => {
        this.notifyListeners();
      },
    });

    this.aggregator = new AlertAggregator({
      windowMs: 17000,
      onBatchFinalized: (selectedAlerts) => this.handleBatchFinalized(selectedAlerts),
      onStateChange: () => this.notifyListeners(),
    });

    // Auto-subscribe once to the global WebSocket event stream
    this.initSubscription();
  }

  public initSubscription(): void {
    if (this.isSubscribed) return;
    this.isSubscribed = true;

    this.wsUnsubscribe = wsClient.subscribe((data: any) => {
      if (!data) return;

      // Check for incoming alerts in frame or telemetry updates
      if (Array.isArray(data.alerts) && data.alerts.length > 0) {
        for (const alert of data.alerts) {
          this.handleIncomingAlert(alert);
        }
      } else if (data.alert) {
        this.handleIncomingAlert(data.alert);
      }
    });
  }

  public teardown(): void {
    if (this.wsUnsubscribe) {
      this.wsUnsubscribe();
      this.wsUnsubscribe = null;
    }
    this.isSubscribed = false;
    this.aggregator.reset();
  }

  public markAsAlreadyProcessed(alertId: string): void {
    if (alertId) {
      this.ingestedAlertIds.add(String(alertId));
    }
  }

  /**
   * Handle incoming alert from WebSocket, polling, or manual trigger.
   * Performs early deduplication before passing to 17-second aggregator.
   */
  public handleIncomingAlert(alert: any): void {
    if (!alert) return;

    // Derive stable alert identifier
    const alertId = String(
      alert.id ||
      alert.alert_id ||
      `${alert.event_id || 'evt'}-${alert.zone_id || alert.zone_name}-${alert.video_timestamp_sec || 0}-${alert.severity || ''}`
    );

    // Prevent duplicate processing from repeated WebSocket events or reconnects
    if (this.ingestedAlertIds.has(alertId)) {
      return;
    }

    this.ingestedAlertIds.add(alertId);
    if (this.ingestedAlertIds.size > this.maxIngestedHistory) {
      const first = this.ingestedAlertIds.values().next().value;
      if (first) this.ingestedAlertIds.delete(first);
    }

    // Pass to 17-second aggregation window
    this.aggregator.ingest(alert);
  }

  /**
   * Called when the 17-second aggregation window has finalized.
   * Enqueues the selected latest-per-zone announcements sequentially.
   */
  private handleBatchFinalized(selectedAlerts: any[]): void {
    const language = this.controller.getLanguage();

    for (const alert of selectedAlerts) {
      const zoneId = String(alert.zone_id || alert.zoneId || alert.zone_name || 'zone').trim();
      const zoneName = String(alert.zone_name || alert.zoneName || 'Designated Zone').trim();
      const severity = String(alert.severity || 'HIGH').toUpperCase();
      const category = String(alert.category || 'occupancy_warning').toLowerCase();
      const isCritical = severity === 'CRITICAL' || category === 'critical_density';

      const alertId = String(alert.id || alert.alert_id || `${zoneId}-${Date.now()}`);
      const spokenText = formatOperationalAnnouncement(alert, language);

      const announcement: AnnouncementItem = {
        id: `ann_${alertId}_${Date.now()}`,
        alertId,
        eventId: alert.event_id,
        zoneId,
        zoneName,
        severity,
        category,
        text: spokenText,
        language,
        timestamp: Date.now(),
        isCritical,
      };

      this.controller.enqueue(announcement);
    }

    this.notifyListeners();
  }

  // ── Public Controls ──────────────────────────────────────────────
  public toggleMute(): void {
    const current = this.controller.getIsMuted();
    this.controller.setMuted(!current);
    this.notifyListeners();
  }

  public setMuted(muted: boolean): void {
    this.controller.setMuted(muted);
    this.notifyListeners();
  }

  public setEnabled(enabled: boolean): void {
    this.controller.setEnabled(enabled);
    this.notifyListeners();
  }

  public setLanguage(lang: VoiceLanguage): void {
    this.controller.setLanguage(lang);
    this.notifyListeners();
  }

  public setVolume(vol: number): void {
    this.controller.setVolume(vol);
    this.notifyListeners();
  }

  public async unlockAudio(): Promise<boolean> {
    const res = await this.controller.unlockAudio();
    this.notifyListeners();
    return res;
  }

  public claimOwnership(): void {
    this.controller.claimOwnership();
    this.notifyListeners();
  }

  public getState(): VoiceSystemState {
    const aggStatus = this.aggregator.getStatus();
    return {
      isEnabled: this.controller.getIsEnabled(),
      isMuted: this.controller.getIsMuted(),
      language: this.controller.getLanguage(),
      volume: this.controller.getVolume(),
      isCollecting: aggStatus.isCollecting,
      collectionTimeRemainingMs: aggStatus.remainingMs,
      collectionWindowSec: 17,
      queueLength: this.controller.getQueueLength(),
      isPlaying: this.controller.isCurrentlyPlaying(),
      currentAnnouncement: this.controller.getActiveAnnouncement(),
      isPlaybackOwner: this.controller.getIsPlaybackOwner(),
      audioUnlocked: this.controller.getIsUnlocked(),
      lastError: null,
    };
  }

  public subscribeToState(listener: (state: VoiceSystemState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const state = this.getState();
    this.stateListeners.forEach((l) => l(state));
  }
}

export const voiceAlertService = VoiceAlertService.getInstance();
