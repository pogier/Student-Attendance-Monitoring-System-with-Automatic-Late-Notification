'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['student_late', 'attendance_time_in', 'attendance_time_out', 'system'],
      default: 'system'
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    // Who this notification is about (denormalised for fast display).
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    studentId: { type: String, default: '' },
    studentName: { type: String, default: '' },
    attendance: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null },
    isRead: { type: Boolean, default: false },
    meta: { type: Object, default: {} }
  },
  { timestamps: true }
);

notificationSchema.index({ isRead: 1, createdAt: -1 });

notificationSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    type: this.type,
    title: this.title,
    message: this.message,
    studentId: this.studentId,
    studentName: this.studentName,
    isRead: this.isRead,
    meta: this.meta,
    createdAt: this.createdAt
  };
};

module.exports = mongoose.model('Notification', notificationSchema);
