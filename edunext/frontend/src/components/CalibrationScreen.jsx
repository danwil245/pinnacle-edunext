import { CALIBRATION_VIDEOS, CALIBRATION_DURATION_S } from '../calibrationVideos';

const ZONE_LABELS = ['Hyperfocused', 'Attentive', 'Neutral', 'Fatigued', 'Sleepy'];

function boundaryRanges(boundaries) {
  const [b0, b1, b2, b3] = boundaries;
  return [
    `< ${b0}`,
    `${b0}–${b1 - 1}`,
    `${b1}–${b2 - 1}`,
    `${b2}–${b3 - 1}`,
    `${b3}+`,
  ];
}

function Card({ children, wide }) {
  return (
    <div
      className={`glass-strong mx-auto flex flex-col items-center px-6 py-8 text-center sm:px-10 ${
        wide ? 'w-full max-w-2xl' : 'w-full max-w-md'
      }`}
    >
      {children}
    </div>
  );
}

function PrimaryButton(props) {
  return (
    <button
      {...props}
      className="mt-6 rounded-xl bg-blue-500/90 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function GhostButton(props) {
  return (
    <button
      {...props}
      className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
    />
  );
}

/**
 * Full-screen onboarding calibration flow: intro -> 2 clips (with live blink
 * tracking) -> personalized-profile result. Driven entirely by the `flow`
 * object returned from useCalibrationFlow; this component is presentational.
 */
export default function CalibrationScreen({ flow }) {
  const { step, progress, liveCount, result, beginClip, skipClip, finish } = flow;

  return (
    <div className="flex min-h-[80vh] w-full flex-col items-center justify-center px-4 py-10">
      {step === 'intro' && (
        <Card>
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-3xl">
            👁️
          </div>
          <h1 className="mt-4 text-2xl font-bold">Let's personalize your attention model</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">
            Blink-rate baselines vary from person to person, so a single fixed
            threshold doesn't fit everyone. You'll watch two short clips — one
            you'll likely find engaging, one more neutral — while we quietly
            measure your blink rate during each. That gives you your own
            personal attention zones instead of one universal cutoff.
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Takes about a minute. Camera required — you're already being
            tracked in the corner.
          </p>
          <PrimaryButton onClick={() => beginClip('engaging')}>Start Calibration</PrimaryButton>
        </Card>
      )}

      {(step === 'video1' || step === 'video2') && (
        <Card wide>
          <div className="flex w-full items-center justify-between text-xs uppercase tracking-wider text-slate-400">
            <span>{step === 'video1' ? 'Clip 1 of 2 — Engaging' : 'Clip 2 of 2 — Neutral'}</span>
            <span className="font-mono normal-case tracking-normal text-slate-300">
              {liveCount} blink{liveCount === 1 ? '' : 's'} so far
            </span>
          </div>

          <video
            key={step}
            src={step === 'video1' ? CALIBRATION_VIDEOS.engaging.src : CALIBRATION_VIDEOS.neutral.src}
            autoPlay
            muted
            loop
            playsInline
            className="mt-3 aspect-video w-full rounded-xl bg-black object-cover"
          />

          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-blue-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Just watch naturally — {CALIBRATION_DURATION_S}s, no need to do anything else.
          </p>

          <GhostButton onClick={skipClip}>Skip ahead</GhostButton>
        </Card>
      )}

      {step === 'transition' && (
        <Card>
          <h2 className="text-xl font-bold">Nice — one more to go</h2>
          <p className="mt-3 text-sm text-slate-300">
            Now a second, more neutral clip. Same idea — just watch naturally.
          </p>
          <PrimaryButton onClick={() => beginClip('neutral')}>Continue</PrimaryButton>
        </Card>
      )}

      {step === 'result' && result && (
        <Card wide>
          <h2 className="text-xl font-bold">Your personalized profile</h2>

          <div className="mt-5 grid w-full grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 px-4 py-3 text-left">
              <div className="text-2xl font-bold tabular-nums">{result.engagedBpm}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Engaged-clip BPM
              </div>
            </div>
            <div className="rounded-xl bg-white/5 px-4 py-3 text-left">
              <div className="text-2xl font-bold tabular-nums">{result.neutralBpm}</div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">
                Neutral-clip BPM
              </div>
            </div>
          </div>

          {!result.personalized && (
            <p className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Your two reads were too close together to personalize reliably, so
              we're using the default zones for now. You can recalibrate anytime.
            </p>
          )}

          <table className="mt-5 w-full text-left text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                <th className="pb-2 font-medium">Zone</th>
                <th className="pb-2 font-medium">Your BPM range</th>
              </tr>
            </thead>
            <tbody>
              {ZONE_LABELS.map((label, i) => (
                <tr key={label} className="border-t border-white/10">
                  <td className="py-2">{label}</td>
                  <td className="py-2 font-mono text-slate-300">
                    {boundaryRanges(result.boundaries)[i]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <PrimaryButton onClick={finish}>Start My Session</PrimaryButton>
        </Card>
      )}
    </div>
  );
}
