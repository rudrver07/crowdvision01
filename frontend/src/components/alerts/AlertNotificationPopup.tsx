import React from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Radio,
  Volume2,
  VolumeX,
  Play,
  RotateCcw,
  CheckCircle2,
  Clock,
  MapPin,
  Users,
  Gauge,
  Activity,
  X,
  ChevronRight,
  Loader2,
  FileText,
} from 'lucide-react';
import { AlertItem } from '../../types';

export type VoiceState = 'generating' | 'playing' | 'ready' | 'failed' | 'muted';

interface AlertNotificationPopupProps {
  alert: AlertItem | null;
  taskName: string;
  voiceState: VoiceState;
  isAutoplayBlocked: boolean;
  isMuted: boolean;
  onPlayVoice: () => void;
  onReplayVoice: () => void;
  onToggleMute: () => void;
  onAcknowledge: (alertId: string) => void;
  onViewDetails: (alert: AlertItem) => void;
  onDismiss: () => void;
}

export const AlertNotificationPopup: React.FC<AlertNotificationPopupProps> = ({
  alert,
  taskName,
  voiceState,
  isAutoplayBlocked,
  isMuted,
  onPlayVoice,
  onReplayVoice,
  onToggleMute,
  onAcknowledge,
  onViewDetails,
  onDismiss,
}) => {
  if (!alert) return null;

  const severity = alert.severity.toUpperCase();
  const isCritical = severity === 'CRITICAL';
  const isHigh = severity === 'HIGH';
  const isMedium = severity === 'MEDIUM' || severity === 'MODERATE';

  const measurements = alert.supporting_measurements || {};
  const peopleCount = measurements.people_count ?? 0;
  const capacity = measurements.capacity ?? 50;
  const occRatio = measurements.occupancy_ratio ?? 0;
  const occPct = Math.round(occRatio * 100);
  const densityValue = measurements.density_value ?? 0;
  const riskScore = measurements.risk_score ?? (isCritical ? 92 : isHigh ? 78 : 55);
  const recommendedAction =
    measurements.recommended_action ||
    (isCritical
      ? 'Dispatch platform marshals immediately to train coach doorways and hold boarding flow.'
      : isHigh
      ? 'Deploy station attendants to regulate coach queue ingress.'
      : 'Monitor zone flow dynamics and broadcast passenger queue advisories.');

  // Visual theming based on severity
  const borderClass = isCritical
    ? 'border-red-500/80 shadow-2xl shadow-red-500/30 bg-gradient-to-br from-red-950/95 via-slate-900/95 to-[#070B14]/95'
    : isHigh
    ? 'border-amber-500/80 shadow-2xl shadow-amber-500/25 bg-gradient-to-br from-amber-950/90 via-slate-900/95 to-[#070B14]/95'
    : isMedium
    ? 'border-yellow-500/70 shadow-xl shadow-yellow-500/20 bg-gradient-to-br from-yellow-950/80 via-slate-900/95 to-[#070B14]/95'
    : 'border-cyan-500/60 shadow-lg shadow-cyan-500/10 bg-slate-900/95';

  const badgeClass = isCritical
    ? 'bg-red-500/20 text-red-300 border-red-500/40 animate-pulse'
    : isHigh
    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    : isMedium
    ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
    : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';

  const formattedTime = alert.created_at
    ? new Date(alert.created_at).toLocaleTimeString()
    : new Date().toLocaleTimeString();

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-lg w-[calc(100vw-3rem)] sm:w-[480px] animate-slide-up select-none">
      <div className={`rounded-2xl border p-4 sm:p-5 backdrop-blur-xl transition-all duration-300 ${borderClass}`}>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center space-x-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                isCritical
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse'
                  : isHigh
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              }`}
            >
              {isCritical ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-mono tracking-widest font-black uppercase text-cyan-400">
                  {taskName || 'Railway Test'}
                </span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${badgeClass}`}>
                  {severity}
                </span>
                {alert.status && alert.status !== 'ACTIVE' && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                    {alert.status}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight mt-0.5 line-clamp-1">
                {alert.title}
              </h3>
            </div>
          </div>

          {/* Dismiss Close Control */}
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
            title="Dismiss notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Zone & Location */}
        <div className="flex items-center justify-between text-xs text-slate-300 font-mono mt-3 px-0.5">
          <div className="flex items-center space-x-1.5 text-cyan-300 font-semibold truncate max-w-[280px]">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            <span className="truncate">{alert.zone_name || 'Designated Platform Zone'}</span>
          </div>
          <div className="flex items-center space-x-1 text-slate-400 text-[11px] shrink-0">
            <Clock className="h-3 w-3" />
            <span>{formattedTime}</span>
            {alert.video_timestamp_sec !== undefined && (
              <span className="text-slate-500">({alert.video_timestamp_sec.toFixed(1)}s)</span>
            )}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 mt-3 font-mono">
          <div className="p-2 rounded-xl bg-[#070B14]/80 border border-slate-800/90 flex flex-col">
            <span className="text-[9px] text-slate-400 uppercase flex items-center space-x-1">
              <Users className="h-2.5 w-2.5 text-cyan-400" />
              <span>Crowd Count</span>
            </span>
            <div className="text-sm font-bold text-white mt-0.5">
              {peopleCount} <span className="text-[10px] text-slate-500 font-normal">/ {capacity}</span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#070B14]/80 border border-slate-800/90 flex flex-col">
            <span className="text-[9px] text-slate-400 uppercase flex items-center space-x-1">
              <Gauge className="h-2.5 w-2.5 text-amber-400" />
              <span>Density</span>
            </span>
            <div className={`text-sm font-bold mt-0.5 ${occPct >= 90 ? 'text-red-400' : occPct >= 70 ? 'text-amber-400' : 'text-cyan-400'}`}>
              {occPct}% <span className="text-[9px] text-slate-500 font-normal">({densityValue.toFixed(1)})</span>
            </div>
          </div>

          <div className="p-2 rounded-xl bg-[#070B14]/80 border border-slate-800/90 flex flex-col">
            <span className="text-[9px] text-slate-400 uppercase flex items-center space-x-1">
              <Activity className="h-2.5 w-2.5 text-rose-400" />
              <span>Risk Score</span>
            </span>
            <div className={`text-sm font-bold mt-0.5 ${riskScore >= 80 ? 'text-red-400' : riskScore >= 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {riskScore} <span className="text-[9px] text-slate-500 font-normal">/ 100</span>
            </div>
          </div>
        </div>

        {/* Recommended Action Callout */}
        <div className="mt-3 p-2.5 rounded-xl bg-[#070B14]/90 border border-slate-800/80 text-xs">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center space-x-1 mb-1">
            <span>Recommended Response:</span>
          </div>
          <p className="text-slate-200 text-[11px] leading-relaxed">
            {recommendedAction}
          </p>
        </div>

        {/* Voice Playback & Autoplay Status Strip */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          {/* Left: ElevenLabs State Pill */}
          <div className="flex items-center space-x-1.5 text-xs font-mono">
            {voiceState === 'generating' ? (
              <span className="flex items-center space-x-1.5 text-cyan-400 bg-cyan-950/60 border border-cyan-800/60 px-2 py-0.5 rounded-lg text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                <span>Generating voice...</span>
              </span>
            ) : voiceState === 'playing' ? (
              <span className="flex items-center space-x-1.5 text-cyan-300 bg-cyan-500/20 border border-cyan-500/40 px-2 py-0.5 rounded-lg text-[10px] animate-pulse">
                <Radio className="h-3 w-3 animate-spin text-cyan-400" />
                <span>Playing announcement</span>
              </span>
            ) : isMuted || voiceState === 'muted' ? (
              <span className="flex items-center space-x-1.5 text-slate-400 bg-slate-800/60 border border-slate-700/60 px-2 py-0.5 rounded-lg text-[10px]">
                <VolumeX className="h-3 w-3 text-slate-400" />
                <span>Muted</span>
              </span>
            ) : voiceState === 'failed' ? (
              <span className="flex items-center space-x-1.5 text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-lg text-[10px]">
                <AlertTriangle className="h-3 w-3 text-amber-400" />
                <span>Voice generation failed</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-lg text-[10px]">
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span>Voice ready</span>
              </span>
            )}
          </div>

          {/* Right: Audio Action Buttons (Play / Replay / Mute) */}
          <div className="flex items-center space-x-1.5">
            {/* Browser Autoplay Blocked Play Button */}
            {isAutoplayBlocked && (
              <button
                type="button"
                onClick={onPlayVoice}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-[10px] font-mono shadow-md shadow-cyan-500/30 transition-all animate-bounce"
                title="Click to play announcement audio"
              >
                <Play className="h-3 w-3 fill-current" />
                <span>Play Voice</span>
              </button>
            )}

            {/* Replay Announcement Button */}
            {!isAutoplayBlocked && (
              <button
                type="button"
                onClick={onReplayVoice}
                className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-[10px] font-mono transition-colors"
                title="Replay voice announcement"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Replay</span>
              </button>
            )}

            {/* Mute / Unmute Control */}
            <button
              type="button"
              onClick={onToggleMute}
              className={`p-1.5 rounded-lg border text-[10px] transition-colors ${
                isMuted
                  ? 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
              }`}
              title={isMuted ? 'Unmute voice announcements' : 'Mute voice announcements'}
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Bottom Actions Row: Acknowledge & View Details */}
        <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-xs font-mono">
          <button
            type="button"
            onClick={() => onAcknowledge(alert.id)}
            disabled={alert.status === 'ACKNOWLEDGED' || alert.status === 'RESOLVED'}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white font-semibold text-[11px] shadow-sm disabled:opacity-50 transition-all"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{alert.status === 'ACKNOWLEDGED' ? 'Acknowledged' : 'Acknowledge'}</span>
          </button>

          <button
            type="button"
            onClick={() => onViewDetails(alert)}
            className="flex items-center space-x-1 text-slate-300 hover:text-cyan-400 text-[11px] font-medium transition-colors"
          >
            <span>Full Details & History</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
