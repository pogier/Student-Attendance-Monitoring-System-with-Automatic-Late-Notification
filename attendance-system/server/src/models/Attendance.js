'use strict';

const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    // One attendance row per student per day -> enforced below with a unique index.
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    studentId: { type: String, required: true, uppercase: true },
    studentName: { type: String, required: true },
    // Stored as a plain YYYY-MM-DD string so it is timezone-proof and easy to filter.
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    timeIn: { type: Date, default: null },
    timeOut: { type: Date, default: null },
    // Present | Late | Excused  (nothing is created until the student times in
    // or the teacher marks them excused)
    status: { type: String, enum: ['Present', 'Late', 'Excused'], required: true },
    lateMinutes: { type: Number, default: 0, min: 0 },
    classStartTime: { type: String, required: true }, // snapshot, e.g. "08:00"
    remarks: { type: String, default: '' },
    // Only set when status === 'Excused'
    excuseReason: { type: String, default: '' }
  },
  { timestamps: true }
);

attendanceSchema.index({ student: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });

attendanceSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    student: this.student.toString(),
    studentId: this.studentId,
    studentName: this.studentName,
    date: this.date,
    timeIn: this.timeIn,
    timeOut: this.timeOut,
    status: this.status,
    lateMinutes: this.lateMinutes,
    classStartTime: this.classStartTime,
    remarks: this.remarks,
    excuseReason: this.excuseReason
  };
};

module.exports = mongoose.model('Attendance', attendanceSchema);
