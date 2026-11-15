'use strict';

const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    course: { type: String, trim: true, default: '' },
    yearLevel: { type: String, trim: true, default: '' },
    section: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

studentSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

studentSchema.index({ firstName: 'text', lastName: 'text', studentId: 'text' });

module.exports = mongoose.model('Student', studentSchema);
