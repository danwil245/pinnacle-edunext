import { useSyncExternalStore, useCallback } from 'react';

// Reduced motion is true when EITHER the OS prefers it OR the user flipped the
// in-app toggle (Profile page). The value is a small external store so every
// component re-renders together the moment it changes, without prop-drilling.

const STORAGE_KEY = 'edunext_reduce_motion';
const listeners = new Set();

function readOsPref() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function readToggle() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

let osPref = readOsPref();
let toggle = readToggle();
let snapshot = osPref || toggle;

function recompute() {
  const next = osPref || toggle;
  if (next !== snapshot) {
    snapshot = next;
    for (const l of listeners) l();
  }
}

if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => {
    osPref = mq.matches;
    recompute();
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
  // React across tabs/other instances.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      toggle = readToggle();
      recompute();
    }
  });
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return snapshot;
}

/** Set (or clear) the in-app reduce-motion preference. */
export function setReduceMotionPreference(on) {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore persistence failures */
  }
  toggle = !!on;
  recompute();
}

/** Read whether the in-app toggle (ignoring OS) is on. */
export function getReduceMotionToggle() {
  return toggle;
}

/** Live boolean: should motion be reduced right now? */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** [reduced, setToggle] convenience for a settings control. */
export function useReduceMotionToggle() {
  const reduced = useReducedMotion();
  const set = useCallback((on) => setReduceMotionPreference(on), []);
  return [reduced, set, toggle];
}
