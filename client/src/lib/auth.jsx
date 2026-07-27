import { createContext, useContext, useEffect, useState } from 'react';
import { api, get, post, setToken, getToken } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }
    get('/auth/me').then(setUser).catch(() => setToken(null)).finally(() => setLoading(false));
  }, []);

  const signIn = async (identifier, password) => {
    const { token } = await post('/auth/login', { identifier, password });
    setToken(token);
    setUser(await get('/auth/me'));
  };

  const signOut = () => { setToken(null); setUser(null); };

  /* the same question the server asks, so the interface hides what the API would refuse */
  const can = (slug) => !!user?.permissions?.includes(slug);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
