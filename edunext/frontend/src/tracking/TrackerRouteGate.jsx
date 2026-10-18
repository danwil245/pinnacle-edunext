import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTracking } from './TrackingContext.js';

/**
 * Route-driven tracker lifecycle. The camera + FaceMesh + emotion inference are
 * expensive and must only run where they're needed. The persistent tracker still
 * never *remounts* on navigation (it lives above the router), but this gate
 * STOPS it — stopping the camera track, the detection loop and inference — the
 * moment we land on a route that doesn't need tracking.
 *
 * Tracking routes: onboarding (calibration/style probe), the lesson player, and
 * the dev/demo consoles. Everywhere else (home, courses, insights, profile,
 * summary, auth, landing) the tracker is fully stopped, so those pages are as
 * light as `/login`. Pages that need tracking start it themselves on demand.
 */
const TRACKING_PREFIXES = ['/onboarding', '/learn', '/dev', '/demo'];

export function isTrackingRoute(pathname) {
  return TRACKING_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function TrackerRouteGate() {
  const { pathname } = useLocation();
  const { started, stop } = useTracking();

  useEffect(() => {
    if (!isTrackingRoute(pathname) && started) {
      stop();
    }
  }, [pathname, started, stop]);

  return null;
}
