import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { fmt } from '../api';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: 'M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10' },
  { to: '/students', label: 'Students', icon: 'M16 20v-2a4 4 0 00-8 0v2M12 11a4 4 0 100-8 4 4 0 000 8' },
  { to: '/attendance', label: 'Attendance', icon: 'M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { to: '/notifications', label: 'Notifications', icon: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h11zM9 17a3 3 0 006 0' },
  { to: '/settings', label: 'Settings', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1A1.7 1.7 0 004.6 19l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 13.4H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 5l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0010 1.6V1a2 2 0 114 0v.1A1.7 1.7 0 0017 3l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0021 10.6h.1a2 2 0 110 4H21a1.7 1.7 0 00-1.6 1z' }
];

function Icon({ path, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useAppData();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const recent = notifications.slice(0, 5);

  return (
    <div className="bell-wrap" ref={ref}>
      <button
        className="bell-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${unreadCount} unread`}
      >
        <Icon path="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h11zM9 17a3 3 0 006 0" />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="bell-dropdown">
          <div className="bell-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button className="link-btn" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>
          {recent.length === 0 && <p className="empty small">No notifications yet.</p>}
          <ul className="bell-list">
            {recent.map((n) => (
              <li
                key={n.id}
                className={`bell-item ${n.isRead ? '' : 'unread'}`}
                onClick={() => {
                  if (!n.isRead) markRead(n.id);
                  setOpen(false);
                  navigate('/notifications');
                }}
              >
                <span className={`dot ${n.type === 'student_late' ? 'dot-late' : 'dot-info'}`} />
                <div>
                  <p className="bell-title">{n.title}</p>
                  <p className="bell-msg">{n.message}</p>
                  <p className="bell-time">{fmt.relative(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
          <button
            className="bell-footer"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useAppData();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div className="toast-icon">{t.kind === 'late' ? '!' : 'i'}</div>
          <div className="toast-body">
            <strong>{t.title}</strong>
            <p>{t.message}</p>
          </div>
          <button className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { unreadCount, connected, settings } = useAppData();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <p className="brand-name">Attendance Monitor</p>
            <p className="brand-sub">Late Notification System</p>
          </div>
        </div>

        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <Icon path={item.icon} />
              <span>{item.label}</span>
              {item.to === '/notifications' && unreadCount > 0 && (
                <span className="nav-count">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="class-card">
            <p className="muted small">Official class start</p>
            <p className="class-time">{settings?.classStartTime || '08:00'}</p>
            <p className="muted small">
              {settings?.lateGraceMinutes ? `+${settings.lateGraceMinutes} min grace` : 'No grace period'}
            </p>
          </div>
        </div>
      </aside>

      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
            <Icon path="M4 6h16M4 12h16M4 18h16" />
          </button>

          <div className="topbar-right">
            <span className={`conn ${connected ? 'on' : 'off'}`}>
              <span className="conn-dot" />
              {connected ? 'Live' : 'Offline'}
            </span>
            <NotificationBell />
            <div className="user-chip">
              <div className="avatar">{user?.name?.charAt(0)?.toUpperCase() || 'A'}</div>
              <div className="user-meta">
                <p className="user-name">{user?.name || 'Teacher'}</p>
                <p className="user-role">{user?.role || 'admin'}</p>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <Toasts />
    </div>
  );
}
