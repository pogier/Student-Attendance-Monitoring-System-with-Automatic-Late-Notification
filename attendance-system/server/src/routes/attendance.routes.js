'use strict';

const express = require('express');
const attendanceService = require('../services/attendanceService');

const router = express.Router();

// GET /api/attendance?search=&date=&status=&from=&to=
router.get('/', async (req, res, next) => {
  try {
    const records = await attendanceService.listRecords(req.query);
    res.json({ records, count: records.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/roster?date=   -> every active student + today's state
// Used by the one-click grid so the teacher never has to search for a name.
router.get('/roster', async (req, res, next) => {
  try {
    res.json(await attendanceService.getRoster(req.query));
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/mark   { studentId, date?, notes? }
// ONE action: time-in if there is no record yet, otherwise time-out.
// This is what the attendance grid buttons and the Enter key use.
router.post('/mark', async (req, res, next) => {
  try {
    const { studentId, date, notes } = req.body || {};
    const result = await attendanceService.markAttendance({ studentId, date, notes });
    const { record, action } = result;

    let message;
    if (action === 'time-in') {
      message =
        record.status === 'Late'
          ? `${record.studentName} is LATE by ${record.lateMinutes} minute(s). A notification was created.`
          : `${record.studentName} timed in — Present.`;
    } else {
      message = `${record.studentName} timed out.`;
    }

    res.status(201).json({ ...result, message });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/time-in   { studentId, date?, notes? }
// The teacher clicking "Time In" lands here.
router.post('/time-in', async (req, res, next) => {
  try {
    const { studentId, date, notes } = req.body || {};
    const record = await attendanceService.timeIn({ studentId, date, notes });
    res.status(201).json({
      record,
      message:
        record.status === 'Late'
          ? `${record.studentName} is LATE by ${record.lateMinutes} minute(s). A notification was created.`
          : `${record.studentName} timed in on time.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/time-out  { studentId, date? }
router.post('/time-out', async (req, res, next) => {
  try {
    const { studentId, date } = req.body || {};
    const record = await attendanceService.timeOut({ studentId, date });
    res.json({ record, message: `${record.studentName} timed out.` });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/excuse   { studentId, date?, reason }
// Marks the student Excused (no time-in needed) so they are not counted absent.
router.post('/excuse', async (req, res, next) => {
  try {
    const { studentId, date, reason } = req.body || {};
    const result = await attendanceService.markExcused({ studentId, date, reason });
    res.status(201).json({
      ...result,
      message: `${result.studentName} marked Excused — ${result.record.excuseReason}.`
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/attendance/excuse   { studentId, date? }
// Undoes an excuse (deletes the record if it was excuse-only).
router.delete('/excuse', async (req, res, next) => {
  try {
    const studentId = req.query.studentId || (req.body && req.body.studentId);
    const date = req.query.date || (req.body && req.body.date);
    const result = await attendanceService.removeExcuse({ studentId, date });
    res.json({ ...result, message: `Excuse removed for ${result.studentName}.` });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/dashboard?date=
router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await attendanceService.getDashboard(req.query.date));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
