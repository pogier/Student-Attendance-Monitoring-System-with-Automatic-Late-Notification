'use strict';

/**
 * NOTIFICATION LISTENER
 * ---------------------
 * This module knows nothing about attendance rules. It only reacts to events:
 *
 *   student_late  -> create an in-app notification, save it to history,
 *                    then publish `notification_created` so the UI can react.
 */

const Notification = require('../../models/Notification');
const { bus, EVENTS } = require('../bus');

function buildLateNotification(payload) {
  const lateLabel =
    payload.lateMinutes >= 60
      ? `${Math.floor(payload.lateMinutes / 60)}h ${payload.lateMinutes % 60}m`
      : `${payload.lateMinutes} min`;

  return {
    type: 'student_late',
    title: 'Late Arrival',
    message: `${payload.studentName} (${payload.studentId}) timed in at ${payload.timeInLabel}, ${lateLabel} after the ${payload.classStartTime} class start.`,
    student: payload.studentObjectId || null,
    studentId: payload.studentId,
    studentName: payload.studentName,
    attendance: payload.attendanceId || null,
    meta: {
      date: payload.date,
      timeIn: payload.timeIn,
      timeInLabel: payload.timeInLabel,
      classStartTime: payload.classStartTime,
      lateMinutes: payload.lateMinutes
    }
  };
}

async function handleStudentLate(payload) {
  const doc = await Notification.create(buildLateNotification(payload));
  const clientNotification = doc.toClient();
  console.log(`[notification] saved late notification for ${payload.studentName}`);

  // Chain a second event: anything else interested in new notifications
  // (e.g. the realtime listener) reacts to this, keeping modules decoupled.
  await bus.publish(EVENTS.NOTIFICATION_CREATED, clientNotification);

  return clientNotification;
}

/** Register the listener on the shared bus. */
function register(busInstance = bus) {
  busInstance.on(EVENTS.STUDENT_LATE, handleStudentLate, {
    label: 'notificationListener:student_late'
  });
  console.log('[listener] notification listener registered for "student_late"');
}

module.exports = { register, handleStudentLate, buildLateNotification };
