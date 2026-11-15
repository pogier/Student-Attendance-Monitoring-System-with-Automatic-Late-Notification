'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { signToken, authRequired, loadUser } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required.' });
    }
    const user = await User.findOne({ username: String(username).trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    const ok = await bcrypt.compare(String(password), user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }
    return res.json({ token: signToken(user), user: user.toSafeJSON() });
  } catch (err) {
    return next(err);
  }
});

// GET /api/auth/me
router.get('/me', authRequired, loadUser, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

module.exports = router;
