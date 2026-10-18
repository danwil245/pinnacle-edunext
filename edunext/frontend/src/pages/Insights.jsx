import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { api } from '../api/client.js';
import { Loading, ErrorState } from './Home.jsx';
import { Distribution } from './Summary.jsx';
import { Reveal } from '../motion/primitives.jsx';
import { useReducedMotion } from '../motion/useReducedMotion.js';

export default function Insights() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const reduced = useReducedMotion();

  useEffect(() => {
    api('/insights').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading />;

  if (data.sessions.length === 0) {
    return (
      <div className="card text-center">
        <h1>Insights</h1>
        <p className="mt-2 text-slate-400">Finish a lesson to see your engagement history here.</p>
      </div>
    );
  }

  const bySession = data.sessions.map((s, i) => ({
    name: `#${i + 1}`,
    score: s.avgScore == null ? 0 : Math.round(s.avgScore),
    variant: s.variant,
  }));

  return (
    <div className="space-y-6">
      <h1>Insights</h1>

      <Reveal as="section" className="card">
        <h2 className="mb-3">Average engagement per session</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bySession} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
            <XAxis dataKey="name" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Bar dataKey="score" radius={[6, 6, 0, 0]} isAnimationActive={!reduced}>
              {bySession.map((d, i) => (
                <Cell key={i} fill={d.variant === 'practical' ? '#22c55e' : '#0ea5e9'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-1 text-xs text-slate-500">
          <span className="text-sky-400">●</span> visual · <span className="text-emerald-400">●</span> practical
        </p>
      </Reveal>

      <Reveal as="section" className="card">
        <h2 className="mb-3">Engagement by variant</h2>
        <div className="grid grid-cols-2 gap-4">
          {['visual', 'practical'].map((v) => {
            const stat = data.styleByVariant[v];
            return (
              <div key={v} className="rounded-xl bg-white/5 p-4">
                <div className="text-sm capitalize text-slate-400">{v}</div>
                <div className="mt-1 text-2xl font-semibold">
                  {stat ? Math.round(stat.meanScore) : '—'}
                  {stat && <span className="ml-1 text-sm font-normal text-slate-400">/100</span>}
                </div>
                <div className="text-xs text-slate-500">{stat ? `${stat.count} session(s)` : 'no sessions yet'}</div>
              </div>
            );
          })}
        </div>
      </Reveal>

      <div className="grid gap-4 md:grid-cols-2">
        <Distribution title="Attention zones (all sessions)" data={data.zoneDistribution} colored />
        <Distribution title="Emotions (all sessions)" data={data.emotionDistribution} />
      </div>
    </div>
  );
}
