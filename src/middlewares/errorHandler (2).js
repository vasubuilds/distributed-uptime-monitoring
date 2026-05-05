const logger = require('../utils/logger');
module.exports = (err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(err.status || 500).json({ error: err.status < 500 ? err.message : 'Internal error' });
};
