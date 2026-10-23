import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { AuthShell } from './Login.jsx';
import { InlineError } from '../motion/primitives.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [isTeacher, setIsTeacher] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (isTeacher && !inviteCode.trim()) {
      setError('Enter your teacher invite code.');
      return;
    }
    setBusy(true);
    try {
      const res = await register(form.email, form.name, form.password, {
        role: isTeacher ? 'teacher' : 'student',
        inviteCode: inviteCode.trim(),
      });
      navigate(res?.user?.role === 'teacher' ? '/teacher' : '/onboarding');
    } catch (err) {
      setError(err.message || 'Could not create your account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="A minute to set up, then a quick calibration">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" required className="input" value={form.name} onChange={set('name')} />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={form.email} onChange={set('email')} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" required className="input"
            value={form.password} onChange={set('password')} aria-describedby="pwhint" />
          <p id="pwhint" className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/20 bg-transparent text-sky-500 focus:ring-sky-500"
              checked={isTeacher}
              onChange={(e) => setIsTeacher(e.target.checked)}
              aria-controls="invite-field"
              aria-expanded={isTeacher}
            />
            <span className="text-slate-200">I'm a teacher</span>
          </label>
          {isTeacher && (
            <div id="invite-field" className="mt-3">
              <label className="label" htmlFor="inviteCode">Teacher invite code</label>
              <input
                id="inviteCode"
                className="input"
                autoComplete="off"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                aria-describedby="invitehint"
              />
              <p id="invitehint" className="mt-1 text-xs text-slate-500">
                Provided by your institution. Teacher accounts skip the camera calibration.
              </p>
            </div>
          )}
        </div>

        {error && <InlineError>{error}</InlineError>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-400">
        Already have an account? <Link to="/login" className="text-sky-400 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
