import { useCallback, useEffect, useRef, useState } from 'react';
import { useFaceMesh } from './hooks/useFaceMesh';
import { useBlinkStats, DEFAULT_BOUNDARIES } from './hooks/useBlinkStats';
import { useCalibrationFlow } from './hooks/useCalibrationFlow';
import { loadProfile, saveProfile, clearProfile } from './calibrationStorage';
import CameraFeed from './components/CameraFeed';
import CalibrationScreen from './components/CalibrationScreen';
import AttentionBadge from './components/AttentionBadge';
import BpmChart from './components/BpmChart';
import TimelineChart from './components/TimelineChart';
import DurationChart from './components/DurationChart';
import SessionStats from './components/SessionStats';

function fmtClock(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  // Face presence, shared with useBlinkStats so it can pause BPM sampling.
  const faceActiveRef = useRef(false);

  // Personalized calibration profile — null until onboarding has run once.
  // Skips straight to a live session on repeat visits (profile persisted in
  // localStorage); first-time visitors calibrate before anything else.
  const [profile, setProfile] = useState(() => loadProfile());
  const [phase, setPhase] = useState(() => (loadProfile() ? 'session' : 'calibrate'));
  const boundaries = profile?.boundaries || DEFAULT_BOUNDARIES;

  const handleCalibrationComplete = useCallback((result) => {
    saveProfile(result);
    setProfile(result);
    setPhase('session');
  }, []);

  const calibration = useCalibrationFlow({ onComplete: handleCalibrationComplete });

  const {
    recordBlink,
    bpmData,
    timelineData,
    durationData,
    currentBpm,
    currentZone,
    stats,
  } = useBlinkStats({ activeRef: faceActiveRef, boundaries });

  // Route each detected blink to the calibration counter or the live
  // session's stats, depending on which phase we're currently in.
  const handleBlink = useCallback(
    (blink) => {
      if (phase === 'calibrate') calibration.recordBlink(blink);
      else recordBlink(blink);
    },
    [phase, calibration, recordBlink]
  );

  const { status, errorMessage, faceDetected, liveRef } = useFaceMesh({
    videoRef,
    canvasRef,
    onBlink: handleBlink,
  });

  // Keep the shared flag in sync: BPM only advances with a face, a live
  // feed, and once we're actually in a tracked session (not calibrating).
  faceActiveRef.current = faceDetected && status === 'ready' && phase === 'session';

  // Session timer — only runs once calibration is done.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (phase !== 'session') return undefined;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const handleRecalibrate = useCallback(() => {
    clearProfile();
    setProfile(null);
    setElapsed(0);
    setPhase('calibrate');
  }, []);

  if (status === 'error') {
    return <ErrorScreen message={errorMessage} />;
  }

  return (
    <div className="min-h-screen w-full px-4 py-4 lg:px-6">
      {phase === 'session' && (
        <header className="glass-strong mb-4 flex flex-wrap items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-lg">
              👁️
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Blink Rate Attention Analyzer</h1>
              <p className="text-xs text-slate-400">
                Real-time focus tracking · 100% on-device
                {profile?.personalized ? ' · Personalized profile active' : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-mono text-xl font-semibold tabular-nums">{fmtClock(elapsed)}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Session</div>
            </div>
            <AttentionBadge zone={currentZone} bpm={currentBpm} />
            <button
              onClick={handleRecalibrate}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
            >
              Recalibrate
            </button>
          </div>
        </header>
      )}

      {phase === 'calibrate' && <CalibrationScreen flow={calibration} />}

      {/* ---- Main grid ---- */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* The camera feed is always mounted at this same position so
            MediaPipe/the webcam stream never re-attach on phase changes —
            only its size/position change (inline grid item vs. floating
            corner overlay during calibration). */}
        <div
          className={
            phase === 'session'
              ? 'lg:col-span-1'
              : 'fixed bottom-4 right-4 z-40 w-64 sm:w-72'
          }
        >
          <CameraFeed
            videoRef={videoRef}
            canvasRef={canvasRef}
            liveRef={liveRef}
            faceDetected={faceDetected}
          />
        </div>

        {phase === 'session' && (
          <div className="grid grid-cols-1 gap-4 lg:col-span-2 xl:grid-cols-2">
            <div className="xl:col-span-2">
              <BpmChart data={bpmData} zone={currentZone} boundaries={boundaries} />
            </div>
            <div className="xl:col-span-2">
              <TimelineChart data={timelineData} />
            </div>
            <DurationChart data={durationData} />
            <SessionStats stats={stats} />
          </div>
        )}
      </div>

      {status === 'loading' && <LoadingOverlay />}
    </div>
  );
}

// --- helpers -----------------------------------------------------------------

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/80 backdrop-blur-sm">
      <div className="glass-strong flex flex-col items-center gap-4 px-10 py-8">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
        <div className="text-center">
          <div className="font-semibold">Loading face mesh…</div>
          <div className="text-xs text-slate-400">Allow camera access to begin</div>
        </div>
      </div>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="glass-strong flex max-w-md flex-col items-center gap-4 px-8 py-10 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-500/20 text-3xl">
          🎥
        </div>
        <h1 className="text-xl font-bold">Camera unavailable</h1>
        <p className="text-sm text-slate-300">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 rounded-xl bg-blue-500/90 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
