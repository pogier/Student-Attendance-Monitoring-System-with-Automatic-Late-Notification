'use strict';

require('dotenv').config();

const config = {
  port: Number(process.env.PORT || 5000),
  // If MONGODB_URI is not provided the app boots an in-memory MongoDB
  // (great for demos / a one-week school project).
  mongoUri: process.env.MONGODB_URI || '',
  useMemoryDb: !process.env.MONGODB_URI,
  memoryDbVersion: process.env.MEMORY_DB_VERSION || '7.0.14',
  jwtSecret: process.env.JWT_SECRET || 'attendance-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  defaultClassStartTime: process.env.DEFAULT_CLASS_START_TIME || '08:00',
  defaultLateGraceMinutes: Number(process.env.DEFAULT_LATE_GRACE_MINUTES || 0),
  admin: {
    name: process.env.ADMIN_NAME || 'Admin Teacher',
    username: (process.env.ADMIN_USERNAME || 'admin').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'admin123'
  },
  // Optional: lets the RTDB database file live on a persistent volume in production.
  dbPath: process.env.DB_FILE || ''
};

module.exports = config;
