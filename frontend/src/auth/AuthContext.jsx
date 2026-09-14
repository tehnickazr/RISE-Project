import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Who to write to when something breaks. It arrives with /api/me rather than
  // on its own endpoint, because every error state in the interface wants it and
  // a second round trip at the moment something is already broken is the round
  // trip most likely to fail too.
  const [support, setSupport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(({ user, support }) => {
        setUser(user);
        setSupport(support ?? null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { user } = await api.login(email, password);
    setUser(user);
    // The sign-in reply carries no contacts, so fetch them once behind the
    // navigation rather than blocking it. A help sheet that is empty for the
    // first second after signing in is better than a slower sign-in.
    api.me().then((d) => setSupport(d.support ?? null)).catch(() => {});
    return user;
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setSupport(null);
  };

  /** Re-read the account after the user edits it on the account page. */
  const refreshUser = async () => {
    const { user: fresh, support: contacts } = await api.me();
    setUser(fresh);
    setSupport(contacts ?? null);
    return fresh;
  };

  const setLanguage = async (language) => {
    await api.setLanguage(language);
    setUser((u) => ({ ...u, preferred_language: language }));
  };

  return (
    <AuthCtx.Provider value={{ user, support, loading, login, logout, setLanguage, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
