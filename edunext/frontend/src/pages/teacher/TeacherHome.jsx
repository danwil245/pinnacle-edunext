import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';

/**
 * Teacher overview. The analytics summary (D3) renders here once wired; until a
 * teacher has courses this is the empty-state welcome.
 */
export default function TeacherHome() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Welcome{user ? `, ${user.name}` : ''}</h1>
        <p className="mt-1 text-sm text-slate-400">
          Create courses, add YouTube lessons, and see how attentive your students are —
          all from derived numbers, never camera video.
        </p>
      </div>
      <div className="card">
        <h2 className="text-lg font-medium">Get started</h2>
        <p className="mt-1 text-sm text-slate-400">Build your first course and publish it for students.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/teacher/courses/new" className="btn-primary">New course</Link>
          <Link to="/teacher/courses" className="btn-ghost">My courses</Link>
        </div>
      </div>
    </div>
  );
}
