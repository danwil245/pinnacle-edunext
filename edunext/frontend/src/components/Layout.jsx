import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTracking } from '../tracking/TrackingContext.js';
import { PageTransition } from '../motion/primitives.jsx';
import Ambient from '../motion/Ambient.jsx';
import ScrollProgress from '../motion/ScrollProgress.jsx';

const navItems = [
  { to: '/home', label: 'Home' },
  { to: '/insights', label: 'Insights' },
  { to: '/profile', label: 'Profile' },
];

/** App chrome for authenticated, onboarded pages: scroll-aware nav + routed content. */
export default function Layout() {
  const { user, logout } = useAuth();
  const tracking = useTracking();
  const navigate = useNavigate();
  const location = useLocation();
  const showDev = tracking.source === 'mock' || import.meta.env.DEV;

  // Scroll-aware header: condenses + gains a shadow once the page scrolls.
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
          scrolled
            ? 'border-white/10 bg-slate-950/90 shadow-lg shadow-black/20'
            : 'border-transparent bg-slate-900/60'
        }`}
      >
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <NavLink to="/home" className="font-display text-lg font-bold tracking-tight">
            Edu<span className="text-sky-400">Next</span>
          </NavLink>
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive ? 'text-white' : 'text-slate-300 hover:text-white'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && (
                      <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-sky-400" aria-hidden />
                    )}
                  </>
                )}
              </NavLink>
            ))}
            {showDev && (
              <NavLink to="/dev" className="rounded-lg px-3 py-1.5 text-sm text-amber-300 hover:text-amber-200">
                Dev
              </NavLink>
            )}
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
        {/* Scroll-progress indicator along the bottom edge of the nav. */}
        <ScrollProgress className="h-0.5 w-full" />
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Re-mount the transition per route so page content animates in on nav. */}
        <PageTransition key={location.pathname}>
          <Outlet />
        </PageTransition>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-4 py-8 text-xs text-slate-500">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-6">
          <span>EduNext · attention is estimated on-device — a signal, not a diagnosis.</span>
          <Link to="/" className="text-slate-400 transition hover:text-slate-200">
            About EduNext
          </Link>
        </div>
      </footer>
    </div>
  );
}
