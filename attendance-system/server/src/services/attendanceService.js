'use strict';

const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const { bus, EVENTS } = require('../events/bus');
const { getSettings } = require('./settingsService');
const {
  dateKeyInTz,
  isValidDateKey,
  evaluateLateness,
  formatClockInTz
} = require('./timeService');

/**
 * Allows shifting "now" for demonstration/testing only:
 *   APP_TIME_OFFSET_MINUTES=120  -> server pretends it is 2 hours later
 * so you can show the late-notification flow at any time of day.
 * It is 0 (disabled) unless you opt in.
 */
function offsetNow() {
  const offset = Number(process.env.APP_TIME_OFFSET_MINUTES || 0);
  return new Date(Date.now() + offset * 60 * 1000);
}

/** A validation error we can safely show to the user (HTTP 400). */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

async function findStudentOrFail(studentId) {
  if (!studentId || typeof studentId !== 'string' || !studentId.trim()) {
    throw new ValidationError('Student is required. Please select or type a student ID.');
  }
  const student = await Student.findOne({ studentId: studentId.trim().toUpperCase() });
  if (!student) {
    throw new ValidationError(`No student found with ID "${studentId.trim()}".`);
  }
  if (!student.isActive) {
    throw new ValidationError(`${student.fullName} is inactive and cannot log attendance.`);
  }
  return student;
}

function resolveDate(providedDate, timeZone) {
  if (providedDate === undefined || providedDate === null || providedDate === '') {
    return dateKeyInTz(new Date(), timeZone);
  }
  if (!isValidDateKey(providedDate)) {
    throw new ValidationError(
      `Invalid date "${providedDate}". Use the format YYYY-MM-DD and a real calendar date.`
    );
  }
  const today = dateKeyInTz(new Date(), timeZone);
  if (providedDate > today) {
    throw new ValidationError('Attendance cannot be recorded for a future date.');
  }
  return providedDate;
}

/**
 * VALIDATE THE STUDENT + DAY (shared by every attendance action).
 */
async function prepare(studentId, date) {
  const settings = await getSettings();
  const tz = settings.timezone || 'Asia/Manila';
  const student = await findStudentOrFail(studentId);
  const recordDate = resolveDate(date, tz);
  return { settings, tz, student, recordDate };
}

/**
 * MARK ATTENDANCE (the teacher-facing default action)
 *
 * One action replaces "choose Time In or Time Out":
 *   - no record for the day        -> creates a time-in (Present or Late)
 *   - record exists, no time-out   -> fills the time-out
 *   - record is complete           -> ValidationError (already complete)
 *
 * The time-in path publishes `student_late` exactly like before.
 */
async function markAttendance({ studentId, date, notes }) {
  const { settings, tz, student, recordDate } = await prepare(studentId, date);
  const existing = await Attendance.findOne({ student: student._id, date: recordDate });

  if (!existing) {
    const record = await createTimeIn({ student, settings, tz, recordDate, notes });
    return { action: 'time-in', record, studentName: student.fullName, studentId: student.studentId };
  }
  if (existing.status === 'Excused') {
    throw new ValidationError(
      `${student.fullName} is marked Excused (${existing.excuseReason || 'no reason given'}). Remove the excuse first if they actually arrived.`
    );
  }
  if (!existing.timeOut) {
    const record = await closeTimeOut({ student, attendance: existing, tz, recordDate });
    return { action: 'time-out', record, studentName: student.fullName, studentId: student.studentId };
  }

  const isToday = recordDate === dateKeyInTz(offsetNow(), tz);
  throw new ValidationError(
    isToday
      ? `${student.fullName} already timed in at ${formatClockInTz(existing.timeIn, tz)} and out at ${formatClockInTz(existing.timeOut, tz)}. Their attendance for today is complete.`
      : `${student.fullName} already has a complete record for ${recordDate}.`
  );
}

/** Creates the time-in record, publishes events, detects lateness. */
async function createTimeIn({ student, settings, tz, recordDate, notes }) {
  const now = offsetNow();

  const lateness = evaluateLateness({
    timeIn: now,
    classStartTime: settings.classStartTime,
    lateGraceMinutes: settings.lateGraceMinutes,
    timeZone: tz
  });

  const attendance = await Attendance.create({
    student: student._id,
    studentId: student.studentId,
    studentName: student.fullName,
    date: recordDate,
    timeIn: now,
    status: lateness.isLate ? 'Late' : 'Present',
    lateMinutes: lateness.lateMinutes,
    classStartTime: settings.classStartTime,
    remarks: typeof notes === 'string' ? notes.slice(0, 200) : ''
  });

  await bus.publish(EVENTS.ATTENDANCE_TIME_IN, {
    attendanceId: attendance._id.toString(),
    studentId: student.studentId,
    studentName: student.fullName,
    date: recordDate,
    timeIn: now.toISOString(),
    status: attendance.status,
    lateMinutes: attendance.lateMinutes
  });

  if (lateness.isLate) {
    await bus.publish(EVENTS.STUDENT_LATE, {
      attendanceId: attendance._id.toString(),
      studentObjectId: student._id.toString(),
      studentId: student.studentId,
      studentName: student.fullName,
      date: recordDate,
      timeIn: now.toISOString(),
      timeInLabel: formatClockInTz(now, tz),
      classStartTime: settings.classStartTime,
      lateMinutes: lateness.lateMinutes,
      threshold: lateness.threshold
    });
  }

  return attendance.toClient();
}

/** Fills the time-out on an existing record and publishes the event. */
async function closeTimeOut({ student, attendance, tz, recordDate }) {
  attendance.timeOut = offsetNow();
  await attendance.save();

  await bus.publish(EVENTS.ATTENDANCE_TIME_OUT, {
    attendanceId: attendance._id.toString(),
    studentId: student.studentId,
    studentName: student.fullName,
    date: recordDate,
    timeOut: attendance.timeOut.toISOString(),
    status: attendance.status
  });

  return attendance.toClient();
}

/**
 * ROSTER FOR A DAY — powers the one-click grid.
 * Returns every active student with today's state so the teacher sees
 * who is still waiting instead of searching for each name.
 */
async function getRoster({ date } = {}) {
  const settings = await getSettings();
  const tz = settings.timezone || 'Asia/Manila';
  const recordDate = resolveDate(date, tz);

  const [students, records] = await Promise.all([
    Student.find({ isActive: true }).sort({ lastName: 1, firstName: 1 }).lean(),
    Attendance.find({ date: recordDate }).lean()
  ]);

  const byStudent = new Map(records.map((r) => [r.student.toString(), r]));

  const rows = students.map((s) => {
    const rec = byStudent.get(s._id.toString());
    return {
      studentId: s.studentId,
      studentName: `${s.firstName} ${s.lastName}`.trim(),
      course: s.course || '',
      yearLevel: s.yearLevel || '',
      section: s.section || '',
      status: rec ? rec.status : 'Not yet',
      state: rec
        ? rec.status === 'Excused'
          ? 'excused'
          : rec.timeOut
            ? 'complete'
            : 'timed-in'
        : 'waiting',
      excuseReason: rec ? rec.excuseReason || '' : '',
      timeIn: rec ? rec.timeIn : null,
      timeOut: rec ? rec.timeOut : null,
      lateMinutes: rec ? rec.lateMinutes : 0,
      attendanceId: rec ? rec._id.toString() : null
    };
  });

  return {
    date: recordDate,
    classStartTime: settings.classStartTime,
    lateGraceMinutes: settings.lateGraceMinutes,
    counts: {
      total: rows.length,
      present: rows.filter((r) => r.status === 'Present').length,
      late: rows.filter((r) => r.status === 'Late').length,
      waiting: rows.filter((r) => r.state === 'waiting').length,
      timedIn: rows.filter((r) => r.state === 'timed-in').length,
      complete: rows.filter((r) => r.state === 'complete').length,
      excused: rows.filter((r) => r.state === 'excused').length
    },
    students: rows
  };
}

/**
 * TIME IN
 * 1. validate  -> 2. save attendance  -> 3. detect lateness
 * -> 4. publish events (student_late when late). No notification logic lives here.
 */
async function timeIn({ studentId, date, notes }) {
  const { settings, tz, student, recordDate } = await prepare(studentId, date);

  const existing = await Attendance.findOne({ student: student._id, date: recordDate });
  if (existing && existing.timeIn) {
    throw new ValidationError(
      `${student.fullName} already timed in today at ${formatClockInTz(existing.timeIn, tz)} (${
        existing.status
      }). Duplicate time-in is not allowed.`
    );
  }

  return createTimeIn({ student, settings, tz, recordDate, notes });
}

/**
 * TIME OUT
 * A student may only time out if there is a time-in for that day.
 */
async function timeOut({ studentId, date }) {
  const { tz, student, recordDate } = await prepare(studentId, date);

  const attendance = await Attendance.findOne({ student: student._id, date: recordDate });
  if (!attendance || !attendance.timeIn) {
    throw new ValidationError(
      `${student.fullName} has no time-in record for ${recordDate}. Time-out without time-in is not allowed.`
    );
  }
  if (attendance.timeOut) {
    throw new ValidationError(
      `${student.fullName} already timed out at ${formatClockInTz(attendance.timeOut, tz)}.`
    );
  }

  return closeTimeOut({ student, attendance, tz, recordDate });
}

/**
 * MARK EXCUSED
 * Creates today's record without a time-in, so the student is not counted
 * absent. No `student_late` event fires — an excused student was never late.
 * An existing record (e.g. a late time-in) can be converted to Excused;
 * the time-in/out stamps are kept for the audit trail.
 */
async function markExcused({ studentId, date, reason }) {
  const { student, recordDate } = await prepare(studentId, date);
  const cleanReason = String(reason || '').trim();

  if (!cleanReason) {
    throw new ValidationError('Please choose or type a reason for the excuse.');
  }

  let attendance = await Attendance.findOne({ student: student._id, date: recordDate });
  let created = false;

  if (!attendance) {
    attendance = new Attendance({
      student: student._id,
      studentId: student.studentId,
      studentName: student.fullName,
      date: recordDate,
      timeIn: null,
      timeOut: null,
      status: 'Excused',
      lateMinutes: 0,
      classStartTime: '—'
    });
    created = true;
  } else if (attendance.status === 'Excused') {
    throw new ValidationError(`${student.fullName} is already marked Excused for ${recordDate}.`);
  }

  attendance.status = 'Excused';
  attendance.excuseReason = cleanReason.slice(0, 160);
  attendance.lateMinutes = 0;
  await attendance.save();

  return { action: 'excused', created, record: attendance.toClient(), studentName: student.fullName, studentId: student.studentId };
}

/** Removes an excuse and puts the record back to how it was. */
async function removeExcuse({ studentId, date }) {
  const { student, recordDate } = await prepare(studentId, date);
  const attendance = await Attendance.findOne({ student: student._id, date: recordDate });

  if (!attendance || attendance.status !== 'Excused') {
    throw new ValidationError(`${student.fullName} is not marked Excused for ${recordDate}.`);
  }

  if (attendance.timeIn) {
    // It was a real arrival that got excused — restore the computed status.
    const lateness = evaluateLateness({
      timeIn: attendance.timeIn,
      classStartTime: attendance.classStartTime === '—' ? '08:00' : attendance.classStartTime,
      lateGraceMinutes: 0,
      timeZone: (await getSettings()).timezone || 'Asia/Manila'
    });
    attendance.status = attendance.lateMinutes > 0 || lateness.isLate ? 'Late' : 'Present';
    attendance.lateMinutes = attendance.status === 'Late' ? Math.max(attendance.lateMinutes, lateness.lateMinutes) : 0;
  } else {
    // It was only ever an excuse -> the student goes back to "not marked".
    await attendance.deleteOne();
    return { action: 'removed', record: null, studentName: student.fullName, studentId: student.studentId };
  }

  attendance.excuseReason = '';
  await attendance.save();
  return { action: 'removed', record: attendance.toClient(), studentName: student.fullName, studentId: student.studentId };
}

/** Search + filter attendance records. */
async function listRecords({ search = '', date = '', status = '', from = '', to = '', limit = 200 }) {
  const query = {};
  const and = [];

  if (search && search.trim()) {
    const term = search.trim();
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    and.push({ $or: [{ studentName: rx }, { studentId: rx }, { date: rx }] });
  }
  if (date) {
    if (!isValidDateKey(date)) throw new ValidationError(`Invalid date filter "${date}".`);
    query.date = date;
  } else if (from || to) {
    const range = {};
    if (from) {
      if (!isValidDateKey(from)) throw new ValidationError(`Invalid "from" date "${from}".`);
      range.$gte = from;
    }
    if (to) {
      if (!isValidDateKey(to)) throw new ValidationError(`Invalid "to" date "${to}".`);
      range.$lte = to;
    }
    query.date = range;
  }
  if (status && status !== 'All') {
    if (!['Present', 'Late', 'Excused'].includes(status)) {
      throw new ValidationError('Status filter must be Present, Late, Excused or All.');
    }
    query.status = status;
  }
  if (and.length) query.$and = and;

  const records = await Attendance.find(query)
    .sort({ date: -1, timeIn: -1 })
    .limit(Math.min(Number(limit) || 200, 500))
    .lean();

  return records.map((r) => ({
    id: r._id.toString(),
    student: r.student.toString(),
    studentId: r.studentId,
    studentName: r.studentName,
    date: r.date,
    timeIn: r.timeIn,
    timeOut: r.timeOut,
    status: r.status,
    lateMinutes: r.lateMinutes,
    classStartTime: r.classStartTime,
    remarks: r.remarks,
    excuseReason: r.excuseReason || ''
  }));
}

/** Dashboard numbers for a given day (defaults to today). */
async function getDashboard(date) {
  const settings = await getSettings();
  const tz = settings.timezone || 'Asia/Manila';
  const day = date || dateKeyInTz(new Date(), tz);
  if (!isValidDateKey(day)) throw new ValidationError(`Invalid date "${day}".`);

  const [totalStudents, present, late, excused, totalNotifications, unreadNotifications, records] =
    await Promise.all([
      Student.countDocuments({ isActive: true }),
      Attendance.countDocuments({ date: day, status: 'Present' }),
      Attendance.countDocuments({ date: day, status: 'Late' }),
      Attendance.countDocuments({ date: day, status: 'Excused' }),
      require('../models/Notification').countDocuments({}),
      require('../models/Notification').countDocuments({ isRead: false }),
      Attendance.find({ date: day }).sort({ timeIn: -1 }).lean()
    ]);

  return {
    date: day,
    classStartTime: settings.classStartTime,
    lateGraceMinutes: settings.lateGraceMinutes,
    totalStudents,
    present,
    late,
    excused,
    absent: Math.max(0, totalStudents - (present + late + excused)),
    totalNotifications,
    unreadNotifications,
    recentRecords: records.slice(0, 6).map((r) => ({
      id: r._id.toString(),
      studentId: r.studentId,
      studentName: r.studentName,
      timeIn: r.timeIn,
      status: r.status,
      lateMinutes: r.lateMinutes
    }))
  };
}

module.exports = {
  ValidationError,
  markAttendance,
  markExcused,
  removeExcuse,
  getRoster,
  timeIn,
  timeOut,
  listRecords,
  getDashboard,
  findStudentOrFail
};
