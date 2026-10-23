import { useEffect, useRef, useState } from 'react';
import { parseYouTubeUrl } from '@edunext/shared';
import { teacherApi } from '../../api/teacher.js';

/** Coloured status pill for a course. */
export function StatusBadge({ status }) {
  const map = {
    draft: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
    published: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
    archived: 'border-slate-400/30 bg-slate-400/10 text-slate-400',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

/** "Demo data" badge for synthetic analytics rows. */
export function DemoBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-fuchsia-300">
      Demo data
    </span>
  );
}

/** Loading / empty / error wrapper so every page has consistent states. */
export function AsyncState({ loading, error, empty, emptyText = 'Nothing here yet.', children }) {
  if (loading) return <div className="py-12 text-center text-sm text-slate-400" role="status">Loading…</div>;
  if (error)
    return (
      <div className="card border-rose-500/30 text-center text-sm text-rose-300" role="alert">
        {error}
      </div>
    );
  if (empty) return <div className="py-12 text-center text-sm text-slate-400">{emptyText}</div>;
  return children;
}

/**
 * Accessible confirm dialog. For permanent delete, pass `confirmText` to require
 * the user to type it exactly before the action enables.
 */
export function ConfirmDialog({ open, title, body, confirmText, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) {
      setTyped('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel?.();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const ready = !confirmText || typed === confirmText;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="glass-strong w-full max-w-md p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-2 text-sm text-slate-300">{body}</div>
        {confirmText && (
          <div className="mt-4">
            <label className="label" htmlFor="confirm-input">
              Type <code className="rounded bg-white/10 px-1 text-slate-100">{confirmText}</code> to confirm
            </label>
            <input id="confirm-input" ref={inputRef} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={!ready || busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * YouTube URL input with a debounced live preview (thumbnail + verified title).
 * Parses on the client, then calls the oEmbed check endpoint to confirm the
 * video is embeddable. Reports validity up via onValidity(videoId|null).
 */
export function YouTubeField({ id, label, value, onChange, onValidity, optional }) {
  const [state, setState] = useState({ status: 'idle' }); // idle|checking|ok|error
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const raw = (value || '').trim();
    if (!raw) {
      setState({ status: 'idle' });
      onValidity?.(null);
      return;
    }
    const parsed = parseYouTubeUrl(raw);
    if (parsed.error) {
      setState({ status: 'error', message: 'Not a valid YouTube link' });
      onValidity?.(null);
      return;
    }
    setState({ status: 'checking', videoId: parsed.videoId });
    timer.current = setTimeout(async () => {
      try {
        const res = await teacherApi.checkVideo(parsed.videoId);
        if (res.ok) {
          setState({ status: 'ok', videoId: parsed.videoId, title: res.title, author: res.author });
          onValidity?.(parsed.videoId);
        } else {
          setState({ status: 'error', message: `Can't embed this video (${res.reason})` });
          onValidity?.(null);
        }
      } catch {
        setState({ status: 'error', message: 'Could not verify this video' });
        onValidity?.(null);
      }
    }, 500);
    return () => clearTimeout(timer.current);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const describedBy = `${id}-status`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} {optional && <span className="text-slate-500">(optional)</span>}
      </label>
      <input
        id={id}
        className="input"
        placeholder="https://www.youtube.com/watch?v=…"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={state.status === 'error'}
        autoComplete="off"
      />
      <div id={describedBy} className="mt-2 min-h-[1.25rem] text-xs" aria-live="polite">
        {state.status === 'checking' && <span className="text-slate-400">Checking…</span>}
        {state.status === 'error' && <span className="text-rose-400">{state.message}</span>}
        {state.status === 'ok' && (
          <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2">
            <img
              src={`https://i.ytimg.com/vi/${state.videoId}/mqdefault.jpg`}
              alt=""
              className="h-10 w-16 rounded object-cover"
              loading="lazy"
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-200">{state.title}</p>
              <p className="truncate text-slate-500">{state.author}</p>
            </div>
            <span className="ml-auto text-emerald-400" aria-label="verified">✓</span>
          </div>
        )}
      </div>
    </div>
  );
}
