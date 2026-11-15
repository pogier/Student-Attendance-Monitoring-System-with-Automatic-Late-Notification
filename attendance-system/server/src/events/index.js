'use strict';

/**
 * Wires every listener to the shared bus.
 * Called once during server startup (and once by the tests).
 */

const { bus } = require('./bus');
const notificationListener = require('./listeners/notificationListener');
const realtimeListener = require('./listeners/realtimeListener');
const demoListener = require('./listeners/demoListener');

function registerAllListeners(busInstance = bus) {
  notificationListener.register(busInstance);
  realtimeListener.register(busInstance);
  demoListener.register(busInstance);
  return busInstance;
}

module.exports = { registerAllListeners };
