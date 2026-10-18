import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ATTENTION_ZONES, DEFAULT_BOUNDARIES } from '@edunext/shared';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { Reveal } from '../motion/primitives.jsx';
import { useReduceMotionToggle } from '../motion/useReducedMotion.js';

const TOPIC_LABELS = { 'web-development': 'Web Development', 'data-science': 'Data Science', design: 'Design' };

export default function Profile() {
  const { user, profile, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [, setReduceMotion, reduceToggle] = useReduceMotionToggle();
  const [topics, setTopics] = useState([]);
  const [interests, setInterests] = useState(profile?.interests || []);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/courses')
      .then((d) => setTopics([...new Set(d.courses.map((c) => c.topic))]))
      .catch(() => setTopics(Object.keys(TOPIC_LABELS)));
  }, []);
  useEffect(() => setInterests(profile?.interests || []), [profile]);

  if (!profile) return null;
  const cal = profile.calibration;
  const boundaries = cal?.boundaries || DEFAULT_BOUNDARIES;
  const personalized = cal?.personalized;

  const toggle = (t) =>
    setInterests((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 2 ? [...cur, t] : cur));

  const saveInterests = async () => {
    setBusy(true);
    setMsg('');
    try {
      await api('/profile/interests', { method: 'PUT', body: { interests } });
      await refresh();
      setMsg('Interests saved.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const recalibrate = async () => {
    await api('/profile/calibration', { method: 'DELETE' });
    await refresh();
    navigate('/onboarding');
  };

  const deleteData = async () => {
    if (!window.confirm('Delete your account and all your data? This cannot be undone.')) return;
    await api('/me', { method: 'DELETE' });
    logout();
    navigate('/login');
  };

  return (
    <div className="space-y-6">
      <h1>Your profile</h1>
      <p className="text-sm text-slate-400">{user?.name} · {user?.email}</p>

      <Reveal as="section" className="card space-y-3">
        <h2>Blink zones {personalized ? '(personalized)' : '(default)'}</h2>
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <tbody>
              {ATTENTION_ZONES.map((z, i) => {
                const lo = i === 0 ? 0 : boundaries[i - 1];
                const hi = i < boundaries.length ? boundaries[i] : null;
                return (
                  <tr key={z.key} className="border-t border-white/5 first:border-t-0">
                    <td className="px-3 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: z.color }} aria-hidden />
                      {z.label}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-300">
                      {hi == null ? `${lo}+ bpm` : `${lo}–${hi} bpm`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-400">
          Emotion baseline: <b>{cal?.emotionBaseline ? 'captured' : 'not available'}</b> · Learning style:{' '}
          <b className="capitalize">{profile.learningStyle}</b> ({Math.round(profile.styleConfidence * 100)}%)
        </p>
        <p className="text-xs text-slate-500">
          These are estimates from a short calibration and refine as you learn — a signal, not a diagnosis.
        </p>
      </Reveal>

      <Reveal as="section" className="card space-y-3">
        <h2>Interests</h2>
        <div className="flex flex-wrap gap-2">
          {topics.map((t) => (
            <button key={t} onClick={() => toggle(t)} aria-pressed={interests.includes(t)}
              className={`rounded-xl border px-3 py-2 text-sm transition ${interests.includes(t) ? 'border-sky-400 bg-sky-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
              {TOPIC_LABELS[t] || t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={saveInterests} disabled={busy || interests.length === 0}>
            Save interests
          </button>
          {msg && <span className="text-sm text-slate-400" role="status">{msg}</span>}
        </div>
      </Reveal>

      <Reveal as="section" className="card space-y-3">
        <h2>Display &amp; motion</h2>
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-slate-200">Reduce motion</span>
            <span className="block text-xs text-slate-500">
              Turns off smooth scrolling, animated backgrounds, and transitions. Also follows your
              system setting.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            aria-label="Reduce motion"
            aria-checked={reduceToggle}
            onClick={() => setReduceMotion(!reduceToggle)}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
              reduceToggle ? 'bg-sky-600' : 'bg-white/15'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                reduceToggle ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </Reveal>

      <Reveal as="section" className="card space-y-3">
        <h2>Manage</h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-ghost" onClick={recalibrate}>Recalibrate</button>
          <button className="btn-danger" onClick={deleteData}>Delete my data</button>
        </div>
        <p className="text-xs text-slate-500">
          Recalibrate clears your calibration and restarts onboarding. Delete removes your account and every
          row of your data.
        </p>
      </Reveal>
    </div>
  );
}
