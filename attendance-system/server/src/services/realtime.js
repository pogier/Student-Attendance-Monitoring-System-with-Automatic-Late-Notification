'use strict';

/**
 * Holds the Socket.IO server instance so listeners can push updates
 * to connected browsers without importing the HTTP server (no circular deps).
 */

let io = null;

function setIO(instance) {
  io = instance;
}

function getIO() {
  return io;
}

/** Broadcast an event to every connected client. */
function broadcast(eventName, payload) {
  if (io) io.emit(eventName, payload);
}

module.exports = { setIO, getIO, broadcast };
