import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import NotAvailable from '../components/NotAvailable.jsx';

/**
 * Gate for authenticated routes.
 * - Redirects to /login when signed out.
 * - `role` restricts a route to one role. A teacher who lands on a student route
 *   is sent to /teacher; a student who lands on a teacher route sees a clear
 *   "not available" page (URL preserved).
 * - `requireOnboarded` forces students to finish calibration first. Teachers never
 *   need onboarding.
 */
export default function ProtectedRoute({ children, requireOnboarded = true, role }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const userRole = user.role || 'student';

  if (role && userRole !== role) {
    if (userRole === 'teacher') return <Navigate to="/teacher" replace />;
    return <NotAvailable />;
  }

  // Teachers have no calibration; keep them out of the onboarding flow.
  if (userRole === 'teacher' && location.pathname === '/onboarding') {
    return <Navigate to="/teacher" replace />;
  }

  if (
    requireOnboarded &&
    userRole === 'student' &&
    profile &&
    !profile.onboardingComplete &&
    location.pathname !== '/onboarding'
  ) {
    return <Navigate to="/onboarding" replace />;
  }
  return children;
}
