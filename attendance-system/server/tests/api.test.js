'use strict';

/**
 * Backend tests — no external database needed.
 * They boot an in-memory MongoDB and exercise the real HTTP API,
 * including the event-driven late-notification chain.
 *
 * Run with:  npm test
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { MongoMemoryServer } = require('mongodb-memory-server-core');
const mongoose = require('mongoose');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { createApp } = require('../src/app');
const { bus, EVENTS } = require('../src/events/bus');
const { registerAllListeners } = require('../src/events');
const { evaluateLateness, dateKeyInTz, isValidDateKey } = require('../src/services/timeService');
const User = require('../src/models/User');
const Student = require('../src/models/Student');
const Attendance = require('../src/models/Attendance');
const Notification = require('../src/models/Notification');
const Settings = require('../src/models/Settings');
const { getSettings } = require('../src/services/settingsService');

let mongod;
let app;
let token;

test.before(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  await mongoose.connect(mongod.getUri(), { dbName: 'attendance-test' });

  registerAllListeners(); // notification + realtime + audit listeners

  await User.create({
    name: 'Test Teacher',
    username: 'teacher',
    passwordHash: await bcrypt.hash('secret123', 10),
    role: 'admin'
  });
  await getSettings();

  app = createApp();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'teacher', password: 'secret123' });
  token = res.body.token;
});

test.after(async () => {
  await mongoose.connection.close();
  await mongod.stop();
});

test.beforeEach(async () => {
  await Attendance.deleteMany({});
  await Notification.deleteMany({});
  await Student.deleteMany({});
  const settings = await Settings.findOne({ key: 'global' });
  settings.classStartTime = '08:00';
  settings.lateGraceMinutes = 0;
  await settings.save();
});

const auth = () => ({ Authorization: `Bearer ${token}` });
const today = () => dateKeyInTz(new Date(), 'Asia/Manila');

async function makeStudent(studentId = '2024-9001', firstName = 'Test', lastName = 'Student') {
  const res = await request(app)
    .post('/api/students')
    .set(auth())
    .send({ studentId, firstName, lastName });
  return res.body.student;
}

/* ------------------------- pure time logic ------------------------- */

test('evaluateLateness marks a time after class start as late', () => {
  const timeIn = new Date('2026-11-15T08:15:00+08:00');
  const r = evaluateLateness({ timeIn, classStartTime: '08:00', timeZone: 'Asia/Manila' });
  assert.equal(r.isLate, true);
  assert.equal(r.lateMinutes, 15);
});

test('evaluateLateness treats exactly class start as on time', () => {
  const timeIn = new Date('2026-11-15T08:00:00+08:00');
  const r = evaluateLateness({ timeIn, classStartTime: '08:00', timeZone: 'Asia/Manila' });
  assert.equal(r.isLate, false);
  assert.equal(r.lateMinutes, 0);
});

test('grace period delays the late threshold', () => {
  const timeIn = new Date('2026-11-15T08:10:00+08:00');
  const r = evaluateLateness({
    timeIn,
    classStartTime: '08:00',
    lateGraceMinutes: 15,
    timeZone: 'Asia/Manila'
  });
  assert.equal(r.isLate, false);
});

test('isValidDateKey rejects impossible dates', () => {
  assert.equal(isValidDateKey('2026-02-31'), false);
  assert.equal(isValidDateKey('2026-02-28'), true);
  assert.equal(isValidDateKey('15-11-2026'), false);
});

/* ------------------------- auth ------------------------- */

test('login rejects a wrong password', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'teacher', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('protected routes require a token', async () => {
  const res = await request(app).get('/api/students');
  assert.equal(res.status, 401);
});

/* ------------------------- students ------------------------- */

test('create, edit, and delete a student', async () => {
  const student = await makeStudent('2024-9100', 'Ana', 'Cruz');
  assert.ok(student._id);

  const dup = await request(app)
    .post('/api/students')
    .set(auth())
    .send({ studentId: '2024-9100', firstName: 'Other', lastName: 'Person' });
  assert.equal(dup.status, 400);

  const updated = await request(app)
    .put(`/api/students/${student._id}`)
    .set(auth())
    .send({ section: 'B' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.student.section, 'B');

  const missing = await request(app)
    .post('/api/students')
    .set(auth())
    .send({ studentId: '2024-9101', firstName: '', lastName: '' });
  assert.equal(missing.status, 400);

  const del = await request(app).delete(`/api/students/${student._id}`).set(auth());
  assert.equal(del.status, 200);
});

/* ------------------------- attendance + events ------------------------- */

test('present time-in creates a Present record and no notification', async () => {
  await makeStudent('2024-9201', 'On', 'Time');
  // Class starts at 23:59 -> any time-in today is on time.
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '23:59' });

  const res = await request(app)
    .post('/api/attendance/time-in')
    .set(auth())
    .send({ studentId: '2024-9201' });
  assert.equal(res.status, 201);
  assert.equal(res.body.record.status, 'Present');

  const notifications = await Notification.countDocuments({});
  assert.equal(notifications, 0);
});

test('late time-in publishes student_late and the listener saves a notification', async () => {
  await makeStudent('2024-9301', 'Late', 'Comer');
  // Class started at 00:00 today -> any time-in is late.
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '00:00' });

  // Subscribe temporarily to prove the event is actually published.
  const seen = [];
  const off = bus.on(EVENTS.STUDENT_LATE, (payload) => seen.push(payload), { label: 'test-spy' });

  const res = await request(app)
    .post('/api/attendance/time-in')
    .set(auth())
    .send({ studentId: '2024-9301' });
  off();

  assert.equal(res.status, 201);
  assert.equal(res.body.record.status, 'Late');
  assert.ok(res.body.record.lateMinutes > 0);

  // 1) the event was published with the expected payload
  assert.equal(seen.length, 1);
  assert.equal(seen[0].studentId, '2024-9301');
  assert.ok(seen[0].lateMinutes > 0);

  // 2) the notification listener persisted an in-app notification
  const notif = await Notification.findOne({ studentId: '2024-9301' });
  assert.ok(notif, 'notification should be created by the listener');
  assert.equal(notif.type, 'student_late');
  assert.match(notif.message, /Late|late/);
  assert.equal(notif.isRead, false);

  // 3) it shows up in the history API
  const list = await request(app).get('/api/notifications').set(auth());
  assert.equal(list.body.total, 1);
  assert.equal(list.body.unreadCount, 1);
});

test('duplicate time-in for the same day is rejected', async () => {
  await makeStudent('2024-9401', 'Dup', 'Licate');
  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-9401' });

  const res = await request(app)
    .post('/api/attendance/time-in')
    .set(auth())
    .send({ studentId: '2024-9401' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /already timed in/i);
  assert.equal(await Attendance.countDocuments({ studentId: '2024-9401' }), 1);
});

test('time-out without time-in is rejected', async () => {
  await makeStudent('2024-9501', 'No', 'Timein');
  const res = await request(app)
    .post('/api/attendance/time-out')
    .set(auth())
    .send({ studentId: '2024-9501' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /no time-in/i);
});

test('unknown student and invalid date are rejected', async () => {
  const unknown = await request(app)
    .post('/api/attendance/time-in')
    .set(auth())
    .send({ studentId: '9999-9999' });
  assert.equal(unknown.status, 400);

  await makeStudent('2024-9601', 'Bad', 'Date');
  const badDate = await request(app)
    .post('/api/attendance/time-in')
    .set(auth())
    .send({ studentId: '2024-9601', date: '2026-02-31' });
  assert.equal(badDate.status, 400);

  const future = await request(app)
    .post('/api/attendance/time-in')
    .set(auth())
    .send({ studentId: '2024-9601', date: '2099-01-01' });
  assert.equal(future.status, 400);
});

test('time-out after time-in succeeds', async () => {
  await makeStudent('2024-9701', 'Time', 'Out');
  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-9701' });
  const res = await request(app)
    .post('/api/attendance/time-out')
    .set(auth())
    .send({ studentId: '2024-9701' });
  assert.equal(res.status, 200);
  assert.ok(res.body.record.timeOut);
});

/* ------------------------- one-action marking + roster ------------------------- */

test('one action marks time-in first, then time-out, then reports complete', async () => {
  await makeStudent('2024-7001', 'One', 'Click');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '23:59' });

  // 1st call -> time-in
  const first = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-7001' });
  assert.equal(first.status, 201);
  assert.equal(first.body.action, 'time-in');
  assert.equal(first.body.record.status, 'Present');
  assert.ok(first.body.record.timeIn);
  assert.equal(first.body.record.timeOut, null);

  // 2nd call -> time-out, same record
  const second = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-7001' });
  assert.equal(second.status, 201);
  assert.equal(second.body.action, 'time-out');
  assert.ok(second.body.record.timeOut);
  assert.equal(second.body.record.id, first.body.record.id);

  // 3rd call -> nothing left to do
  const third = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-7001' });
  assert.equal(third.status, 400);
  assert.match(third.body.message, /complete/i);

  // still exactly one attendance row for the day
  assert.equal(await Attendance.countDocuments({ studentId: '2024-7001' }), 1);
});

test('one action still publishes student_late on a late time-in only', async () => {
  await makeStudent('2024-7002', 'One', 'Late');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '00:00' });

  const seen = [];
  const off = bus.on(EVENTS.STUDENT_LATE, (p) => seen.push(p), { label: 'test-spy-mark' });

  const late = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-7002' });
  const off2 = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-7002' });
  off();

  assert.equal(late.body.action, 'time-in');
  assert.equal(late.body.record.status, 'Late');
  assert.equal(off2.body.action, 'time-out');

  // exactly one event, fired on the time-in only
  assert.equal(seen.length, 1);
  assert.equal(await Notification.countDocuments({ studentId: '2024-7002' }), 1);
});

test('roster lists every active student with their state for the day', async () => {
  await makeStudent('2024-7101', 'Roster', 'Waiting');
  await makeStudent('2024-7102', 'Roster', 'In');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '23:59' });
  await request(app).post('/api/attendance/mark').set(auth()).send({ studentId: '2024-7102' });

  const res = await request(app).get('/api/attendance/roster').set(auth());
  assert.equal(res.status, 200);
  assert.equal(res.body.counts.total, 2);
  assert.equal(res.body.counts.waiting, 1);
  assert.equal(res.body.counts.timedIn, 1);

  const waiting = res.body.students.find((s) => s.studentId === '2024-7101');
  const timedIn = res.body.students.find((s) => s.studentId === '2024-7102');
  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.status, 'Not yet');
  assert.equal(timedIn.state, 'timed-in');
  assert.equal(timedIn.status, 'Present');

  // completing a student moves them to the "complete" bucket
  await request(app).post('/api/attendance/mark').set(auth()).send({ studentId: '2024-7102' });
  const after = await request(app).get('/api/attendance/roster').set(auth());
  assert.equal(after.body.counts.complete, 1);
});

test('roster hides inactive students', async () => {
  const created = await makeStudent('2024-7201', 'In', 'Active');
  await request(app)
    .put(`/api/students/${created._id}`)
    .set(auth())
    .send({ isActive: false });

  const res = await request(app).get('/api/attendance/roster').set(auth());
  assert.equal(res.body.students.some((s) => s.studentId === '2024-7201'), false);
});

test('one action validates the student and the date', async () => {
  const unknown = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '0000-0000' });
  assert.equal(unknown.status, 400);

  await makeStudent('2024-7301', 'Bad', 'Date');
  const badDate = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-7301', date: '2026-13-40' });
  assert.equal(badDate.status, 400);
});

/* ------------------------------- excused ------------------------------- */

test('excuse creates a record without a time-in and does not raise a late event', async () => {
  await makeStudent('2024-8001', 'Ex', 'Cused');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '00:00' });

  const seen = [];
  const off = bus.on(EVENTS.STUDENT_LATE, (p) => seen.push(p), { label: 'test-spy-excuse' });

  const res = await request(app)
    .post('/api/attendance/excuse')
    .set(auth())
    .send({ studentId: '2024-8001', reason: 'Medical / sick' });
  off();

  assert.equal(res.status, 201);
  assert.equal(res.body.record.status, 'Excused');
  assert.equal(res.body.record.excuseReason, 'Medical / sick');
  assert.equal(res.body.record.timeIn, null);
  assert.equal(seen.length, 0, 'an excused student is never "late"');
  assert.equal(await Notification.countDocuments({ studentId: '2024-8001' }), 0);
});

test('excuse requires a reason', async () => {
  await makeStudent('2024-8002', 'No', 'Reason');
  const res = await request(app)
    .post('/api/attendance/excuse')
    .set(auth())
    .send({ studentId: '2024-8002', reason: '   ' });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /reason/i);
});

test('an excused student is blocked from time-in until the excuse is removed', async () => {
  await makeStudent('2024-8003', 'Blocked', 'Arrival');
  await request(app)
    .post('/api/attendance/excuse')
    .set(auth())
    .send({ studentId: '2024-8003', reason: 'Official business' });

  const mark = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-8003' });
  assert.equal(mark.status, 400);
  assert.match(mark.body.message, /excused/i);

  const removed = await request(app)
    .delete('/api/attendance/excuse')
    .query({ studentId: '2024-8003' })
    .set(auth());
  assert.equal(removed.status, 200);
  // excuse-only record is deleted entirely -> back to "waiting"
  assert.equal(removed.body.record, null);

  const roster = await request(app).get('/api/attendance/roster').set(auth());
  const row = roster.body.students.find((s) => s.studentId === '2024-8003');
  assert.equal(row.state, 'waiting');

  // and they can now time in normally
  const after = await request(app)
    .post('/api/attendance/mark')
    .set(auth())
    .send({ studentId: '2024-8003' });
  assert.equal(after.status, 201);
  assert.equal(after.body.action, 'time-in');
});

test('removing an excuse on a late arrival restores the Late status', async () => {
  await makeStudent('2024-8004', 'Was', 'Late');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '00:00' });

  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-8004' });
  await request(app)
    .post('/api/attendance/excuse')
    .set(auth())
    .send({ studentId: '2024-8004', reason: 'Transport problem' });

  let roster = await request(app).get('/api/attendance/roster').set(auth());
  let row = roster.body.students.find((s) => s.studentId === '2024-8004');
  assert.equal(row.state, 'excused');

  const removed = await request(app)
    .delete('/api/attendance/excuse')
    .query({ studentId: '2024-8004' })
    .set(auth());
  assert.equal(removed.status, 200);
  assert.equal(removed.body.record.status, 'Late');

  roster = await request(app).get('/api/attendance/roster').set(auth());
  row = roster.body.students.find((s) => s.studentId === '2024-8004');
  assert.equal(row.state, 'timed-in');
  assert.equal(row.status, 'Late');
});

test('roster counts excused students, and they are not counted absent', async () => {
  await makeStudent('2024-8101', 'Roster', 'Excused');
  const res = await request(app)
    .post('/api/attendance/excuse')
    .set(auth())
    .send({ studentId: '2024-8101', reason: 'Family emergency' });
  assert.equal(res.status, 201);

  const roster = await request(app).get('/api/attendance/roster').set(auth());
  assert.equal(roster.body.counts.excused, 1);
  assert.equal(roster.body.counts.waiting, 0);

  const dash = await request(app).get('/api/attendance/dashboard').set(auth());
  assert.equal(dash.body.excused, 1);
  assert.equal(dash.body.absent, 0);
});

test('records can be filtered to Excused only', async () => {
  await makeStudent('2024-8201', 'Filter', 'Excused');
  await request(app)
    .post('/api/attendance/excuse')
    .set(auth())
    .send({ studentId: '2024-8201', reason: 'School activity' });

  const res = await request(app).get('/api/attendance?status=Excused').set(auth());
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 1);
  assert.equal(res.body.records[0].excuseReason, 'School activity');
});

/* ------------------------- search, dashboard, notifications ------------------------- */

test('records can be searched by name, id, date and filtered by status', async () => {
  await makeStudent('2024-9801', 'Search', 'Me');
  await makeStudent('2024-9802', 'Other', 'Person');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '00:00' });
  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-9801' });
  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-9802' });

  const byName = await request(app).get('/api/attendance?search=Search').set(auth());
  assert.equal(byName.body.count, 1);

  const byId = await request(app).get('/api/attendance?search=2024-9802').set(auth());
  assert.equal(byId.body.count, 1);

  const byDate = await request(app).get(`/api/attendance?date=${today()}`).set(auth());
  assert.equal(byDate.body.count, 2);

  const lateOnly = await request(app).get('/api/attendance?status=Late').set(auth());
  assert.equal(lateOnly.body.count, 2);
  const presentOnly = await request(app).get('/api/attendance?status=Present').set(auth());
  assert.equal(presentOnly.body.count, 0);
});

test('dashboard reports totals', async () => {
  await makeStudent('2024-9901', 'Dash', 'One');
  await makeStudent('2024-9902', 'Dash', 'Two');
  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-9901' });

  const res = await request(app).get('/api/attendance/dashboard').set(auth());
  assert.equal(res.status, 200);
  assert.equal(res.body.totalStudents, 2);
  assert.equal(res.body.present + res.body.late, 1);
  assert.equal(res.body.absent, 1);
  assert.equal(typeof res.body.totalNotifications, 'number');
});

test('notifications can be marked read and deleted', async () => {
  await makeStudent('2024-9951', 'Read', 'Me');
  await Settings.findOneAndUpdate({ key: 'global' }, { classStartTime: '00:00' });
  await request(app).post('/api/attendance/time-in').set(auth()).send({ studentId: '2024-9951' });

  const list = await request(app).get('/api/notifications').set(auth());
  const id = list.body.notifications[0].id;

  const markOne = await request(app).patch(`/api/notifications/${id}/read`).set(auth());
  assert.equal(markOne.status, 200);
  assert.equal(markOne.body.notification.isRead, true);

  const readAll = await request(app).patch('/api/notifications/read-all').set(auth());
  assert.equal(readAll.status, 200);

  const del = await request(app).delete(`/api/notifications/${id}`).set(auth());
  assert.equal(del.status, 200);
  assert.equal(await Notification.countDocuments({}), 0);
});

test('class start time validation', async () => {
  const bad = await request(app).put('/api/settings').set(auth()).send({ classStartTime: '25:00' });
  assert.equal(bad.status, 400);
  const ok = await request(app).put('/api/settings').set(auth()).send({ classStartTime: '07:30' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.settings.classStartTime, '07:30');
});

test('event status endpoint lists registered listeners', async () => {
  const res = await request(app).get('/api/settings/event-status').set(auth());
  assert.equal(res.status, 200);
  assert.ok(res.body.subscriptions[EVENTS.STUDENT_LATE].some((l) => l.includes('notificationListener')));
});
