import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, getToken } from '../api/client.js';

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/** Holds the session user + profile, and exposes auth actions. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setProfile(null);
      return null;
    }
    const me = await api('/me');
    setUser(me.user);
    setProfile(me.profile);
    return me;
  }, []);

  useEffect(() => {
    refresh()
      .catch(() => {
        setToken(null); // stale/invalid token
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } });
    setToken(res.token);
    await refresh();
    return res;
  }, [refresh]);

  const register = useCallback(async (email, name, password, { role, inviteCode } = {}) => {
    const body = { email, name, password };
    if (role === 'teacher') {
      body.role = 'teacher';
      body.inviteCode = inviteCode;
    }
    const res = await api('/auth/register', { method: 'POST', auth: false, body });
    setToken(res.token);
    await refresh();
    return res;
  }, [refresh]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, login, register, logout, refresh, setProfile }),
    [user, profile, loading, login, register, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
