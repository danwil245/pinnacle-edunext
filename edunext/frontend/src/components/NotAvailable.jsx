import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

/** Shown when a user reaches an area their role can't use (e.g. a student on /teacher/*). */
export default function NotAvailable() {
  const { user } = useAuth();
  const home = user?.role === 'teacher' ? '/teacher' : '/home';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong max-w-md p-8 text-center">
        <h1 className="mb-2 text-xl font-semibold">This area isn't available</h1>
        <p className="mb-6 text-sm text-slate-400">
          The teacher dashboard is only for teacher accounts. If you think this is a
          mistake, check that you're signed in with the right account.
        </p>
        <Link to={home} className="btn-primary">Back to your home</Link>
      </div>
    </div>
  );
}
