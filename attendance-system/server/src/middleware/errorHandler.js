'use strict';

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  // Mongoose duplicate key -> friendly message
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    return res.status(400).json({
      message: `That ${field} already exists. Please use a different one.`
    });
  }

  // Mongoose schema validation (has an `errors` map). Our own input errors
  // carry a statusCode + readable message and fall through to the generic branch.
  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ message: details[0] || 'Validation failed.', details });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${err.path}.` });
  }

  if (status >= 500) console.error('[error]', err);

  return res.status(status).json({ message: err.message || 'Something went wrong.' });
}

module.exports = { notFound, errorHandler };
