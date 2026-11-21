import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Clock,
  MapPin,
  Users,
  Gauge,
  Activity,
  Filter,
  Check,
  Search,
  Volume2,
} from 'lucide-react';
import { AlertItem } from '../../types';

interface AlertHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: AlertItem[];
  taskName: string;
  onAcknowledgeAlert: (alertId: string) => Promise<void>;
  onResolveAlert: (alertId: string) => Promise<void>;
  onPlayAlertVoice: (alert: AlertItem) => void;
}

export const AlertHistoryModal: React.FC<AlertHistoryModalProps> = ({
  isOpen,
  onClose,
  alerts,
  taskName,
  onAcknowledgeAlert,
  onResolveAlert,
  onPlayAlertVoice,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const filteredAlerts = alerts.filter((a) => {
    if (filterSeverity !== 'ALL' && a.severity.toUpperCase() !== filterSeverity.toUpperCase()) {
      return false;
    }
    if (filterStatus !== 'ALL' && a.status.toUpperCase() !== filterStatus.toUpperCase()) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = a.title.toLowerCase().includes(q);
      const matchZone = (a.zone_name || '').toLowerCase().includes(q);
      const matchDesc = a.description.toLowerCase().includes(q);
      if (!matchTitle && !matchZone && !matchDesc) return false;
    }
    return true;
  });

  const handleAck = async (id: string) => {
    setActionPendingId(id);
    try {
      await onAcknowledgeAlert(id);
    } finally {
      setActionPendingId(null);
    }
  };

  const handleResolve = async (id: string) => {
    setActionPendingId(id);
    try {
      await onResolveAlert(id);
    } finally {
      setActionPendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-[#0B1120] border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#070B14]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {taskName || 'Railway Test'} — Persistent Alert History
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  {alerts.length} Total Logged
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Persistent database records of threshold breaches, crowd anomalies, and voice notifications.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 border-b border-slate-800/80 bg-[#070B14]/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search alert title, zone, description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B1120] border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center space-x-1 p-1 rounded-lg bg-[#0B1120] border border-slate-800">
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  filterSeverity === sev
                    ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-1 p-1 rounded-lg bg-[#0B1120] border border-slate-800">
            {['ALL', 'ACTIVE', 'ACKNOWLEDGED', 'RESOLVED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                  filterStatus === st
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Alerts List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs font-mono flex flex-col items-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-400/80 mb-2" />
              <span>No alerts found matching the current search criteria.</span>
            </div>
          ) : (
            filteredAlerts.map((alert) => {
              const measurements = alert.supporting_measurements || {};
              const peopleCount = measurements.people_count ?? '-';
              const capacity = measurements.capacity ?? '-';
              const occRatio = measurements.occupancy_ratio;
              const occPct = occRatio !== undefined ? Math.round(occRatio * 100) : '-';
              const riskScore = measurements.risk_score ?? (alert.severity === 'CRITICAL' ? 92 : 75);
              const recAction =
                measurements.recommended_action ||
                'Monitor zone flow dynamics and broadcast passenger queue advisories.';

              const isCrit = alert.severity === 'CRITICAL';
              const isHgh = alert.severity === 'HIGH';

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-xl border transition-all ${
                    alert.status === 'ACTIVE'
                      ? isCrit
                        ? 'bg-red-950/20 border-red-500/40'
                        : isHgh
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-[#070B14] border-slate-800'
                      : 'bg-slate-900/40 border-slate-800/40 opacity-75'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start space-x-3">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isCrit
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : isHgh
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                        }`}
                      >
                        {isCrit ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                              isCrit
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : isHgh
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                            }`}
                          >
                            {alert.severity}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                              alert.status === 'ACTIVE'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : alert.status === 'ACKNOWLEDGED'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {alert.status}
                          </span>
                          <span className="text-slate-400 font-mono text-[11px]">
                            {alert.id}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white mt-1">{alert.title}</h4>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => onPlayAlertVoice(alert)}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-800/60 text-cyan-300 text-[10px] font-mono transition-colors"
                        title="Play AI Voice Announcement for this alert"
                      >
                        <Volume2 className="h-3 w-3" />
                        <span>Play Voice</span>
                      </button>

                      {alert.status === 'ACTIVE' && (
                        <button
                          type="button"
                          onClick={() => handleAck(alert.id)}
                          disabled={actionPendingId === alert.id}
                          className="px-2.5 py-1 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-[10px] font-mono font-semibold transition-colors disabled:opacity-50"
                        >
                          Acknowledge
                        </button>
                      )}

                      {alert.status !== 'RESOLVED' && (
                        <button
                          type="button"
                          onClick={() => handleResolve(alert.id)}
                          disabled={actionPendingId === alert.id}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-[10px] font-mono font-semibold transition-colors disabled:opacity-50"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs font-mono text-slate-300 bg-[#0B1120] p-2.5 rounded-lg border border-slate-800/80">
                    <span className="flex items-center space-x-1 text-cyan-400">
                      <MapPin className="h-3 w-3" />
                      <span>{alert.zone_name || 'Railway Zone'}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Users className="h-3 w-3 text-slate-400" />
                      <span>Count: {peopleCount} / {capacity}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Gauge className="h-3 w-3 text-amber-400" />
                      <span>Density: {occPct}%</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1">
                      <Activity className="h-3 w-3 text-rose-400" />
                      <span>Risk: {riskScore}/100</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center space-x-1 text-slate-400">
                      <Clock className="h-3 w-3" />
                      <span>{alert.created_at ? new Date(alert.created_at).toLocaleString() : 'Recent'}</span>
                    </span>
                  </div>

                  {/* Recommended Action */}
                  <div className="mt-2 text-xs text-slate-300 bg-slate-900/50 p-2 rounded-lg border border-slate-800/50">
                    <span className="text-[10px] font-mono font-bold text-amber-400 uppercase mr-1.5">Action:</span>
                    <span>{recAction}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#070B14] flex items-center justify-between text-xs font-mono">
          <span className="text-slate-400">
            Showing {filteredAlerts.length} of {alerts.length} persistent alerts for {taskName}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
