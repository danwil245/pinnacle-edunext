import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher.js';
import { AsyncState, DemoBadge } from './components.jsx';
import { ZoneDistribution, CountPills, EngagementTimeline } from './charts.jsx';

const ACTION_LABELS = {
  suggest_break: 'Breaks',
  replay_section: 'Replays',
  switch_variant: 'Switches',
  slow_down: 'Slow-downs',
  speed_up: 'Speed-ups',
};

export default function TeacherCourseAnalytics() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [hideDemo, setHideDemo] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      setData(await teacherApi.courseAnalytics(id, hideDemo ? { demo: 'exclude' } : {}));
    } catch (err) {
      setError(err.message || 'Could not load analytics');
    }
  }, [id, hideDemo]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/teacher/courses/${id}`} className="text-sm text-slate-400 hover:text-slate-200">← Course editor</Link>
          <h1 className="mt-2 text-2xl font-semibold">{data?.course?.title || 'Course'} · analytics</h1>
        </div>
        <div className="flex gap-2">
          <Link to={`/teacher/courses/${id}/students`} className="btn-ghost">Students</Link>
        </div>
      </div>

      <AsyncState loading={!data && !error} error={error}>
        {data && (
          <div className="space-y-6">
            {data.includesDemo && (
              <div className="flex items-center justify-between rounded-xl border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-sm text-fuchsia-200">
                <span className="flex items-center gap-2"><DemoBadge /> Numbers include demo data.</span>
                <button className="underline" onClick={() => setHideDemo(true)}>Hide demo data</button>
              </div>
            )}
            {hideDemo && <button className="text-xs text-slate-400 underline" onClick={() => setHideDemo(false)}>Show demo data</button>}

            {data.lessons.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No lessons in this course yet.</p>}

            {data.lessons.map((l) => (
              <section key={l.lessonId} className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-medium">{l.position}. {l.title}</h2>
                  <span className="text-xs text-slate-400">{l.sessions} session{l.sessions === 1 ? '' : 's'}</span>
                </div>

                {!l.enoughData ? (
                  <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-sm text-slate-400">
                    Not enough data yet — needs a few more valid sessions before averages are meaningful.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <Stat label="Avg engagement" value={l.avgEngagement ?? '—'} />
                      <Stat label="Valid measurement" value={l.validShare != null ? `${l.validShare}%` : '—'} />
                      <Stat label="Visual avg" value={l.variantEngagement.visual ?? '—'} />
                      <Stat label="Practical avg" value={l.variantEngagement.practical ?? '—'} />
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-300">Class engagement timeline</p>
                      <EngagementTimeline data={l.timeline} />
                      <p className="mt-1 text-xs text-slate-500">Average engagement vs % of lesson watched (band = spread across students).</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-300">Attention zones</p>
                        <ZoneDistribution dist={l.zoneDistribution} />
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-300">Emotions</p>
                        <CountPills dist={l.emotionDistribution} />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-medium text-slate-300">Adaptive actions fired</p>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {Object.keys(ACTION_LABELS).map((k) => (
                          <span key={k} className="pill">{ACTION_LABELS[k]}: {l.actions[k] || 0}</span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </section>
            ))}
          </div>
        )}
      </AsyncState>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
