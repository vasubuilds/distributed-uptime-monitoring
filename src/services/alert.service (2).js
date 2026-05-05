const { getPool } = require('../config/database');
const { getRedis } = require('../config/redis');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');

const FAILURE_KEY = (monitorId) => `failures:${monitorId}`;

/**
 * AlertService
 *
 * Tracks consecutive failures per monitor in Redis.
 * When failures reach the monitor's alert_threshold, fires an alert.
 * Resets on recovery. Prevents alert storms with a "cooldown" flag.
 */
class AlertService {
  async evaluate(monitor, status, errorMsg) {
    const redis = getRedis();
    const failKey = FAILURE_KEY(monitor.id);

    if (status === 'up') {
      const prevFailures = parseInt(await redis.get(failKey) || '0');

      if (prevFailures >= monitor.alert_threshold) {
        // Recovery — was down, now up
        await this._createAlert(monitor, 'recovery', null);
        await notificationService.send(monitor, 'recovery', null);
        logger.info({ monitorId: monitor.id }, 'Monitor recovered');
      }

      await redis.del(failKey);
      return;
    }

    // Status = 'down'
    const failures = await redis.incr(failKey);
    await redis.expire(failKey, 3600); // auto-reset after 1h of no checks

    if (failures === monitor.alert_threshold) {
      // Exactly hit threshold — fire alert (not on every subsequent failure)
      await this._createAlert(monitor, 'down', errorMsg);
      await notificationService.send(monitor, 'down', errorMsg);
      logger.warn({ monitorId: monitor.id, failures, errorMsg }, 'Alert fired');
    }
  }

  async _createAlert(monitor, type, errorMsg) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO alerts (monitor_id, user_id, type, message)
       VALUES ($1, $2, $3, $4)`,
      [monitor.id, monitor.user_id, type,
       type === 'recovery'
         ? `${monitor.name} is back up`
         : `${monitor.name} is DOWN: ${errorMsg}`]
    );
  }

  async listAlerts(userId, limit = 50, offset = 0) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT a.*, m.name AS monitor_name, m.url
       FROM alerts a
       JOIN monitors m ON m.id = a.monitor_id
       WHERE a.user_id = $1
       ORDER BY a.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  async markRead(alertId, userId) {
    const pool = getPool();
    await pool.query(
      'UPDATE alerts SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [alertId, userId]
    );
  }

  async getUnreadCount(userId) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT COUNT(*) FROM alerts WHERE user_id = $1 AND is_read = FALSE',
      [userId]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = new AlertService();
