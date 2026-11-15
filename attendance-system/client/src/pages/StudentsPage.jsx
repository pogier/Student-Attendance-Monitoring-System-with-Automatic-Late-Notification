import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, fmt } from '../api';
import { Alert, Card, EmptyState, Field, Modal, Spinner } from '../components/ui';

const BLANK = {
  studentId: '',
  firstName: '',
  lastName: '',
  course: '',
  yearLevel: '',
  section: '',
  email: '',
  isActive: true
};

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [form, setForm] = useState(BLANK);
  const [editing, setEditing] = useState(null); // student object or null
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [history, setHistory] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { students: list } = await api.getStudents({ search });
      setStudents(list);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 250); // debounce search
    return () => clearTimeout(t);
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(BLANK);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (student) => {
    setEditing(student);
    setForm({
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      course: student.course || '',
      yearLevel: student.yearLevel || '',
      section: student.section || '',
      email: student.email || '',
      isActive: student.isActive !== false
    });
    setFormError('');
    setModalOpen(true);
  };

  const validate = () => {
    if (!form.studentId.trim()) return 'Student ID is required.';
    if (!/^[A-Za-z0-9-]{3,20}$/.test(form.studentId.trim())) {
      return 'Student ID must be 3-20 characters (letters, numbers, dashes).';
    }
    if (!form.firstName.trim()) return 'First name is required.';
    if (!form.lastName.trim()) return 'Last name is required.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return 'Please enter a valid email address.';
    }
    return '';
  };

  const save = async (e) => {
    e.preventDefault();
    const v = validate();
    if (v) {
      setFormError(v);
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        const res = await api.updateStudent(editing._id, form);
        setNotice(res.message || 'Student updated.');
      } else {
        const res = await api.createStudent(form);
        setNotice(res.message || 'Student added.');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      const res = await api.deleteStudent(confirmDelete._id);
      setNotice(res.message);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(null);
    }
  };

  const viewHistory = async (student) => {
    try {
      const { student: fresh, history } = await api.getStudent(student._id);
      setHistory({ student: fresh, records: history || [] });
    } catch (err) {
      setError(err.message);
    }
  };

  const counts = useMemo(
    () => ({
      total: students.length,
      active: students.filter((s) => s.isActive !== false).length
    }),
    [students]
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Students</h1>
          <p className="muted">
            {counts.total} record(s) · {counts.active} active
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add student</button>
      </header>

      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>
      <Alert kind="success" onClose={() => setNotice('')}>{notice}</Alert>

      <Card>
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Search by name, student ID or section…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <Spinner label="Loading students…" />
        ) : students.length === 0 ? (
          <EmptyState
            title="No students found"
            description={search ? 'Try a different search term.' : 'Add your first student to get started.'}
            action={<button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add student</button>}
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th>
                  <th>Name</th>
                  <th>Course / Year</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s._id}>
                    <td className="mono">{s.studentId}</td>
                    <td>
                      <p className="cell-strong">{s.firstName} {s.lastName}</p>
                      <p className="muted small">{s.email || '—'}</p>
                    </td>
                    <td>{[s.course, s.yearLevel && `Year ${s.yearLevel}`].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{s.section || '—'}</td>
                    <td>
                      <span className={`pill ${s.isActive === false ? 'pill-muted' : 'pill-present'}`}>
                        {s.isActive === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="right actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => viewHistory(s)}>History</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>Edit</button>
                      <button className="btn btn-danger-ghost btn-sm" onClick={() => setConfirmDelete(s)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.firstName} ${editing.lastName}` : 'Add new student'}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add student'}
            </button>
          </>
        }
      >
        <form onSubmit={save} className="form-grid">
          <Alert>{formError}</Alert>
          <Field label="Student ID *">
            <input className="input" value={form.studentId} placeholder="2024-0011"
              onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
          </Field>
          <div className="form-row">
            <Field label="First name *">
              <input className="input" value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </Field>
            <Field label="Last name *">
              <input className="input" value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Course">
              <input className="input" value={form.course} placeholder="BSIT"
                onChange={(e) => setForm({ ...form, course: e.target.value })} />
            </Field>
            <Field label="Year level">
              <input className="input" value={form.yearLevel} placeholder="3"
                onChange={(e) => setForm({ ...form, yearLevel: e.target.value })} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Section">
              <input className="input" value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })} />
            </Field>
            <Field label="Email" hint="Optional">
              <input className="input" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <span>Active student (can log attendance)</span>
          </label>
          <button type="submit" hidden />
        </form>
      </Modal>

      <Modal
        open={Boolean(confirmDelete)}
        title="Delete student?"
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={remove}>Delete permanently</button>
          </>
        }
      >
        <p>
          This will delete <b>{confirmDelete?.firstName} {confirmDelete?.lastName}</b> (
          {confirmDelete?.studentId}) and all of their attendance records. This cannot be undone.
        </p>
      </Modal>

      <Modal
        open={Boolean(history)}
        title={history ? `${history.student.firstName} ${history.student.lastName} · attendance` : ''}
        onClose={() => setHistory(null)}
      >
        {history && history.records.length === 0 && (
          <EmptyState title="No attendance yet" description="This student has no records." />
        )}
        {history && history.records.length > 0 && (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr><th>Date</th><th>In</th><th>Out</th><th>Status</th></tr>
              </thead>
              <tbody>
                {history.records.map((r) => (
                  <tr key={r.id}>
                    <td>{fmt.date(r.date)}</td>
                    <td>{fmt.time(r.timeIn)}</td>
                    <td>{fmt.time(r.timeOut)}</td>
                    <td>{r.status}{r.status === 'Late' ? ` · ${fmt.lateLabel(r.lateMinutes)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
