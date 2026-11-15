'use strict';

const Settings = require('../models/Settings');
const config = require('../config');

const TZ = 'Asia/Manila';

/** Returns the settings document, creating the default one on first use. */
async function getSettings() {
  let settings = await Settings.findOne({ key: 'global' });
  if (!settings) {
    settings = await Settings.create({
      key: 'global',
      className: 'Class Attendance',
      classStartTime: config.defaultClassStartTime,
      lateGraceMinutes: config.defaultLateGraceMinutes,
      timezone: TZ
    });
  }
  return settings;
}

async function updateSettings({ classStartTime, lateGraceMinutes, className }) {
  const settings = await getSettings();
  if (classStartTime !== undefined) settings.classStartTime = classStartTime;
  if (lateGraceMinutes !== undefined) settings.lateGraceMinutes = Number(lateGraceMinutes);
  if (className !== undefined) settings.className = className;
  await settings.save();
  return settings;
}

module.exports = { getSettings, updateSettings, TZ };
