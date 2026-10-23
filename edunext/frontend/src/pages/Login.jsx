import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import VantaBackground from '../motion/VantaBackground.jsx';
import { Reveal, InlineError } from '../motion/primitives.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await login(email, password);
      navigate(res?.user?.role === 'teacher' ? '/teacher' : '/home');
    } catch (err) {
      setError(err.message || 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue learning">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required className="input"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <InlineError>{error}</InlineError>}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-400">
        New here? <Link to="/register" className="text-sky-400 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <VantaBackground />
      <Reveal className="relative z-10 w-full max-w-md">
        <div className="glass-strong p-6 sm:p-8">
          <Link to="/" className="mb-6 inline-block font-display text-sm text-slate-400 transition hover:text-slate-200">
            ← Edu<span className="text-sky-400">Next</span>
          </Link>
          <h1 className="mb-1">{title}</h1>
          <p className="mb-6 text-sm text-slate-400">{subtitle}</p>
          {children}
        </div>
      </Reveal>
    </div>
  );
}
