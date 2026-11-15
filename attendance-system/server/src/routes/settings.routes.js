'use strict';

const express = require('express');
const { getSettings, updateSettings } = require('../services/settingsService');
const { bus } = require('../events/bus');

const router = express.Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    const settings = await getSettings();
    res.json({ settings: settings.toClient() });
  } catch (err) {
    next(err);
  }
});

// PUT /api/settings  { classStartTime, lateGraceMinutes, className }
router.put('/', async (req, res, next) => {
  try {
    const { classStartTime, lateGraceMinutes, className } = req.body || {};
    const errors = [];

    if (classStartTime !== undefined && !TIME_RE.test(String(classStartTime))) {
      errors.push('Class start time must be in HH:mm 24-hour format (e.g. 08:00).');
    }
    if (
      lateGraceMinutes !== undefined &&
      (!Number.isFinite(Number(lateGraceMinutes)) ||
        Number(lateGraceMinutes) < 0 ||
        Number(lateGraceMinutes) > 120)
    ) {
      errors.push('Grace period must be between 0 and 120 minutes.');
    }
    if (className !== undefined && !String(className).trim()) {
      errors.push('Class name cannot be empty.');
    }
    if (errors.length) return res.status(400).json({ message: errors[0], details: errors });

    const settings = await updateSettings({ classStartTime, lateGraceMinutes, className });
    return res.json({ settings: settings.toClient(), message: 'Settings saved.' });
  } catch (err) {
    return next(err);
  }
});

// GET /api/settings/event-status  -> proves listeners are wired (used by the demo panel)
router.get('/event-status', (req, res) => {
  res.json({
    subscriptions: bus.subscriptions(),
    recentEvents: bus.recentEvents(10)
  });
});

module.exports = router;
