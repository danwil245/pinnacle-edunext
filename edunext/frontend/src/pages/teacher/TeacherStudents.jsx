import { useEffect, useMemo, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { teacherApi, downloadCourseCsv } from '../../api/teacher.js';
import { AsyncState, DemoBadge } from './components.jsx';
import { TrendChip } from './charts.jsx';

const SORTS = {
  engagement: (a, b) => (b.avgEngagement ?? -1) - (a.avgEngagement ?? -1),
  name: (a, b) => a.name.localeCompare(b.name),
  sessions: (a, b) => b.sessions - a.sessions,
  lastActive: (a, b) => String(b.lastActive || '').localeCompare(String(a.lastActive || '')),
};

export default function TeacherStudents() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hideDemo, setHideDemo] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('engagement');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      setData(await teacherApi.courseStudents(id, hideDemo ? { demo: 'exclude' } : {}));
    } catch (err) {
      setError(err.message || 'Could not load students');
    }
  }, [id, hideDemo]);
  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    let r = data?.students || [];
    if (query.trim()) r = r.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()));
    if (flaggedOnly) r = r.filter((s) => s.flagged);
    return [...r].sort(SORTS[sort]);
  }, [data, query, sort, flaggedOnly]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadCourseCsv(id, `${data?.course?.title || 'course'}-students.csv`, hideDemo ? { demo: 'exclude' } : {});
    } catch (err) {
      setError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/teacher/courses/${id}/analytics`} className="text-sm text-slate-400 hover:text-slate-200">← Course analytics</Link>
          <h1 className="mt-2 text-2xl font-semibold">{data?.course?.title || 'Course'} · students</h1>
        </div>
        <button className="btn-ghost" onClick={exportCsv} disabled={exporting || !rows.length}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
      </div>

      <AsyncState loading={!data && !error} error={error} empty={data && data.students.length === 0} emptyText="No students have started this course yet.">
        {data && data.students.length > 0 && (
          <>
            {data.includesDemo && (
              <div className="flex items-center justify-between rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-sm text-fuchsia-200">
                <span className="flex items-center gap-2"><DemoBadge /> Table includes demo students.</span>
                <button className="underline" onClick={() => setHideDemo(true)}>Hide demo data</button>
              </div>
            )}
            {hideDemo && <button className="text-xs text-slate-400 underline" onClick={() => setHideDemo(false)}>Show demo data</button>}

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1">
                <label className="label" htmlFor="search">Search</label>
                <input id="search" className="input" placeholder="Student name…" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="sort">Sort by</label>
                <select id="sort" className="input" value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="engagement">Engagement</option>
                  <option value="name">Name</option>
                  <option value="sessions">Sessions</option>
                  <option value="lastActive">Last active</option>
                </select>
              </div>
              <label className="flex h-[44px] items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-transparent" />
                Flagged only
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr className="border-b border-white/10">
                    <th className="py-2 pr-3">Student</th>
                    <th className="py-2 pr-3">Sessions</th>
                    <th className="py-2 pr-3">Avg</th>
                    <th className="py-2 pr-3">Trend</th>
                    <th className="py-2 pr-3">Fatigued/sleepy</th>
                    <th className="py-2 pr-3">Style</th>
                    <th className="py-2 pr-3">Last active</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-b border-white/5">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <Link to={`/teacher/courses/${id}/students/${s.id}`} className="font-medium text-slate-100 hover:underline">{s.name}</Link>
                          {s.isDemo && <DemoBadge />}
                          {s.flagged && <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300" title="Recent engagement persistently low">might benefit from a check-in</span>}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{s.sessions}</td>
                      <td className="py-2 pr-3">{s.avgEngagement ?? '—'}</td>
                      <td className="py-2 pr-3"><TrendChip trend={s.trend} /></td>
                      <td className="py-2 pr-3">{s.fatiguedSleepySeconds}s</td>
                      <td className="py-2 pr-3 capitalize">{s.style} {s.styleConfidence ? `(${Math.round(s.styleConfidence * 100)}%)` : ''}</td>
                      <td className="py-2 pr-3 text-slate-400">{s.lastActive ? new Date(s.lastActive).toLocaleDateString() : '—'}</td>
                      <td className="py-2"><Link to={`/teacher/courses/${id}/students/${s.id}`} className="text-sky-400 hover:underline">View</Link></td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="py-6 text-center text-slate-400">No students match your filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}
