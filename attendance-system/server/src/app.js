'use strict';

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const studentRoutes = require('./routes/students.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const notificationRoutes = require('./routes/notifications.routes');
const settingsRoutes = require('./routes/settings.routes');
const { authRequired } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.use('/api/auth', authRoutes);

  // Everything below requires a logged-in teacher/admin.
  app.use('/api/students', authRequired, studentRoutes);
  app.use('/api/attendance', authRequired, attendanceRoutes);
  app.use('/api/notifications', authRequired, notificationRoutes);
  app.use('/api/settings', authRequired, settingsRoutes);

  app.use('/api', notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
