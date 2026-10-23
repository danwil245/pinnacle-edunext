import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher.js';
import { AsyncState, DemoBadge } from './components.jsx';
import { ZoneDistribution, CountPills, EngagementOverTime, TrendChip } from './charts.jsx';

export default function TeacherStudentDetail() {
  const { id, studentId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await teacherApi.studentDetail(id, studentId));
    } catch (err) {
      setError(err.message || 'Could not load this student');
    }
  }, [id, studentId]);
  useEffect(() => {
    load();
  }, [load]);

  const st = data?.student;
  return (
    <div className="space-y-6">
      <AsyncState loading={!data && !error} error={error}>
        {data && (
          <>
            <div>
              <Link to={`/teacher/courses/${id}/students`} className="text-sm text-slate-400 hover:text-slate-200">← All students</Link>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold">{st.name}</h1>
                {st.isDemo && <DemoBadge />}
                <TrendChip trend={st.trend} />
                {st.flagged && (
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
                    might benefit from a check-in
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400 capitalize">
                Preferred style: {st.style}{st.styleConfidence ? ` · ${Math.round(st.styleConfidence * 100)}% confidence` : ''}
              </p>
            </div>

            <section className="card">
              <h2 className="mb-3 text-lg font-medium">Engagement over time</h2>
              <EngagementOverTime data={data.engagementOverTime} />
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="card">
                <h2 className="mb-3 text-lg font-medium">Per-lesson results</h2>
                <ul className="divide-y divide-white/5 text-sm">
                  {data.perLesson.map((l) => (
                    <li key={l.lessonId} className="flex items-center justify-between py-2">
                      <span className="truncate">{l.title}</span>
                      <span className="text-slate-400">{l.sessions} session{l.sessions === 1 ? '' : 's'} · avg {l.avgEngagement ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card space-y-4">
                <div>
                  <h2 className="mb-2 text-lg font-medium">Attention zones</h2>
                  <ZoneDistribution dist={data.zoneDistribution} />
                </div>
                <div>
                  <h2 className="mb-2 text-lg font-medium">Emotions</h2>
                  <CountPills dist={data.emotionDistribution} />
                </div>
              </section>
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}
