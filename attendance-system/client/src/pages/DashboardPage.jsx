import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useAppData } from '../context/AppDataContext';
import { useSocketEvent } from '../context/AuthContext';
import { Card, StatCard, StatusPill, Spinner, EmptyState } from '../components/ui';

export default function DashboardPage() {
  const { socket, unreadCount } = useAppData();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await api.getDashboard());
    } catch {
      /* the cards fall back to zeros */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketEvent(socket, 'attendance:time_in', load);
  useSocketEvent(socket, 'attendance:time_out', load);
  useSocketEvent(socket, 'notification:new', load);

  if (loading && !data) return <Spinner label="Loading dashboard…" />;

  const d = data || {
    totalStudents: 0,
    present: 0,
    late: 0,
    excused: 0,
    absent: 0,
    totalNotifications: 0,
    recentRecords: []
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            {fmt.date(d.date)} · Class starts at <b>{d.classStartTime}</b>
            {d.lateGraceMinutes ? ` (+${d.lateGraceMinutes} min grace)` : ''}
          </p>
        </div>
        <Link to="/attendance" className="btn btn-primary">
          Record attendance
        </Link>
      </header>

      <div className="stat-grid">
        <StatCard
          label="Total students"
          value={d.totalStudents}
          hint="Active records"
          tone="indigo"
          icon="👥"
        />
        <StatCard label="Present today" value={d.present} hint="On time" tone="green" icon="✓" />
        <StatCard label="Late today" value={d.late} hint="After class start" tone="amber" icon="!" />
        <StatCard label="Excused today" value={d.excused} hint="With a valid reason" tone="rose" icon="◍" />
        <StatCard
          label="Total notifications"
          value={d.totalNotifications}
          hint={`${unreadCount} unread`}
          tone="slate"
          icon="🔔"
        />
      </div>

      <div className="grid-2">
        <Card
          title="Today's attendance"
          subtitle="Most recent check-ins"
          action={<Link to="/attendance" className="link-btn">View all</Link>}
        >
          {d.recentRecords.length === 0 ? (
            <EmptyState
              title="No attendance recorded yet today"
              description="Go to the Attendance page and click Time In for a student."
            />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Time in</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentRecords.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <p className="cell-strong">{r.studentName}</p>
                        <p className="muted small mono">{r.studentId}</p>
                      </td>
                      <td>{r.status === 'Excused' ? '—' : fmt.time(r.timeIn)}</td>
                      <td>
                        <StatusPill status={r.status} />
                        {r.status === 'Late' && (
                          <span className="muted small"> {fmt.lateLabel(r.lateMinutes)}</span>
                        )}
                        {r.status === 'Excused' && r.excuseReason && (
                          <span className="muted small"> {r.excuseReason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Summary" subtitle="Today at a glance">
          <div className="summary-rows">
            <div className="summary-row">
              <span className="summary-label">Present</span>
              <span className="summary-value">{d.present}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Late</span>
              <span className="summary-value">{d.late}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Excused</span>
              <span className="summary-value">{d.excused}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label">Not marked / absent</span>
              <span className="summary-value">{d.absent}</span>
            </div>
          </div>
          <div className="summary-foot">
            <p className="muted small">
              Total notifications: <b>{d.totalNotifications}</b> · {unreadCount} unread
            </p>
            <Link to="/notifications" className="link-btn">
              Open notifications
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
