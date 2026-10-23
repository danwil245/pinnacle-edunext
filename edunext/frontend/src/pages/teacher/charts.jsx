import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ZONE_BY_KEY } from '@edunext/shared';

const AXIS = { stroke: '#64748b', fontSize: 12 };

/** Horizontal zone-distribution bar (shares), coloured by zone. */
export function ZoneDistribution({ dist }) {
  const total = Object.values(dist || {}).reduce((a, b) => a + b, 0);
  if (!total) return <p className="text-sm text-slate-500">No zone data yet.</p>;
  const order = Object.keys(ZONE_BY_KEY);
  const entries = order.filter((k) => dist[k]).map((k) => ({ k, n: dist[k], pct: (dist[k] / total) * 100 }));
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5" role="img" aria-label="Attention zone distribution">
        {entries.map((e) => (
          <div key={e.k} style={{ width: `${e.pct}%`, background: ZONE_BY_KEY[e.k].color }} title={`${ZONE_BY_KEY[e.k].label}: ${Math.round(e.pct)}%`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        {entries.map((e) => (
          <li key={e.k} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONE_BY_KEY[e.k].color }} aria-hidden />
            {ZONE_BY_KEY[e.k].label} {Math.round(e.pct)}%
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Simple labelled distribution (emotions) as pills with counts. */
export function CountPills({ dist, empty = 'No data yet.' }) {
  const entries = Object.entries(dist || {});
  if (entries.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-2">
      {entries.map(([k, n]) => (
        <li key={k} className="pill capitalize">{k} · {n}</li>
      ))}
    </ul>
  );
}

/**
 * Class engagement timeline: average engagement vs % of lesson watched, with a
 * mean±sd spread band. Data points: { pct, mean, lo, hi, n }.
 */
export function EngagementTimeline({ data }) {
  const points = (data || []).filter((d) => d.mean != null);
  if (points.length < 2) return <p className="text-sm text-slate-500">Not enough data to chart the timeline yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
        <defs>
          <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="pct" unit="%" tick={AXIS} />
        <YAxis domain={[0, 100]} tick={AXIS} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
          formatter={(v, name) => [Math.round(v), name === 'mean' ? 'avg' : name]}
          labelFormatter={(l) => `${l}% watched`}
        />
        {/* Spread band: hi then lo over the band fill. */}
        <Area dataKey="hi" stroke="none" fill="url(#bandFill)" isAnimationActive={false} />
        <Area dataKey="lo" stroke="none" fill="#0b1220" isAnimationActive={false} />
        <Area dataKey="mean" stroke="#38bdf8" strokeWidth={2} fill="none" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** A student's average engagement across sessions over time. */
export function EngagementOverTime({ data }) {
  const points = (data || []).filter((d) => d.avgScore != null);
  if (points.length === 0) return <p className="text-sm text-slate-500">No ended sessions yet.</p>;
  const chart = points.map((d, i) => ({ i: i + 1, score: d.avgScore, lesson: d.lesson }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
        <XAxis dataKey="i" tick={AXIS} />
        <YAxis domain={[0, 100]} tick={AXIS} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, fontSize: 12 }}
          formatter={(v) => [Math.round(v), 'avg']}
          labelFormatter={(l) => `Session ${l}`}
        />
        <Line dataKey="score" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Up/down/flat trend chip. */
export function TrendChip({ trend }) {
  const map = {
    up: { label: '▲ Improving', cls: 'text-emerald-300' },
    down: { label: '▼ Declining', cls: 'text-rose-300' },
    flat: { label: '→ Steady', cls: 'text-slate-400' },
  };
  const t = map[trend] || map.flat;
  return <span className={`text-xs font-medium ${t.cls}`}>{t.label}</span>;
}
