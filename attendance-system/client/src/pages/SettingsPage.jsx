import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAppData } from '../context/AppDataContext';
import { Alert, Card, Field } from '../components/ui';

export default function SettingsPage() {
  const { settings, loadSettings } = useAppData();
  const [form, setForm] = useState({ className: 'Class Attendance', classStartTime: '08:00', lateGraceMinutes: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (settings) {
      setForm({
        className: settings.className || 'Class Attendance',
        classStartTime: settings.classStartTime || '08:00',
        lateGraceMinutes: settings.lateGraceMinutes ?? 0
      });
    }
  }, [settings]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.classStartTime)) {
      setError('Class start time must be a valid HH:mm 24-hour time (e.g. 08:00).');
      return;
    }
    if (Number(form.lateGraceMinutes) < 0 || Number(form.lateGraceMinutes) > 120) {
      setError('Grace period must be between 0 and 120 minutes.');
      return;
    }
    if (!form.className.trim()) {
      setError('Class name cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.updateSettings({
        className: form.className.trim(),
        classStartTime: form.classStartTime,
        lateGraceMinutes: Number(form.lateGraceMinutes)
      });
      setNotice(res.message || 'Settings saved.');
      await loadSettings();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Official class start time and event listener status</p>
        </div>
      </header>

      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="success" onClose={() => setNotice('')}>{notice}</Alert>

      <div className="grid-1">
        <Card title="Class schedule" subtitle="Used to decide whether a time-in is Present or Late">
          <form className="form-grid" onSubmit={save}>
            <Field label="Class name">
              <input className="input" value={form.className}
                onChange={(e) => setForm({ ...form, className: e.target.value })} />
            </Field>
            <div className="form-row">
              <Field label="Official class start time (HH:mm)" hint="24-hour format">
                <input className="input" type="time" value={form.classStartTime}
                  onChange={(e) => setForm({ ...form, classStartTime: e.target.value })} />
              </Field>
              <Field label="Grace period (minutes)" hint="0 = strictly on time">
                <input className="input" type="number" min="0" max="120" value={form.lateGraceMinutes}
                  onChange={(e) => setForm({ ...form, lateGraceMinutes: e.target.value })} />
              </Field>
            </div>
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
