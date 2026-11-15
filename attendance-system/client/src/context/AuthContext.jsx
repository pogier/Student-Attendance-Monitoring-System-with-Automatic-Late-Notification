import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, auth } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => auth.getUser());
  const [token, setToken] = useState(() => auth.getToken());
  const [booting, setBooting] = useState(Boolean(auth.getToken()));

  // Validate a stored token once on load.
  useEffect(() => {
    if (!token) {
      setBooting(false);
      return;
    }
    let cancelled = false;
    api
      .me()
      .then(({ user: fresh }) => {
        if (!cancelled) {
          setUser(fresh);
          auth.save(token, fresh);
        }
      })
      .catch(() => {
        if (!cancelled) {
          auth.clear();
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => !cancelled && setBooting(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (username, password) => {
    const { token: newToken, user: newUser } = await api.login(username, password);
    auth.save(newToken, newUser);
    setToken(newToken);
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    auth.clear();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, booting, login, logout, isAuthenticated: Boolean(token) }),
    [user, token, booting, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Fires `handler(data)` whenever the server broadcasts `eventName` on the socket. */
export function useSocketEvent(socket, eventName, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return undefined;
    const listener = (payload) => ref.current(payload);
    socket.on(eventName, listener);
    return () => socket.off(eventName, listener);
  }, [socket, eventName]);
}
