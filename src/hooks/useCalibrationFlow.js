import { useCallback, useRef, useState } from 'react';
import { personalizeBoundaries } from './useBlinkStats';
import { CALIBRATION_DURATION_S } from '../calibrationVideos';

/**
 * Drives the two-clip onboarding calibration flow: play an "engaging" clip,
 * then a "neutral" clip, measuring blink rate during each, then turn those
 * two readings into a personalized set of attention-zone boundaries.
 *
 * Blinks are only counted while a clip is actively playing (`activeClipRef`
 * gates `recordBlink`), so stray blinks during the intro/transition/result
 * screens don't pollute the calibration reads.
 *
 * @param {object} opts
 * @param {(result: {engagedBpm:number, neutralBpm:number, boundaries:number[], personalized:boolean}) => void} opts.onComplete
 */
export function useCalibrationFlow({ onComplete }) {
  // intro -> video1 -> transition -> video2 -> result
  const [step, setStep] = useState('intro');
  const [progress, setProgress] = useState(0); // 0..1 within the current clip
  const [liveCount, setLiveCount] = useState(0);
  const [result, setResult] = useState(null);

  const countRef = useRef(0);
  const startRef = useRef(0);
  const timerRef = useRef(null);
  const engagedBpmRef = useRef(0);
  const activeClipRef = useRef(null); // 'engaging' | 'neutral' | null

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const recordBlink = useCallback(() => {
    if (!activeClipRef.current) return;
    countRef.current += 1;
    setLiveCount(countRef.current);
  }, []);

  const finishClip = useCallback(() => {
    const clipKey = activeClipRef.current;
    if (!clipKey) return;
    stopTimer();
    activeClipRef.current = null;

    const elapsedS = (Date.now() - startRef.current) / 1000;
    const bpm = elapsedS > 0 ? (countRef.current / elapsedS) * 60 : 0;

    if (clipKey === 'engaging') {
      engagedBpmRef.current = bpm;
      setStep('transition');
    } else {
      const neutralBpm = bpm;
      const { boundaries, personalized } = personalizeBoundaries({
        engagedBpm: engagedBpmRef.current,
        neutralBpm,
      });
      setResult({
        engagedBpm: Math.round(engagedBpmRef.current * 10) / 10,
        neutralBpm: Math.round(neutralBpm * 10) / 10,
        boundaries,
        personalized,
      });
      setStep('result');
    }
  }, []);

  const beginClip = useCallback(
    (clipKey) => {
      countRef.current = 0;
      setLiveCount(0);
      setProgress(0);
      startRef.current = Date.now();
      activeClipRef.current = clipKey;
      setStep(clipKey === 'engaging' ? 'video1' : 'video2');

      stopTimer();
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startRef.current) / 1000;
        setProgress(Math.min(1, elapsed / CALIBRATION_DURATION_S));
        if (elapsed >= CALIBRATION_DURATION_S) finishClip();
      }, 200);
    },
    [finishClip]
  );

  // Lets a presenter/demo skip ahead if a clip is slow to load — still ends
  // the clip cleanly and computes a (shorter-window) BPM read from whatever
  // blinks were captured so far.
  const skipClip = useCallback(() => finishClip(), [finishClip]);

  const finish = useCallback(() => {
    if (result) onComplete?.(result);
  }, [onComplete, result]);

  return { step, progress, liveCount, result, recordBlink, beginClip, skipClip, finish };
}
