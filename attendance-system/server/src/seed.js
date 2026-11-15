'use strict';

/**
 * Demo seed data.
 * Students are seeded on an empty database so the UI is immediately usable.
 * A little past attendance history (with matching notifications) is added too,
 * but TODAY is intentionally left empty so you can demonstrate "Time In" live.
 */

const mongoose = require('mongoose');
const Student = require('./models/Student');
const Attendance = require('./models/Attendance');
const Notification = require('./models/Notification');
const { getSettings } = require('./services/settingsService');
const { dateKeyInTz } = require('./services/timeService');

const STUDENTS = [
  ['2024-0001', 'Maria', 'Santos', 'BSIT', '3', 'A'],
  ['2024-0002', 'Juan', 'Dela Cruz', 'BSIT', '3', 'A'],
  ['2024-0003', 'Ana', 'Reyes', 'BSCS', '2', 'B'],
  ['2024-0004', 'Mark', 'Villanueva', 'BSIT', '3', 'A'],
  ['2024-0005', 'Jessa', 'Ramos', 'BSED', '1', 'C'],
  ['2024-0006', 'Kevin', 'Torres', 'BSCS', '2', 'B'],
  ['2024-0007', 'Liza', 'Mendoza', 'BSIT', '4', 'A'],
  ['2024-0008', 'Paolo', 'Garcia', 'BSED', '1', 'C'],
  ['2024-0009', 'Nicole', 'Bautista', 'BSCS', '2', 'B'],
  ['2024-0010', 'Rico', 'Aquino', 'BSIT', '4', 'A']
];

function dayOffset(days, timeZone) {
  // Shift back `days` school-days and read the calendar date in the school timezone.
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return dateKeyInTz(d, timeZone);
}

/** Creates an ISO Date for `dateKey` at HH:mm in the school timezone (approx, via UTC+8). */
function at(dateKey, hhmm) {
  // Asia/Manila is UTC+8 with no DST.
  return new Date(`${dateKey}T${hhmm}:00+08:00`);
}

async function seedDemoData({ includeHistory = true, today } = {}) {
  await getSettings();
  const tz = 'Asia/Manila';
  const todayKey = today || dateKeyInTz(new Date(), tz);

  const students = [];
  for (const [studentId, firstName, lastName, course, yearLevel, section] of STUDENTS) {
    const existing = await Student.findOne({ studentId });
    if (existing) {
      students.push(existing);
      continue;
    }
    students.push(
      await Student.create({
        studentId,
        firstName,
        lastName,
        course,
        yearLevel,
        section,
        email: `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, '') + '@example.edu'
      })
    );
  }

  let attendanceCreated = 0;
  let notificationsCreated = 0;

  if (includeHistory) {
    // Previous school days: a mix of Present and Late records.
    const plan = [
      { offset: 1, timeIn: '07:52', timeOut: '11:30', late: false },
      { offset: 1, timeIn: '08:14', timeOut: '11:31', late: true },
      { offset: 1, timeIn: '07:58', timeOut: '11:29', late: false },
      { offset: 2, timeIn: '08:23', timeOut: '11:35', late: true },
      { offset: 2, timeIn: '07:45', timeOut: '11:30', late: false },
      { offset: 3, timeIn: '08:05', timeOut: '11:33', late: true }
    ];

    const settings = await getSettings();

    for (let i = 0; i < plan.length; i += 1) {
      const item = plan[i];
      const student = students[i % students.length];
      const dateKey = dayOffset(item.offset, tz);
      const exists = await Attendance.findOne({ student: student._id, date: dateKey });
      if (exists) continue;

      const timeIn = at(dateKey, item.timeIn);
      const [h, m] = item.timeIn.split(':').map(Number);
      const startMinutes =
        Number(settings.classStartTime.split(':')[0]) * 60 + Number(settings.classStartTime.split(':')[1]);
      const lateMinutes = Math.max(0, h * 60 + m - startMinutes);

      const record = await Attendance.create({
        student: student._id,
        studentId: student.studentId,
        studentName: student.fullName,
        date: dateKey,
        timeIn,
        timeOut: at(dateKey, item.timeOut),
        status: item.late ? 'Late' : 'Present',
        lateMinutes: item.late ? lateMinutes : 0,
        classStartTime: settings.classStartTime
      });
      attendanceCreated += 1;

      if (item.late) {
        await Notification.create({
          type: 'student_late',
          title: 'Late Arrival',
          message: `${student.fullName} (${student.studentId}) timed in at ${item.timeIn}, ${lateMinutes} min after the ${settings.classStartTime} class start.`,
          student: student._id,
          studentId: student.studentId,
          studentName: student.fullName,
          attendance: record._id,
          isRead: item.offset > 1,
          meta: {
            date: dateKey,
            timeIn: timeIn.toISOString(),
            timeInLabel: item.timeIn,
            classStartTime: settings.classStartTime,
            lateMinutes
          },
          createdAt: at(dateKey, item.timeIn),
          updatedAt: at(dateKey, item.timeIn)
        });
        notificationsCreated += 1;
      }
    }
  }

  return { students: students.length, attendanceCreated, notificationsCreated, todayKey };
}

/** Called on server boot: seeds only when the database has no students yet. */
async function autoSeed() {
  const count = await Student.countDocuments({});
  if (count > 0) return { skipped: true };
  if (process.env.AUTO_SEED === 'false') return { skipped: true };
  const result = await seedDemoData({ includeHistory: true });
  console.log(
    `[seed] demo data ready -> ${result.students} students, ${result.attendanceCreated} past attendance records, ${result.notificationsCreated} notifications`
  );
  return result;
}

module.exports = { seedDemoData, autoSeed, STUDENTS };

// Allow `npm run seed`
if (require.main === module) {
  (async () => {
    const config = require('./config');
    if (config.mongoUri) {
      await mongoose.connect(config.mongoUri);
    } else {
      const { MongoMemoryServer } = require('mongodb-memory-server-core');
      const mem = await MongoMemoryServer.create({ binary: { version: config.memoryDbVersion } });
      await mongoose.connect(mem.getUri(), { dbName: 'attendance' });
      console.log('[seed] using a temporary in-memory database (set MONGODB_URI to persist).');
    }
    console.log(await seedDemoData());
    await mongoose.connection.close();
    process.exit(0);
  })();
}
