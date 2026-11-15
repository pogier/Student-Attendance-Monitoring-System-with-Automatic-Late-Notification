import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.username.trim() || !form.password) {
      setError('Please enter both your username and password.');
      return;
    }
    setLoading(true);
    try {
      await login(form.username.trim(), form.password);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => setForm({ username: 'admin', password: 'admin123' });

  return (
    <div className="login-page">
      <div className="login-aside">
        <div className="login-brand">
          <div className="brand-mark lg">A</div>
          <span>Attendance Monitor</span>
        </div>
        <h1>Track attendance.<br />Catch late arrivals automatically.</h1>
        <p className="login-lead">
          Record a student&apos;s time-in and the system compares it with the official class start
          time. Late students raise a <code>student_late</code> event, and a separate notification
          listener instantly creates an in-app alert.
        </p>
        <ol className="flow-steps">
          <li><span>1</span> Teacher clicks <b>Time In</b></li>
          <li><span>2</span> Backend saves attendance &amp; checks lateness</li>
          <li><span>3</span> <code>student_late</code> event is published</li>
          <li><span>4</span> Notification listener saves the alert</li>
          <li><span>5</span> React UI shows it instantly</li>
        </ol>
      </div>

      <div className="login-panel">
        <form className="login-card" onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="muted small">Teacher / administrator access</p>

          <Alert>{error}</Alert>

          <label className="field">
            <span className="field-label">Username</span>
            <input
              className="input"
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="admin"
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </label>

          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="demo-hint">
            <p className="muted small">Demo account</p>
            <p className="mono">admin / admin123</p>
            <button type="button" className="link-btn" onClick={fillDemo}>
              Use demo credentials
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
