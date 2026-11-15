'use strict';

const mongoose = require('mongoose');

/** Single-row settings document holding the official class start time. */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    className: { type: String, default: 'Class Attendance' },
    classStartTime: { type: String, default: '08:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    lateGraceMinutes: { type: Number, default: 0, min: 0, max: 120 },
    timezone: { type: String, default: 'Asia/Manila' }
  },
  { timestamps: true }
);

settingsSchema.methods.toClient = function toClient() {
  return {
    className: this.className,
    classStartTime: this.classStartTime,
    lateGraceMinutes: this.lateGraceMinutes,
    timezone: this.timezone,
    updatedAt: this.updatedAt
  };
};

module.exports = mongoose.model('Settings', settingsSchema);
