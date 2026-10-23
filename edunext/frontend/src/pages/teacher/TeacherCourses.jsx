import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { teacherApi } from '../../api/teacher.js';
import { AsyncState, StatusBadge } from './components.jsx';

export default function TeacherCourses() {
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await teacherApi.listCourses();
      setCourses(res.courses);
    } catch (err) {
      setError(err.message || 'Could not load your courses');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">My courses</h1>
          <p className="mt-1 text-sm text-slate-400">Create, publish and track your courses.</p>
        </div>
        <Link to="/teacher/courses/new" className="btn-primary">New course</Link>
      </div>

      <AsyncState
        loading={courses === null && !error}
        error={error}
        empty={courses && courses.length === 0}
        emptyText="No courses yet — create your first one."
      >
        <ul className="space-y-3">
          {courses?.map((c) => (
            <li key={c.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center">
              {c.coverThumbnail ? (
                <img src={c.coverThumbnail} alt="" className="h-16 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />
              ) : (
                <div className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-white/5 text-xs text-slate-500">
                  No lessons
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/teacher/courses/${c.id}`} className="font-medium text-slate-100 hover:underline">
                    {c.title}
                  </Link>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {c.lessonCount} lesson{c.lessonCount === 1 ? '' : 's'} · {c.studentCount} student
                  {c.studentCount === 1 ? '' : 's'} · {c.topic}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={`/teacher/courses/${c.id}`} className="btn-ghost">Edit</Link>
                <Link to={`/teacher/courses/${c.id}/analytics`} className="btn-ghost">Analytics</Link>
              </div>
            </li>
          ))}
        </ul>
      </AsyncState>
    </div>
  );
}
