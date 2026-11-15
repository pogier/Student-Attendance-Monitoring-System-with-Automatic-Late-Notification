import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api';
import { useAuth } from './AuthContext';

const AppDataContext = createContext(null);

let toastId = 0;

export function AppDataProvider({ children }) {
  const { isAuthenticated } = useAuth();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState(null);
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [lastEvent, setLastEvent] = useState(null); // for the "event trail" panel
  const socketRef = useRef(null);

  const pushToast = useCallback((toast) => {
    const id = ++toastId;
    // Keep at most 2 on screen — during fast attendance marking the grid's own
    // confirmation strip is enough, and a toast pile-up would hide the page.
    setToasts((prev) => [...prev.slice(-1), { id, ...toast }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api.getNotifications({ limit: 100 });
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch (err) {
      /* silent – the UI shows connection state elsewhere */
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const { settings: s } = await api.getSettings();
      setSettings(s);
    } catch {
      /* ignore */
    }
  }, []);

  // Initial load + socket connection when authenticated.
  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      return;
    }

    loadNotifications();
    loadSettings();

    const s = io({ path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = s;
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    // --- the realtime listener on the server pushes this event ---
    s.on('notification:new', (notification) => {
      setNotifications((prev) => [notification, ...prev.filter((n) => n.id !== notification.id)]);
      setUnreadCount((c) => c + 1);
      setLastEvent({ name: 'notification:new', at: new Date().toISOString(), payload: notification });
      pushToast({
        kind: notification.type === 'student_late' ? 'late' : 'info',
        title: notification.title,
        message: notification.message
      });
    });

    s.on('attendance:time_in', (payload) => {
      setLastEvent({ name: 'attendance:time_in', at: new Date().toISOString(), payload });
    });
    s.on('attendance:time_out', (payload) => {
      setLastEvent({ name: 'attendance:time_out', at: new Date().toISOString(), payload });
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, loadNotifications, loadSettings, pushToast]);

  const markRead = useCallback(async (id) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markRead(id);
    } catch {
      loadNotifications();
    }
  }, [loadNotifications]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await api.markAllRead();
    } catch {
      loadNotifications();
    }
  }, [loadNotifications]);

  const deleteNotification = useCallback(async (id) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target && !target.isRead) setUnreadCount((c) => Math.max(0, c - 1));
      return prev.filter((n) => n.id !== id);
    });
    try {
      await api.deleteNotification(id);
    } catch {
      loadNotifications();
    }
  }, [loadNotifications]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      settings,
      setSettings,
      loadSettings,
      loadNotifications,
      markRead,
      markAllRead,
      deleteNotification,
      socket,
      connected,
      toasts,
      pushToast,
      dismissToast,
      lastEvent
    }),
    [
      notifications,
      unreadCount,
      settings,
      loadSettings,
      loadNotifications,
      markRead,
      markAllRead,
      deleteNotification,
      socket,
      connected,
      toasts,
      pushToast,
      dismissToast,
      lastEvent
    ]
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used inside <AppDataProvider>');
  return ctx;
}
