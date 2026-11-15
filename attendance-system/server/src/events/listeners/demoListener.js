'use strict';

/**
 * DEMO/AUDIT LISTENER
 * Proves the event bus works and prints every published event to the console.
 * Handy while presenting the project: you literally see
 *   [event] published -> student_late
 *   [notification] saved late notification for ...
 */

const { EVENTS } = require('../bus');

function register(bus) {
  Object.values(EVENTS).forEach((eventName) => {
    bus.on(
      eventName,
      (payload) => {
        if (eventName === EVENTS.STUDENT_LATE) {
          console.log(
            `[listener] student_late received -> ${payload.studentName} is ${payload.lateMinutes} min late`
          );
        }
        return payload;
      },
      { label: `demoListener:${eventName}` }
    );
  });
  console.log('[listener] audit/demo listener registered');
}

module.exports = { register };
