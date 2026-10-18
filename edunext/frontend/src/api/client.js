const TOKEN_KEY = 'edunext_token';

// --- API base URL (environment-driven) --------------------------------------
// Production MUST set VITE_API_URL to the backend origin (no trailing slash).
// In dev with nothing set we fall back to the Vite proxy (relative /api).
const RAW_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
/** '' => use relative /api (dev proxy). A URL => absolute. */
export const API_BASE = RAW_BASE || (import.meta.env.DEV ? '' : '');
/** True when a production build shipped without VITE_API_URL — the app shows a
 *  clear configuration error instead of silently failing every request. */
export const API_MISCONFIGURED = Boolean(import.meta.env.PROD && !RAW_BASE);

if (API_MISCONFIGURED) {
  // eslint-disable-next-line no-console
  console.error('[EduNext] VITE_API_URL is not set for this production build — API calls will fail. Set it to your backend URL and rebuild.');
}

function apiUrl(path) {
  return `${API_BASE}/api${path}`;
}
/** Health endpoint lives at the backend root (not under /api). */
export function healthUrl() {
  return `${API_BASE}/health`;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Fetch with a timeout (AbortController). */
async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Thin JSON fetch wrapper. Attaches the bearer token (header transport — works
 * cross-origin with no cookies), parses the consistent `{ error }` shape, and
 * throws ApiError on non-2xx. Idempotent GETs are retried once on a network
 * error (covers a Render free-instance waking up mid-request).
 */
export async function api(path, { method = 'GET', body, auth = true, timeoutMs = 20000 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const opts = { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined };
  const isIdempotent = method === 'GET';

  let res;
  try {
    res = await fetchWithTimeout(apiUrl(path), opts, timeoutMs);
  } catch (err) {
    if (isIdempotent) {
      // One retry after a short delay — the server may have been asleep.
      await new Promise((r) => setTimeout(r, 1200));
      res = await fetchWithTimeout(apiUrl(path), opts, timeoutMs);
    } else {
      throw new ApiError(0, 'network', 'Could not reach the server. It may be waking up — please try again.');
    }
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const e = (data && data.error) || {};
    throw new ApiError(res.status, e.code || 'error', e.message || 'Request failed', e.details);
  }
  return data;
}

/**
 * Ping the backend health endpoint. Returns true if it answers ok within `ms`.
 * Used by the cold-start "waking up" UI.
 */
export async function pingHealth(ms = 2500) {
  try {
    const res = await fetchWithTimeout(healthUrl(), { method: 'GET' }, ms);
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!data && (data.status === 'ok' || data.ok === true);
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget tick flush that survives page unload (used by the lesson
 * controller). Falls back to keepalive fetch when sendBeacon is unavailable.
 */
export function beaconTicks(sessionId, ticks) {
  const token = getToken();
  const payload = JSON.stringify({ ticks });
  const url = apiUrl(`/sessions/${sessionId}/ticks`);
  // sendBeacon can't set an Authorization header, so use keepalive fetch.
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}
