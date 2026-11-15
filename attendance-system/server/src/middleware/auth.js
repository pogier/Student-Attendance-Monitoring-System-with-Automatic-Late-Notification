'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn
  });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Not authenticated. Please log in.' });

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.userId = decoded.sub;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Session expired or invalid. Please log in again.' });
  }
}

async function loadUser(req, res, next) {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(401).json({ message: 'Account not found.' });
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { signToken, authRequired, loadUser };
