'use strict';

const express = require('express');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');

const router = express.Router();

const STUDENT_ID_RE = /^[A-Z0-9-]{3,20}$/;

function validateStudentPayload(body, { partial = false } = {}) {
  const errors = [];
  const out = {};

  const setIf = (key, transform = (v) => v) => {
    if (body[key] !== undefined) out[key] = transform(String(body[key]).trim());
  };

  if (body.studentId !== undefined || !partial) {
    const id = String(body.studentId || '').trim().toUpperCase();
    if (!id) errors.push('Student ID is required.');
    else if (!STUDENT_ID_RE.test(id))
      errors.push('Student ID must be 3-20 characters (letters, numbers or dashes).');
    else out.studentId = id;
  }
  if (body.firstName !== undefined || !partial) {
    const v = String(body.firstName || '').trim();
    if (!v) errors.push('First name is required.');
    else out.firstName = v;
  }
  if (body.lastName !== undefined || !partial) {
    const v = String(body.lastName || '').trim();
    if (!v) errors.push('Last name is required.');
    else out.lastName = v;
  }

  setIf('course');
  setIf('yearLevel');
  setIf('section');
  setIf('email', (v) => v.toLowerCase());

  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) {
    errors.push('Email address looks invalid.');
  }
  if (body.isActive !== undefined) out.isActive = Boolean(body.isActive);

  return { errors, data: out };
}

// GET /api/students?search=&active=
router.get('/', async (req, res, next) => {
  try {
    const { search = '', active = 'all' } = req.query;
    const query = {};
    if (search.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      query.$or = [{ firstName: rx }, { lastName: rx }, { studentId: rx }, { section: rx }];
    }
    if (active === 'true') query.isActive = true;
    if (active === 'false') query.isActive = false;

    const students = await Student.find(query).sort({ lastName: 1, firstName: 1 }).limit(500);
    res.json({ students });
  } catch (err) {
    next(err);
  }
});

// GET /api/students/:id
router.get('/:id', async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    const history = await Attendance.find({ student: student._id }).sort({ date: -1 }).limit(30);
    return res.json({ student, history: history.map((h) => h.toClient()) });
  } catch (err) {
    return next(err);
  }
});

// POST /api/students
router.post('/', async (req, res, next) => {
  try {
    const { errors, data } = validateStudentPayload(req.body || {});
    if (errors.length) return res.status(400).json({ message: errors[0], details: errors });

    const exists = await Student.findOne({ studentId: data.studentId });
    if (exists)
      return res
        .status(400)
        .json({ message: `Student ID "${data.studentId}" is already registered.` });

    const student = await Student.create(data);
    return res.status(201).json({ student, message: 'Student added successfully.' });
  } catch (err) {
    return next(err);
  }
});

// PUT /api/students/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { errors, data } = validateStudentPayload(req.body || {}, { partial: true });
    if (errors.length) return res.status(400).json({ message: errors[0], details: errors });

    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });

    if (data.studentId && data.studentId !== student.studentId) {
      const clash = await Student.findOne({ studentId: data.studentId, _id: { $ne: student._id } });
      if (clash)
        return res
          .status(400)
          .json({ message: `Student ID "${data.studentId}" is already used by another student.` });
    }

    Object.assign(student, data);
    await student.save();
    return res.json({ student, message: 'Student updated successfully.' });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/students/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) return res.status(404).json({ message: 'Student not found.' });
    await Attendance.deleteMany({ student: student._id });
    await student.deleteOne();
    return res.json({ message: `${student.fullName} was deleted along with their attendance records.` });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
