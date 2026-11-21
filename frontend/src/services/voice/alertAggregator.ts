/**
 * Seventeen-Second Alert Aggregator
 *
 * Implements a fixed 17-second collection window beginning with the first incoming alert.
 * Groups alerts by stable zone ID (or normalized zone name), maintaining first-seen zone order.
 * Replaces pending announcements with the latest alert per zone, preserving critical escalations.
 * Does NOT reset the timer on subsequent arrivals.
 */

export interface AggregatorOptions {
  windowMs?: number;
  onBatchFinalized: (selectedAlerts: any[]) => void;
  onStateChange?: (isCollecting: boolean, remainingMs: number) => void;
}

export class AlertAggregator {
  private windowMs: number;
  private onBatchFinalized: (selectedAlerts: any[]) => void;
  private onStateChange?: (isCollecting: boolean, remainingMs: number) => void;

  private isCollecting = false;
  private windowStartTime = 0;
  private timer: any = null;
  private tickInterval: any = null;

  // Track original first-seen zone ordering
  private firstSeenZoneOrder: string[] = [];
  // Latest alert per zone (keyed by normalized zone identifier)
  private pendingByZone: Map<string, any> = new Map();
  // Preserve critical escalation flags per zone
  private criticalEscalations: Set<string> = new Set();

  constructor(options: AggregatorOptions) {
    this.windowMs = options.windowMs ?? 17000;
    this.onBatchFinalized = options.onBatchFinalized;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Ingest an incoming real-time alert into the 17-second collection window.
   */
  public ingest(alert: any): void {
    if (!alert) return;

    // Resolve normalized stable zone identifier
    const zoneKey = this.resolveZoneKey(alert);

    // If no active collection window, start fixed 17-second timer
    if (!this.isCollecting) {
      this.isCollecting = true;
      this.windowStartTime = Date.now();
      this.firstSeenZoneOrder = [];
      this.pendingByZone.clear();
      this.criticalEscalations.clear();

      this.timer = setTimeout(() => {
        this.finalize();
      }, this.windowMs);

      if (this.onStateChange) {
        this.onStateChange(true, this.windowMs);
        this.startTick();
      }
    }

    // Maintain first-seen zone ordering
    if (!this.pendingByZone.has(zoneKey)) {
      this.firstSeenZoneOrder.push(zoneKey);
    }

    // Check if new alert is CRITICAL or zone was previously marked CRITICAL in this window
    const isCrit = String(alert.severity || '').toUpperCase() === 'CRITICAL' ||
                   String(alert.category || '').toLowerCase() === 'critical_density';
    if (isCrit) {
      this.criticalEscalations.add(zoneKey);
    }

    // Create copy with critical escalation preserved
    const updatedAlert = { ...alert };
    if (this.criticalEscalations.has(zoneKey)) {
      updatedAlert.severity = 'CRITICAL';
      updatedAlert.isCritical = true;
    }

    // Replace with latest alert for this zone
    this.pendingByZone.set(zoneKey, updatedAlert);
  }

  /**
   * Finalize the 17-second batch and output exactly one announcement per zone in first-seen order.
   */
  public finalize(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stopTick();

    const selected: any[] = [];
    for (const zoneKey of this.firstSeenZoneOrder) {
      const alert = this.pendingByZone.get(zoneKey);
      if (alert) {
        selected.push(alert);
      }
    }

    // Reset aggregation state for subsequent arrivals
    this.isCollecting = false;
    this.windowStartTime = 0;
    this.firstSeenZoneOrder = [];
    this.pendingByZone.clear();
    this.criticalEscalations.clear();

    if (this.onStateChange) {
      this.onStateChange(false, 0);
    }

    if (selected.length > 0) {
      this.onBatchFinalized(selected);
    }
  }

  public getStatus(): { isCollecting: boolean; remainingMs: number; pendingCount: number } {
    if (!this.isCollecting) {
      return { isCollecting: false, remainingMs: 0, pendingCount: 0 };
    }
    const elapsed = Date.now() - this.windowStartTime;
    const remaining = Math.max(0, this.windowMs - elapsed);
    return {
      isCollecting: true,
      remainingMs: remaining,
      pendingCount: this.pendingByZone.size,
    };
  }

  public reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.stopTick();
    this.isCollecting = false;
    this.windowStartTime = 0;
    this.firstSeenZoneOrder = [];
    this.pendingByZone.clear();
    this.criticalEscalations.clear();
    if (this.onStateChange) {
      this.onStateChange(false, 0);
    }
  }

  private resolveZoneKey(alert: any): string {
    const rawId = alert.zone_id || alert.zoneId;
    if (rawId && String(rawId).trim()) {
      return String(rawId).trim();
    }
    const rawName = alert.zone_name || alert.zoneName;
    if (rawName && String(rawName).trim()) {
      return String(rawName).trim().toLowerCase().replace(/\s+/g, '_');
    }
    return 'default_zone';
  }

  private startTick(): void {
    this.stopTick();
    this.tickInterval = setInterval(() => {
      if (!this.isCollecting) {
        this.stopTick();
        return;
      }
      const elapsed = Date.now() - this.windowStartTime;
      const remaining = Math.max(0, this.windowMs - elapsed);
      if (this.onStateChange) {
        this.onStateChange(true, remaining);
      }
    }, 500);
  }

  private stopTick(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }
}
