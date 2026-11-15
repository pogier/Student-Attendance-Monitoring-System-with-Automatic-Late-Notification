'use strict';

const express = require('express');
const Notification = require('../models/Notification');

const router = express.Router();

// GET /api/notifications?unread=true&limit=50
router.get('/', async (req, res, next) => {
  try {
    const { unread, limit = 50 } = req.query;
    const query = {};
    if (unread === 'true') query.isRead = false;

    const [notifications, unreadCount, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(limit) || 50, 200)),
      Notification.countDocuments({ isRead: false }),
      Notification.countDocuments({})
    ]);

    res.json({
      notifications: notifications.map((n) => n.toClient()),
      unreadCount,
      total
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    const result = await Notification.updateMany({ isRead: false }, { $set: { isRead: true } });
    res.json({ message: `${result.modifiedCount} notification(s) marked as read.`, updated: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    return res.json({ notification: notification.toClient() });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Notification.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Notification not found.' });
    return res.json({ message: 'Notification deleted.' });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
