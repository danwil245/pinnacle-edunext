import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { TrackingProvider } from './tracking/TrackingProvider.jsx';
import TrackerRouteGate from './tracking/TrackerRouteGate.jsx';
import { SmoothScrollProvider } from './motion/SmoothScrollProvider.jsx';
import { MotionBudgetProvider } from './motion/useMotionBudget.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import Layout from './components/Layout.jsx';
import RouteFallback from './components/RouteFallback.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ConfigError from './components/ConfigError.jsx';
import ServerWaking from './components/ServerWaking.jsx';
import { API_MISCONFIGURED } from './api/client.js';
import Intro from './motion/Intro.jsx';
import CursorFollower from './motion/CursorFollower.jsx';

// Route-level code splitting: each page is its own chunk so the initial bundle
// no longer carries every route (and Recharts, which only the chart routes use)
// up front. The app shell + providers + motion foundation stay eager.
const Landing = lazy(() => import('./pages/Landing.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const Onboarding = lazy(() => import('./pages/onboarding/Onboarding.jsx'));
const Dev = lazy(() => import('./pages/Dev.jsx'));
const Demo = lazy(() => import('./pages/Demo.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const Course = lazy(() => import('./pages/Course.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Insights = lazy(() => import('./pages/Insights.jsx'));
const Lesson = lazy(() => import('./pages/lesson/Lesson.jsx'));
const Summary = lazy(() => import('./pages/Summary.jsx'));

/**
 * App shell. MotionBudgetProvider + TrackingProvider sit ABOVE the router so the
 * camera + FaceMesh are owned once and never remount on navigation, and the
 * performance guard spans the whole app. SmoothScrollProvider (one Lenis instance)
 * sits inside the router but above the routes so it survives navigation.
 * AuthProvider holds the session; ProtectedRoute gates authenticated pages.
 */
export default function App() {
  // A production build with no VITE_API_URL can't talk to a backend — fail loudly.
  if (API_MISCONFIGURED) return <ConfigError />;
  return (
    <ErrorBoundary>
    <MotionBudgetProvider>
      <TrackingProvider>
        <BrowserRouter>
          <SmoothScrollProvider>
            <AuthProvider>
              <ServerWaking />
              <TrackerRouteGate />
              <Intro />
              <CursorFollower />
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute requireOnboarded={false}>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />
                <Route path="/dev" element={<Dev />} />
                <Route path="/demo" element={<Demo />} />

                {/* Authenticated, onboarded pages share the app chrome. */}
                <Route
                  element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/home" element={<Home />} />
                  <Route path="/courses/:slug" element={<Course />} />
                  <Route path="/insights" element={<Insights />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>

                {/* Full-bleed authenticated pages (no chrome). */}
                <Route
                  path="/learn/:lessonId"
                  element={
                    <ProtectedRoute>
                      <Lesson />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/summary/:sessionId"
                  element={
                    <ProtectedRoute>
                      <Summary />
                    </ProtectedRoute>
                  }
                />

                <Route path="*" element={<Navigate to="/home" replace />} />
              </Routes>
              </Suspense>
            </AuthProvider>
          </SmoothScrollProvider>
        </BrowserRouter>
      </TrackingProvider>
    </MotionBudgetProvider>
    </ErrorBoundary>
  );
}
