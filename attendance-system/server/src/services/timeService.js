'use strict';

/**
 * Pure date/time helpers (no DB, no Express) so they can be unit-tested.
 * The school day is evaluated in a fixed timezone (Asia/Manila by default)
 * so "late" is not affected by where the server is hosted.
 */

const DEFAULT_TZ = 'Asia/Manila';

/** Returns "YYYY-MM-DD" for the given instant in the given timezone. */
function dateKeyInTz(instant = new Date(), timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(instant);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes since midnight for the given instant in the given timezone. */
function minutesOfDayInTz(instant = new Date(), timeZone = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(instant);
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  return get('hour') * 60 + get('minute');
}

/** "08:00" -> 480 */
function timeStringToMinutes(timeString) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeString))) {
    throw new Error(`Invalid time format "${timeString}". Expected HH:mm.`);
  }
  const [h, m] = timeString.split(':').map(Number);
  return h * 60 + m;
}

/** 480 -> "08:00" */
function minutesToTimeString(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when the string is a real calendar date formatted YYYY-MM-DD. */
function isValidDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Core late-detection rule.
 * A student is Late when their time-in minute-of-day is AFTER
 * (class start + grace).
 *
 * @returns {{isLate: boolean, lateMinutes: number, threshold: string, startMinutes: number}}
 */
function evaluateLateness({ timeIn, classStartTime, lateGraceMinutes = 0, timeZone = DEFAULT_TZ }) {
  const nowMinutes = minutesOfDayInTz(timeIn, timeZone);
  const startMinutes = timeStringToMinutes(classStartTime);
  const threshold = startMinutes + Number(lateGraceMinutes || 0);
  const lateMinutes = Math.max(0, nowMinutes - threshold);
  return {
    isLate: nowMinutes > threshold,
    lateMinutes,
    threshold: minutesToTimeString(threshold % 1440),
    startMinutes
  };
}

/** "08:05" style clock label for the given instant. */
function formatClockInTz(instant, timeZone = DEFAULT_TZ) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(instant);
}

module.exports = {
  DEFAULT_TZ,
  dateKeyInTz,
  minutesOfDayInTz,
  timeStringToMinutes,
  minutesToTimeString,
  isValidDateKey,
  evaluateLateness,
  formatClockInTz
};
