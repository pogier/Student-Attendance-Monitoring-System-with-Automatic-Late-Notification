import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fmt } from '../api';
import { useAppData } from '../context/AppDataContext';
import { useSocketEvent } from '../context/AuthContext';
import { Alert, Card, EmptyState, Modal, Spinner, StatusPill } from '../components/ui';

const FILTERS = [
  ['waiting', 'Waiting'],
  ['timed-in', 'Not yet out'],
  ['excused', 'Excused'],
  ['all', 'Everyone'],
  ['complete', 'Complete']
];

const REASONS = [
  'Medical / sick',
  'Family emergency',
  'School activity',
  'Official business',
  'Transport problem',
  'Other'
];

export default function AttendancePage() {
  const { settings, socket, pushToast, connected } = useAppData();

  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(fmt.todayKey());
  const [filter, setFilter] = useState('waiting');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState(null);

  const [excuseTarget, setExcuseTarget] = useState(null); // { studentId, studentName, currentReason }
  const [excuseReason, setExcuseReason] = useState(REASONS[0]);
  const [excuseNote, setExcuseNote] = useState('');
  const [excuseError, setExcuseError] = useState('');
  const [excuseBusy, setExcuseBusy] = useState(false);

  const [records, setRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [recordFilters, setRecordFilters] = useState({ search: '', date: '', status: 'All' });

  const searchRef = useRef(null);
  const rowRefs = useRef({});

  /* ------------------------------ data ------------------------------ */

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      setRoster(await api.getRoster({ date }));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const { records: list } = await api.getAttendance(recordFilters);
      setRecords(list);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingRecords(false);
    }
  }, [recordFilters]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    const t = setTimeout(loadRecords, 250);
    return () => clearTimeout(t);
  }, [loadRecords]);

  useSocketEvent(socket, 'attendance:time_in', loadRoster);
  useSocketEvent(socket, 'attendance:time_out', loadRoster);

  /* --------------------------- the one click --------------------------- */

  const onMark = useCallback(
    async (student) => {
      if (busyId) return;
      setBusyId(student.studentId);
      setError('');
      try {
        const res = await api.markAttendance({ studentId: student.studentId, date });
        const kind = res.action === 'time-in' && res.record.status === 'Late' ? 'late' : 'success';
        setFlash({
          kind,
          studentName: res.studentName,
          action: res.action,
          message: res.message,
          status: res.record.status,
          lateMinutes: res.record.lateMinutes
        });
        // Late arrivals already get a toast pushed by the server listener.
        if (kind !== 'late') {
          pushToast({
            kind: 'success',
            title: res.action === 'time-in' ? 'Time in recorded' : 'Time out recorded',
            message: res.message
          });
        }
        setSearch('');
        searchRef.current?.focus();
        await loadRoster();
        await loadRecords();
      } catch (err) {
        setError(err.message);
        setFlash({ kind: 'error', studentName: student.studentName, message: err.message });
        searchRef.current?.focus();
      } finally {
        setBusyId('');
      }
    },
    [busyId, date, loadRoster, loadRecords, pushToast]
  );

  /* ------------------------------ excuse ------------------------------ */

  const openExcuse = (student) => {
    setExcuseTarget(student);
    setExcuseError('');
    const current = student.excuseReason || '';
    if (current && !REASONS.includes(current)) {
      setExcuseReason('Other');
      setExcuseNote(current);
    } else {
      setExcuseReason(current || REASONS[0]);
      setExcuseNote('');
    }
  };

  const saveExcuse = async () => {
    const reason = excuseReason === 'Other' ? excuseNote.trim() : excuseReason;
    if (!reason) {
      setExcuseError('Please type a reason.');
      return;
    }
    setExcuseBusy(true);
    setExcuseError('');
    try {
      const res = await api.excuse({
        studentId: excuseTarget.studentId,
        date,
        reason
      });
      setFlash({
        kind: 'info',
        studentName: res.studentName,
        action: 'excused',
        message: res.message
      });
      pushToast({ kind: 'info', title: 'Marked excused', message: res.message });
      setExcuseTarget(null);
      await loadRoster();
      await loadRecords();
    } catch (err) {
      setExcuseError(err.message);
    } finally {
      setExcuseBusy(false);
    }
  };

  const clearExcuse = async (student) => {
    setBusyId(student.studentId);
    setError('');
    try {
      const res = await api.removeExcuse({ studentId: student.studentId, date });
      setFlash({ kind: 'info', studentName: res.studentName, action: 'removed', message: res.message });
      setExcuseTarget(null);
      await loadRoster();
      await loadRecords();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  };

  /* --------------------------- grid filtering --------------------------- */

  const rows = useMemo(() => {
    if (!roster) return [];
    const term = search.trim().toLowerCase();
    return roster.students.filter((s) => {
      const matchesFilter =
        filter === 'all' ? true : filter === 'waiting' ? s.state === 'waiting' : s.state === filter;
      const matchesSearch =
        !term ||
        s.studentName.toLowerCase().includes(term) ||
        s.studentId.toLowerCase().includes(term) ||
        (s.section || '').toLowerCase().includes(term);
      return matchesFilter && matchesSearch;
    });
  }, [roster, filter, search]);

  useEffect(() => {
    setSelected((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length, filter]);

  useEffect(() => {
    const el = rowRefs.current[rows[selected]?.studentId];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected, rows]);

  /* ------------------------------ keyboard ------------------------------ */

  useEffect(() => {
    const onKey = (e) => {
      if (excuseTarget) return; // the modal owns the keyboard
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'select' || tag === 'textarea';

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, rows.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && typing && searchRef.current === e.target) {
        e.preventDefault();
        const typed = searchRef.current.value.trim().toUpperCase();
        if (typed) {
          onMark({ studentId: typed, studentName: typed });
        } else if (rows[selected]) {
          onMark(rows[selected]);
        }
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, selected, onMark, excuseTarget]);

  /* ------------------------------- misc ------------------------------- */

  const allDone = roster && roster.counts.waiting === 0 && roster.counts.total > 0;

  const exportCsv = () => {
    const source = records.length ? records : roster?.students || [];
    const header = ['Student ID', 'Student', 'Date', 'Time In', 'Time Out', 'Status', 'Late Minutes', 'Excuse Reason'];
    const rowsCsv = source.map((r) => [
      r.studentId,
      r.studentName,
      r.date || roster?.date || '',
      r.timeIn ? new Date(r.timeIn).toISOString() : '',
      r.timeOut ? new Date(r.timeOut).toISOString() : '',
      r.status,
      r.lateMinutes ?? 0,
      r.excuseReason || ''
    ]);
    const csv = [header, ...rowsCsv].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${roster?.date || fmt.todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Attendance</h1>
          <p className="muted">
            Class starts <b>{settings?.classStartTime || '08:00'}</b>
            {settings?.lateGraceMinutes ? ` (+${settings.lateGraceMinutes} min grace)` : ''} · one click
            marks a student <b>in</b> (or <b>out</b> if they are already in)
          </p>
        </div>
        <button className="btn btn-ghost" onClick={exportCsv} disabled={!roster?.students.length}>
          Export CSV
        </button>
      </header>

      <Alert kind="error" onClose={() => setError('')}>{error}</Alert>

      <Card>
        <div className="take-bar">
          <div className="take-head">
            <div>
              <h2 className="card-title">Quick attendance</h2>
              <p className="card-sub">
                {allDone
                  ? 'Everyone has been marked for this date. Nice.'
                  : `${roster?.counts.waiting ?? 0} student(s) still waiting · ${roster?.counts.excused ?? 0} excused · ${roster?.counts.complete ?? 0} complete`}
              </p>
            </div>
            <div className="take-controls">
              <input
                ref={searchRef}
                className="input search"
                placeholder="Search name / ID / section  (press /)"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected(0);
                }}
                onKeyDown={(e) => e.key === 'Escape' && setSearch('')}
              />
              <input
                className="input"
                type="date"
                value={date}
                max={fmt.todayKey()}
                onChange={(e) => setDate(e.target.value)}
              />
              <span className={`conn ${connected ? 'on' : 'off'}`}>
                <span className="conn-dot" />
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>

          <div className="take-tabs">
            {FILTERS.map(([key, label]) => {
              const count =
                key === 'all'
                  ? roster?.counts.total
                  : key === 'waiting'
                    ? roster?.counts.waiting
                    : key === 'timed-in'
                      ? roster?.counts.timedIn
                      : key === 'excused'
                        ? roster?.counts.excused
                        : roster?.counts.complete;
              return (
                <button
                  key={key}
                  className={`take-tab ${filter === key ? 'active' : ''}`}
                  onClick={() => {
                    setFilter(key);
                    setSelected(0);
                  }}
                >
                  {label}
                  <span className="take-count">{count ?? 0}</span>
                </button>
              );
            })}
            <div className="take-tabs-spacer" />
            <p className="muted small kb-hint">
              <kbd>↑</kbd><kbd>↓</kbd> move · <kbd>/</kbd> search · <kbd>Enter</kbd> mark
            </p>
          </div>

          {flash && (
            <div className={`flash flash-${flash.kind}`}>
              <span className="flash-icon">
                {flash.kind === 'error' ? '!' : flash.action === 'excused' ? '◍' : '✓'}
              </span>
              <div>
                <p className="flash-title">
                  {flash.studentName}
                  {flash.action === 'time-in' && (
                    <> · timed in <StatusPill status={flash.status} /></>
                  )}
                  {flash.action === 'time-out' && ' · timed out'}
                  {flash.action === 'excused' && ' · marked excused'}
                  {flash.action === 'removed' && ' · excuse removed'}
                </p>
                <p className="flash-msg">{flash.message}</p>
                {flash.kind === 'late' && (
                  <p className="flash-msg">
                    <code>student_late</code> event published → notification listener saved an alert.
                  </p>
                )}
              </div>
            </div>
          )}

          {loading && !roster ? (
            <Spinner label="Loading class list…" />
          ) : rows.length === 0 ? (
            <EmptyState
              title={allDone ? 'All students are marked' : 'No students match'}
              description={
                allDone
                  ? 'Switch to “Everyone” to review or correct a record.'
                  : 'Try another filter, clear the search, or add students on the Students page.'
              }
              action={
                <button className="btn btn-ghost btn-sm" onClick={() => { setFilter('all'); setSearch(''); }}>
                  Show everyone
                </button>
              }
            />
          ) : (
            <div className="roster">
              {rows.map((s, index) => {
                const isBusy = busyId === s.studentId;
                const label =
                  s.state === 'waiting'
                    ? isBusy
                      ? 'Saving…'
                      : 'Time In'
                    : s.state === 'timed-in'
                      ? isBusy
                        ? 'Saving…'
                        : 'Time Out'
                      : s.state === 'excused'
                        ? 'Excused'
                        : 'Complete';
                return (
                  <div
                    key={s.studentId}
                    ref={(el) => { rowRefs.current[s.studentId] = el; }}
                    className={`roster-row state-${s.state} ${index === selected ? 'selected' : ''}`}
                    onMouseEnter={() => setSelected(index)}
                  >
                    <div className="roster-id mono">{s.studentId}</div>
                    <div className="roster-name">
                      <p className="cell-strong">{s.studentName}</p>
                      <p className="muted small">
                        {[s.course, s.yearLevel && `Year ${s.yearLevel}`, s.section && `Sec ${s.section}`]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </p>
                    </div>
                    <div className="roster-times">
                      {s.state === 'waiting' ? (
                        <span className="muted small">not yet timed in</span>
                      ) : s.state === 'excused' ? (
                        <>
                          <StatusPill status="Excused" />
                          <span className="muted small">{s.excuseReason || 'no reason given'}</span>
                          {s.timeIn && <span className="time-chip">in {fmt.time(s.timeIn)}</span>}
                        </>
                      ) : (
                        <>
                          <span className="time-chip">in {fmt.time(s.timeIn)}</span>
                          {s.timeOut ? (
                            <span className="time-chip">out {fmt.time(s.timeOut)}</span>
                          ) : (
                            <span className="time-chip ghost">no time-out</span>
                          )}
                          <StatusPill status={s.status} />
                          {s.status === 'Late' && (
                            <span className="muted small">{fmt.lateLabel(s.lateMinutes)} late</span>
                          )}
                        </>
                      )}
                    </div>
                    <div className="roster-actions">
                      <button
                        className={`btn btn-sm ${
                          s.state === 'complete' || s.state === 'excused'
                            ? 'btn-ghost'
                            : s.state === 'timed-in'
                              ? 'btn-secondary'
                              : 'btn-primary'
                        } roster-btn`}
                        disabled={isBusy || s.state === 'complete' || s.state === 'excused'}
                        onClick={() => onMark(s)}
                      >
                        {label}
                      </button>
                      <button
                        className={`btn btn-sm roster-excuse ${
                          s.state === 'excused' ? 'btn-excused' : 'btn-ghost'
                        }`}
                        disabled={isBusy}
                        onClick={() => openExcuse(s)}
                        title={s.state === 'excused' ? 'Edit or remove the excuse' : 'Mark this student excused'}
                      >
                        {s.state === 'excused' ? 'Excused ✓' : 'Excuse'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="muted small table-foot">
            Tip: press <kbd>/</kbd>, type a student ID and hit <kbd>Enter</kbd> — the student doesn&apos;t
            even need to be visible in the list. One action records time-in; repeating it records time-out.
            Use <b>Excuse</b> for students who will not be coming in.
          </p>
        </div>
      </Card>

      <Card title="Attendance records" subtitle="Search and filter the saved history">
        <div className="toolbar wrap">
          <input
            className="input search"
            placeholder="Search name, student ID or date (YYYY-MM-DD)…"
            value={recordFilters.search}
            onChange={(e) => setRecordFilters({ ...recordFilters, search: e.target.value })}
          />
          <input
            className="input"
            type="date"
            value={recordFilters.date}
            onChange={(e) => setRecordFilters({ ...recordFilters, date: e.target.value })}
          />
          <select
            className="input"
            value={recordFilters.status}
            onChange={(e) => setRecordFilters({ ...recordFilters, status: e.target.value })}
          >
            <option>All</option>
            <option>Present</option>
            <option>Late</option>
            <option>Excused</option>
          </select>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRecordFilters({ search: '', date: '', status: 'All' })}
          >
            Reset
          </button>
        </div>

        {loadingRecords ? (
          <Spinner label="Loading records…" />
        ) : records.length === 0 ? (
          <EmptyState title="No attendance records match" description="Adjust the search or filters." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Student ID</th><th>Student</th><th>Date</th><th>Time in</th>
                  <th>Time out</th><th>Status</th><th>Late</th><th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.studentId}</td>
                    <td className="cell-strong">{r.studentName}</td>
                    <td>{fmt.date(r.date)}</td>
                    <td>{fmt.time(r.timeIn)}</td>
                    <td>{fmt.time(r.timeOut)}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td className="muted small">
                      {r.status === 'Late' ? fmt.lateLabel(r.lateMinutes) : '—'}
                    </td>
                    <td className="muted small">{r.status === 'Excused' ? r.excuseReason || '—' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small table-foot">{records.length} record(s) shown</p>
      </Card>

      <Modal
        open={Boolean(excuseTarget)}
        title={excuseTarget ? `Excuse · ${excuseTarget.studentName}` : ''}
        onClose={() => setExcuseTarget(null)}
        footer={
          <>
            {excuseTarget?.currentReason || excuseTarget?.state === 'excused' ? (
              <button
                className="btn btn-danger-ghost"
                onClick={() => clearExcuse(excuseTarget)}
                disabled={excuseBusy}
              >
                Remove excuse
              </button>
            ) : null}
            <button className="btn btn-ghost" onClick={() => setExcuseTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={saveExcuse} disabled={excuseBusy}>
              {excuseBusy ? 'Saving…' : 'Mark excused'}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <Alert>{excuseError}</Alert>
          <p className="muted small">
            Excused students are not counted as absent. No <code>student_late</code> event is raised and
            no late notification is created.
          </p>
          <div className="reason-grid">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={`reason-chip ${excuseReason === r ? 'active' : ''}`}
                onClick={() => setExcuseReason(r)}
              >
                {r}
              </button>
            ))}
          </div>
          {excuseReason === 'Other' && (
            <input
              className="input"
              autoFocus
              placeholder="Type the reason…"
              value={excuseNote}
              onChange={(e) => setExcuseNote(e.target.value)}
              maxLength={160}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}
