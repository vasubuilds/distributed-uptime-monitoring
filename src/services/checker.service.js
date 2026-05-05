const axios = require('axios');
const { getPool } = require('../config/database');
const { getRedis } = require('../config/redis');
const alertService = require('./alert.service');
const logger = require('../utils/logger');
const { checkDuration, checksTotal } = require('../utils/metrics');

/**
 * CheckerService
 *
 * Executes an HTTP probe against a monitored endpoint, records the result,
 * updates running stats, and triggers alerts when thresholds are crossed.
 */
class CheckerService {
  /**
   * Run a single health check for a monitor.
   * Called by the scheduler on each interval tick.
   */
  async check(monitor) {
    const start = Date.now();
    let status = 'up';
    let statusCode = null;
    let latencyMs = null;
    let errorMsg = null;

    try {
      const response = await axios({
        method: monitor.method || 'GET',
        url: monitor.url,
        headers: monitor.headers || {},
        data: monitor.body || undefined,
        timeout: monitor.timeout_ms || 5000,
        validateStatus: () => true,  // Don't throw on non-2xx
      });

      latencyMs = Date.now() - start;
      statusCode = response.status;

      if (statusCode !== monitor.expected_status) {
        status = 'down';
        errorMsg = `Expected ${monitor.expected_status}, got ${statusCode}`;
      }
    } catch (err) {
      latencyMs = Date.now() - start;
      status = 'down';
      errorMsg = err.code === 'ECONNABORTED'
        ? `Timeout after ${monitor.timeout_ms}ms`
        : err.message;
    }

    // Persist check result
    const checkRecord = await this._saveResult({
      monitorId: monitor.id,
      status,
      statusCode,
      latencyMs,
      errorMsg,
    });

    // Update rolling stats in Redis
    await this._updateStats(monitor.id, status, latencyMs);

    // Evaluate alert conditions (consecutive failures)
    await alertService.evaluate(monitor, status, errorMsg);

    // Record Prometheus metrics
    checkDuration.observe(
      { monitor_id: monitor.id, status },
      latencyMs / 1000
    );
    checksTotal.inc({ monitor_id: monitor.id, status });

    logger.debug({
      monitorId: monitor.id,
      url: monitor.url,
      status,
      latencyMs,
      statusCode,
    }, 'Health check complete');

    return checkRecord;
  }

  async _saveResult({ monitorId, status, statusCode, latencyMs, errorMsg }) {
    const pool = getPool();
    const result = await pool.query(
      `INSERT INTO check_results
         (monitor_id, status, status_code, latency_ms, error_message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [monitorId, status, statusCode, latencyMs, errorMsg]
    );

    // Also update the monitor's last_checked_at and current status
    await pool.query(
      `UPDATE monitors SET last_checked_at = NOW(), current_status = $1 WHERE id = $2`,
      [status, monitorId]
    );

    return result.rows[0];
  }

  /**
   * Maintain rolling 24h stats in Redis for instant dashboard reads.
   * Uses Redis sorted sets (score = timestamp) for time-windowed aggregation.
   */
  async _updateStats(monitorId, status, latencyMs) {
    const redis = getRedis();
    const now = Date.now();
    const window24h = now - 24 * 60 * 60 * 1000;

    const pipeline = redis.pipeline();
    const latencyKey = `stats:latency:${monitorId}`;
    const statusKey  = `stats:status:${monitorId}`;

    // Add current data point
    pipeline.zadd(latencyKey, now, `${now}:${latencyMs || 0}`);
    pipeline.zadd(statusKey,  now, `${now}:${status}`);

    // Trim entries older than 24h
    pipeline.zremrangebyscore(latencyKey, '-inf', window24h);
    pipeline.zremrangebyscore(statusKey,  '-inf', window24h);

    // Set expiry so keys self-clean if monitor is deleted
    pipeline.expire(latencyKey, 90000);
    pipeline.expire(statusKey,  90000);

    await pipeline.exec();
  }

  /**
   * Compute aggregated stats for a monitor over the last 24h from Redis.
   */
  async getStats(monitorId) {
    const redis = getRedis();
    const now = Date.now();
    const window24h = now - 24 * 60 * 60 * 1000;

    const latencyEntries = await redis.zrangebyscore(
      `stats:latency:${monitorId}`, window24h, '+inf'
    );
    const statusEntries = await redis.zrangebyscore(
      `stats:status:${monitorId}`, window24h, '+inf'
    );

    const latencies = latencyEntries
      .map((e) => parseInt(e.split(':')[1]))
      .filter(Boolean);

    const upCount   = statusEntries.filter((e) => e.endsWith(':up')).length;
    const downCount = statusEntries.filter((e) => e.endsWith(':down')).length;
    const total     = upCount + downCount;

    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : null;

    const p95 = latencies.length
      ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
      : null;

    return {
      monitorId,
      windowHours: 24,
      totalChecks: total,
      uptime: total ? ((upCount / total) * 100).toFixed(2) + '%' : 'N/A',
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95,
      uptimeChecks: upCount,
      downtimeChecks: downCount,
    };
  }

  /** Fetch paginated check history from PostgreSQL */
  async getHistory(monitorId, userId, limit = 50, offset = 0) {
    const pool = getPool();
    const result = await pool.query(
      `SELECT cr.*
       FROM check_results cr
       JOIN monitors m ON m.id = cr.monitor_id
       WHERE cr.monitor_id = $1 AND m.user_id = $2
       ORDER BY cr.checked_at DESC
       LIMIT $3 OFFSET $4`,
      [monitorId, userId, Math.min(limit, 200), offset]
    );
    return result.rows;
  }
}

module.exports = new CheckerService();
