'use strict';

/**
 * REALTIME LISTENER
 * Pushes events to connected React clients over Socket.IO.
 * It only listens - it never touches attendance or notification logic.
 */

const { EVENTS } = require('../bus');
const realtime = require('../../services/realtime');

function register(bus) {
  bus.on(
    EVENTS.NOTIFICATION_CREATED,
    (notification) => realtime.broadcast('notification:new', notification),
    { label: 'realtimeListener:notification_created' }
  );

  bus.on(
    EVENTS.ATTENDANCE_TIME_IN,
    (payload) => realtime.broadcast('attendance:time_in', payload),
    { label: 'realtimeListener:attendance_time_in' }
  );

  bus.on(
    EVENTS.ATTENDANCE_TIME_OUT,
    (payload) => realtime.broadcast('attendance:time_out', payload),
    { label: 'realtimeListener:attendance_time_out' }
  );

  console.log('[listener] realtime listener registered');
}

module.exports = { register };
