'use strict';

/**
 * A tiny publish/subscribe event bus.
 *
 * This is the heart of the "event-driven programming" requirement:
 * the attendance module PUBLISHES events, and totally separate listeners
 * (notification listener, realtime listener, logging listener) SUBSCRIBE to them.
 * The attendance module has no direct knowledge of notifications.
 */

class EventBus {
  constructor() {
    this.listeners = new Map(); // eventName -> Set<handler>
    this.log = []; // small in-memory ring buffer, useful for the demo/debug route
    this.maxLog = 100;
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(eventName, handler, { label = 'anonymous' } = {}) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    const wrapped = { handler, label };
    this.listeners.get(eventName).add(wrapped);
    return () => this.off(eventName, handler);
  }

  /** Subscribe once. */
  once(eventName, handler, options) {
    const off = this.on(eventName, async (...args) => {
      off();
      return handler(...args);
    }, options);
    return off;
  }

  off(eventName, handler) {
    const set = this.listeners.get(eventName);
    if (!set) return;
    for (const entry of set) {
      if (entry.handler === handler) set.delete(entry);
    }
  }

  /**
   * Publish an event. Listeners run independently:
   * one failing listener must never break the HTTP request that published the event.
   */
  async publish(eventName, payload) {
    const envelope = {
      name: eventName,
      payload,
      publishedAt: new Date().toISOString()
    };

    this.log.unshift(envelope);
    if (this.log.length > this.maxLog) this.log.pop();

    console.log(`[event] published -> ${eventName}`);

    const set = this.listeners.get(eventName);
    if (!set || set.size === 0) return [];

    const results = await Promise.allSettled(
      [...set].map(async ({ handler, label }) => {
        try {
          return await handler(payload, envelope);
        } catch (err) {
          console.error(`[event] listener "${label}" failed for ${eventName}:`, err.message);
          throw err;
        }
      })
    );

    return results;
  }

  /** Names of events currently subscribed by at least one listener (for the demo route). */
  subscriptions() {
    const out = {};
    for (const [name, set] of this.listeners.entries()) {
      out[name] = [...set].map((e) => e.label);
    }
    return out;
  }

  recentEvents(limit = 20) {
    return this.log.slice(0, limit);
  }
}

// Single shared bus for the whole process.
const bus = new EventBus();

// Central place for event name constants so nobody typos a string.
const EVENTS = {
  STUDENT_LATE: 'student_late',
  ATTENDANCE_TIME_IN: 'attendance_time_in',
  ATTENDANCE_TIME_OUT: 'attendance_time_out',
  NOTIFICATION_CREATED: 'notification_created'
};

module.exports = { bus, EventBus, EVENTS };
