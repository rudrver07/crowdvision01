import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Radio,
  Languages,
  ShieldAlert,
  ChevronDown,
  Sparkles,
  Info,
} from 'lucide-react';
import { voiceAlertService } from '../../services/voice/voiceAlertService';
import { VoiceSystemState } from '../../services/voice/types';

export const VoiceAlertControl: React.FC = () => {
  const [state, setState] = useState<VoiceSystemState>(voiceAlertService.getState());
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const unsub = voiceAlertService.subscribeToState((s) => {
      setState({ ...s });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleToggleMute = () => {
    // Also unlock audio context if not yet unlocked
    if (!state.audioUnlocked) {
      voiceAlertService.unlockAudio();
    }
    voiceAlertService.toggleMute();
  };

  const handleToggleLanguage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextLang = state.language === 'en' ? 'hi' : 'en';
    voiceAlertService.setLanguage(nextLang);
  };

  const handleUnlockAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    voiceAlertService.unlockAudio();
  };

  const remainingSeconds = Math.ceil(state.collectionTimeRemainingMs / 1000);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Compact Topbar Button */}
      <div className="flex items-center space-x-1.5 bg-[#0B1120] border border-slate-700/80 rounded-lg p-1 text-xs shadow-sm">
        {/* Main Audio Toggle Button */}
        <button
          type="button"
          onClick={handleToggleMute}
          title={
            state.isMuted
              ? 'Voice alerts muted. Click to enable audio.'
              : 'Voice alerts active. Click to mute.'
          }
          className={`flex items-center space-x-1.5 px-2 py-1 rounded-md transition-all font-mono text-[11px] ${
            state.isMuted
              ? 'bg-slate-800 text-slate-400 hover:text-white'
              : state.isPlaying
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse'
              : state.isCollecting
              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
          }`}
        >
          {state.isMuted ? (
            <VolumeX className="h-3.5 w-3.5 text-slate-400" />
          ) : state.isPlaying ? (
            <Radio className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
          ) : (
            <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
          )}

          <span className="hidden sm:inline font-semibold">
            {state.isMuted ? (
              'MUTED'
            ) : state.isPlaying ? (
              <span className="truncate max-w-[90px]">
                {state.currentAnnouncement?.zoneName || 'SPEAKING'}
              </span>
            ) : state.isCollecting ? (
              <span>BATCH {remainingSeconds}s</span>
            ) : (
              'VOICE ON'
            )}
          </span>
        </button>

        {/* Quick Language Toggle Pill */}
        <button
          type="button"
          onClick={handleToggleLanguage}
          title={`Switch voice language (Current: ${state.language === 'en' ? 'English' : 'Hindi'})`}
          className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-cyan-400 border border-slate-700 font-bold transition-colors"
        >
          {state.language.toUpperCase()}
        </button>

        {/* Browser Autoplay Unlock Button if needed */}
        {!state.audioUnlocked && !state.isMuted && (
          <button
            type="button"
            onClick={handleUnlockAudio}
            className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[10px] font-mono text-amber-300 border border-amber-500/40 transition-colors animate-pulse"
            title="Click to unlock browser audio playback"
          >
            ENABLE AUDIO
          </button>
        )}

        {/* Settings Dropdown Trigger */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
          title="Voice alert options"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* Popover Settings Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-72 rounded-xl bg-[#0B1120] border border-slate-800 shadow-2xl p-3 z-50 animate-fade-in text-xs font-sans">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2.5">
            <div className="flex items-center space-x-1.5 text-white font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
              <span>ElevenLabs Voice Alerts</span>
            </div>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase ${
                state.isPlaybackOwner
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {state.isPlaybackOwner ? 'ACTIVE TAB' : 'LISTENER TAB'}
            </span>
          </div>

          {/* Current Live Speaking Telemetry */}
          {state.isPlaying && state.currentAnnouncement && (
            <div className="mb-2.5 p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px]">
              <div className="text-cyan-400 font-bold uppercase tracking-wider text-[9px] mb-0.5 flex items-center space-x-1">
                <Radio className="h-3 w-3 animate-pulse" />
                <span>Now Speaking</span>
              </div>
              <div className="text-white font-medium line-clamp-2">
                "{state.currentAnnouncement.text}"
              </div>
            </div>
          )}

          {/* 17s Collection Window Status */}
          {state.isCollecting && (
            <div className="mb-2.5 p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 text-[11px]">
              <div className="flex items-center justify-between text-amber-400 font-semibold text-[10px]">
                <span>17-Second Alert Aggregation</span>
                <span>{remainingSeconds}s remaining</span>
              </div>
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                <div
                  className="bg-amber-400 h-full transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((17000 - state.collectionTimeRemainingMs) / 17000) * 100
                    )}%`,
                  }}
                />
              </div>
              <div className="text-[9px] text-slate-400 mt-1">
                Grouping alerts by zone; only latest state per zone will be announced.
              </div>
            </div>
          )}

          {/* Controls Form */}
          <div className="space-y-2 text-xs">
            {/* Language Selection */}
            <div className="flex items-center justify-between">
              <span className="text-slate-400 flex items-center space-x-1.5">
                <Languages className="h-3.5 w-3.5 text-slate-500" />
                <span>Voice Language</span>
              </span>
              <div className="flex space-x-1">
                <button
                  type="button"
                  onClick={() => voiceAlertService.setLanguage('en')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    state.language === 'en'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => voiceAlertService.setLanguage('hi')}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                    state.language === 'hi'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  हिंदी
                </button>
              </div>
            </div>

            {/* Volume Slider */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-slate-400">Volume</span>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={state.volume}
                  onChange={(e) => voiceAlertService.setVolume(parseFloat(e.target.value))}
                  className="w-24 accent-cyan-400 h-1 bg-slate-700 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 w-6 text-right">
                  {Math.round(state.volume * 100)}%
                </span>
              </div>
            </div>

            {/* Queue Counter */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[11px]">
              <span className="text-slate-400">Announcement Queue</span>
              <span className="font-mono text-cyan-400 font-bold">
                {state.queueLength} pending
              </span>
            </div>

            {/* Audio Unlock Button */}
            {!state.audioUnlocked && (
              <button
                type="button"
                onClick={handleUnlockAudio}
                className="w-full mt-2 py-1.5 px-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Enable Browser Audio Playback</span>
              </button>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-slate-800 text-[9px] text-slate-500 flex items-start space-x-1.5">
            <Info className="h-3 w-3 text-slate-500 shrink-0 mt-0.5" />
            <span>
              ElevenLabs Voice alerts enforce single sequential playback across all open tabs.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
