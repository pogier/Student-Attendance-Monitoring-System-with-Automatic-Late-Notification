import { useMemo, useState } from 'react';
import { fmt } from '../api';
import { useAppData } from '../context/AppDataContext';
import { Card, EmptyState } from '../components/ui';

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification, connected } =
    useAppData();
  const [tab, setTab] = useState('all');

  const visible = useMemo(() => {
    if (tab === 'unread') return notifications.filter((n) => !n.isRead);
    if (tab === 'late') return notifications.filter((n) => n.type === 'student_late');
    return notifications;
  }, [notifications, tab]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Notifications</h1>
          <p className="muted">
            {unreadCount} unread · {notifications.length} in history ·{' '}
            <span className={`conn ${connected ? 'on' : 'off'} inline`}>
              <span className="conn-dot" />
              {connected ? 'live updates on' : 'offline'}
            </span>
          </p>
        </div>
        <button className="btn btn-ghost" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all as read
        </button>
      </header>

      <div className="tabs">
        {[
          ['all', `All (${notifications.length})`],
          ['unread', `Unread (${unreadCount})`],
          ['late', 'Late arrivals']
        ].map(([key, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        {visible.length === 0 ? (
          <EmptyState
            title="No notifications here"
            description="Late arrivals automatically appear in this list."
          />
        ) : (
          <ul className="notif-list">
            {visible.map((n) => (
              <li key={n.id} className={`notif ${n.isRead ? '' : 'unread'}`}>
                <div className={`notif-icon ${n.type === 'student_late' ? 'late' : 'info'}`}>
                  {n.type === 'student_late' ? '!' : 'i'}
                </div>
                <div className="notif-body">
                  <div className="notif-head">
                    <p className="cell-strong">
                      {n.title}
                      {!n.isRead && <span className="unread-dot" />}
                    </p>
                    <span className="muted small">{fmt.relative(n.createdAt)}</span>
                  </div>
                  <p className="notif-msg">{n.message}</p>
                  <div className="notif-meta">
                    <code>{n.type}</code>
                    {n.studentId && <span className="muted small">{n.studentId}</span>}
                    {n.meta?.classStartTime && (
                      <span className="muted small">class start {n.meta.classStartTime}</span>
                    )}
                    <span className="muted small">{fmt.dateTime(n.createdAt)}</span>
                  </div>
                </div>
                <div className="notif-actions">
                  {!n.isRead && (
                    <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.id)}>
                      Mark read
                    </button>
                  )}
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => deleteNotification(n.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
