import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';
import { PageTransition } from '../../motion/primitives.jsx';
import Ambient from '../../motion/Ambient.jsx';

const navItems = [
  { to: '/teacher', label: 'Overview', end: true },
  { to: '/teacher/courses', label: 'Courses' },
];

/** App chrome for the teacher dashboard: role-specific nav + routed content. */
export default function TeacherLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col">
      <Ambient className="fixed" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-sky-600 focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to content
      </a>
      <header
        className={`sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-300 ${
          scrolled ? 'border-white/10 bg-slate-950/90 shadow-lg shadow-black/20' : 'border-transparent bg-slate-900/60'
        }`}
      >
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <NavLink to="/teacher" className="font-display text-lg font-bold tracking-tight">
            Edu<span className="text-sky-400">Next</span>
            <span className="ml-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[11px] font-medium text-sky-300">
              Teacher
            </span>
          </NavLink>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive ? 'text-white' : 'text-slate-300 hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="ml-2 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:text-white"
            >
              Sign out{user ? ` (${user.name})` : ''}
            </button>
          </div>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageTransition key={location.pathname}>
          <Outlet />
        </PageTransition>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 py-8 text-xs text-slate-500">
        <div className="border-t border-white/5 pt-6">
          EduNext · teacher view shows derived engagement numbers only — never camera video or frames.
        </div>
      </footer>
    </div>
  );
}
