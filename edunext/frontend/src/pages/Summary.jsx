import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { ZONE_BY_KEY } from '@edunext/shared';
import { api } from '../api/client.js';
import { Loading, ErrorState } from './Home.jsx';
import { Reveal, Stagger } from '../motion/primitives.jsx';
import { useReducedMotion } from '../motion/useReducedMotion.js';

export default function Summary() {
  const { sessionId } = useParams();
  const location = useLocation();
  const [summary, setSummary] = useState(location.state?.summary || null);
  const [error, setError] = useState('');

  // Fallback if we arrived without state (e.g. a refresh): rebuild from insights.
  useEffect(() => {
    if (summary) return;
    api('/insights')
      .then((d) => {
        const s = d.sessions.find((x) => String(x.id) === String(sessionId));
        if (!s) return setError('Session summary not found.');
        setSummary({
          sessionId: s.id,
          variant: s.variant,
          avgScore: s.avgScore,
          validSeconds: s.validSeconds,
          scoreSeries: s.series,
          zoneDistribution: {},
          emotionDistribution: {},
          curationEvents: [],
          completed: true,
          style: null,
        });
      })
      .catch((e) => setError(e.message));
  }, [summary, sessionId]);

  if (error) return <ErrorState message={error} />;
  if (!summary) return <Loading />;

  const series = (summary.scoreSeries || []).map((p) => ({ s: Math.round(p.t / 1000), score: Math.round(p.score) }));
  const curation = summary.curationEvents || [];

  return (
    <SummaryBody summary={summary} series={series} curation={curation} />
  );
}

function SummaryBody({ summary, series, curation }) {
  const reduced = useReducedMotion();
  // Timeline markers appear one-by-one after the line draws.
  const [visibleMarkers, setVisibleMarkers] = useState(reduced ? curation.length : 0);
  useEffect(() => {
    if (reduced || curation.length === 0) {
      setVisibleMarkers(curation.length);
      return undefined;
    }
    setVisibleMarkers(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setVisibleMarkers(n);
      if (n >= curation.length) clearInterval(id);
    }, 320);
    return () => clearInterval(id);
  }, [reduced, curation.length]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1>Lesson summary</h1>
        <Link to="/home" className="btn-ghost">Back home</Link>
      </header>

      <Stagger className="grid gap-4 sm:grid-cols-3">
        <Stat label="Average engagement" value={summary.avgScore == null ? '—' : Math.round(summary.avgScore)} suffix="/100" />
        <Stat label="Valid time" value={summary.validSeconds ?? 0} suffix="s" />
        <Stat label="Variant" value={summary.variant} capitalize />
      </Stagger>

      {series.length > 0 && (
        <Reveal as="section" className="card">
          <h2 className="mb-3">Engagement over time</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
              <XAxis dataKey="s" unit="s" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#0ea5e9" dot={false} strokeWidth={2} isAnimationActive={!reduced} />
              {curation.slice(0, visibleMarkers).map((c, i) => {
                const near = series.reduce((best, p) => (Math.abs(p.s - c.t / 1000) < Math.abs(best.s - c.t / 1000) ? p : best), series[0]);
                return <ReferenceDot key={i} x={near.s} y={near.score} r={5} fill="#f59e0b" stroke="none" />;
              })}
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-xs text-slate-500">Amber dots mark adaptive actions.</p>
        </Reveal>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Distribution title="Attention zones" data={summary.zoneDistribution} colored />
        <Distribution title="Emotions" data={summary.emotionDistribution} />
      </div>

      {curation.length > 0 && (
        <Reveal as="section" className="card">
          <h2 className="mb-3">What adapted, and why</h2>
          <ul className="space-y-2 text-sm">
            {curation.map((c, i) => (
              <li key={i} className="flex flex-wrap gap-2 text-slate-300">
                <span className="pill capitalize">{c.action.replace('_', ' ')}</span>
                <span className="text-slate-400">{c.reason}</span>
                <span className="text-xs text-slate-500">({c.outcome})</span>
              </li>
            ))}
          </ul>
        </Reveal>
      )}

      {summary.style && (
        <Reveal as="section" className="card">
          <h2 className="mb-1">What we learned about your style</h2>
          <p className="text-sm text-slate-300">
            Current estimate: <b className="capitalize">{summary.style.style}</b>{' '}
            ({Math.round((summary.style.confidence || 0) * 100)}% confidence). This refines over time.
          </p>
        </Reveal>
      )}
    </div>
  );
}

function Stat({ label, value, suffix, capitalize }) {
  return (
    <div className="card">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${capitalize ? 'capitalize' : ''}`}>
        {value}
        {suffix && <span className="ml-1 text-sm font-normal text-slate-400">{suffix}</span>}
      </div>
    </div>
  );
}

export function Distribution({ title, data, colored }) {
  const entries = Object.entries(data || {});
  const total = entries.reduce((a, [, n]) => a + n, 0);
  return (
    <section className="card">
      <h2 className="mb-3">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No data.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map(([k, n]) => (
            <li key={k} className="text-sm">
              <div className="mb-1 flex justify-between">
                <span className="capitalize">
                  {colored && ZONE_BY_KEY[k] && (
                    <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: ZONE_BY_KEY[k].color }} aria-hidden />
                  )}
                  {k}
                </span>
                <span className="text-slate-400">{Math.round((n / total) * 100)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${(n / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
