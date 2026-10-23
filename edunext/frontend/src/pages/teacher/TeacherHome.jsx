import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher.js';
import { useAuth } from '../../auth/AuthContext.jsx';
import { AsyncState, StatusBadge, DemoBadge } from './components.jsx';
import { ZoneDistribution } from './charts.jsx';

function Kpi({ label, value }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export default function TeacherHome() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hideDemo, setHideDemo] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const res = await teacherApi.overview(hideDemo ? { demo: 'exclude' } : {});
      setData(res);
    } catch (err) {
      setError(err.message || 'Could not load your dashboard');
    }
  }, [hideDemo]);
  useEffect(() => {
    load();
  }, [load]);

  const noCourses = data && data.courses.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome{user ? `, ${user.name}` : ''}</h1>
          <p className="mt-1 text-sm text-slate-400">Derived engagement numbers only — never camera video.</p>
        </div>
        <Link to="/teacher/courses/new" className="btn-primary">New course</Link>
      </div>

      <AsyncState loading={!data && !error} error={error}>
        {data && (
          noCourses ? (
            <div className="card text-center">
              <h2 className="text-lg font-medium">No courses yet</h2>
              <p className="mt-1 text-sm text-slate-400">Create your first course and publish it for students.</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link to="/teacher/courses/new" className="btn-primary">New course</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {data.includesDemo && data.totals.totalSessions > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-sm text-fuchsia-200">
                  <span className="flex items-center gap-2"><DemoBadge /> These numbers include demo data.</span>
                  <button className="underline" onClick={() => setHideDemo(true)}>Hide demo data</button>
                </div>
              )}
              {hideDemo && (
                <button className="text-xs text-slate-400 underline" onClick={() => setHideDemo(false)}>Show demo data</button>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Kpi label="Courses" value={data.totals.courses} />
                <Kpi label="Students" value={data.totals.studentsStarted} />
                <Kpi label="Sessions" value={data.totals.totalSessions} />
                <Kpi label="Avg engagement" value={data.totals.avgEngagement ?? '—'} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <section className="card">
                  <h2 className="mb-3 text-lg font-medium">Attention zones (all courses)</h2>
                  <ZoneDistribution dist={data.zoneDistribution} />
                </section>
                <section className="card">
                  <h2 className="mb-3 text-lg font-medium">Most &amp; least engaging lessons</h2>
                  {data.mostEngagingLessons.length === 0 ? (
                    <p className="text-sm text-slate-500">No lesson data yet.</p>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-emerald-400">Most engaging</p>
                        <ul className="mt-1 space-y-1">
                          {data.mostEngagingLessons.map((l) => (
                            <li key={l.lessonId} className="flex justify-between"><span className="truncate">{l.title}</span><span className="text-slate-400">{l.avgEngagement}</span></li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-amber-400">Needs attention</p>
                        <ul className="mt-1 space-y-1">
                          {data.leastEngagingLessons.map((l) => (
                            <li key={l.lessonId} className="flex justify-between"><span className="truncate">{l.title}</span><span className="text-slate-400">{l.avgEngagement}</span></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </section>
              </div>

              <section>
                <h2 className="mb-3 text-lg font-medium">Your courses</h2>
                <ul className="space-y-2">
                  {data.courses.map((c) => (
                    <li key={c.id} className="card flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Link to={`/teacher/courses/${c.id}`} className="font-medium hover:underline">{c.title}</Link>
                        <StatusBadge status={c.status} />
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400">
                        <span>{c.students} students</span>
                        <span>{c.sessions} sessions</span>
                        <span>avg {c.avgEngagement ?? '—'}</span>
                        <Link to={`/teacher/courses/${c.id}/analytics`} className="text-sky-400 hover:underline">Analytics →</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {data.recentActivity.length > 0 && (
                <section className="card">
                  <h2 className="mb-3 text-lg font-medium">Recent activity</h2>
                  <ul className="divide-y divide-white/5 text-sm">
                    {data.recentActivity.map((a) => (
                      <li key={a.sessionId} className="flex items-center justify-between gap-2 py-2">
                        <span className="flex items-center gap-2 truncate">
                          {a.isDemo && <DemoBadge />}
                          <span className="truncate">{a.course} · {a.lesson}</span>
                        </span>
                        <span className="shrink-0 text-slate-400">{a.avgScore ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )
        )}
      </AsyncState>
    </div>
  );
}
