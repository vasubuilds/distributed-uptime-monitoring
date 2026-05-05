const { v4: uuidv4 } = require('uuid');
const { getPool } = require('../config/database');
const { getRedis } = require('../config/redis');

const CACHE_TTL = 60; // seconds

class MonitorService {
  /**
   * Register a new endpoint to monitor.
   *
   * @param {object} opts
   * @param {string} opts.userId
   * @param {string} opts.name        Human-readable label (e.g. "Stripe API")
   * @param {string} opts.url         The endpoint URL to probe
   * @param {string} opts.method      HTTP method (default: GET)
   * @param {number} opts.intervalSec Probe interval in seconds (min: 30)
   * @param {number} opts.timeoutMs   Request timeout in ms (default: 5000)
   * @param {number} opts.expectedStatus  Expected HTTP status (default: 200)
   * @param {object} opts.headers     Custom headers to send
   * @param {string} opts.body        Request body for POST/PUT
   * @param {number} opts.alertThreshold  Consecutive failures before alerting
   */
  async create(opts) {
    const pool = getPool();
    const id = uuidv4();
    const {
      userId, name, url, method = 'GET',
      intervalSec = 60, timeoutMs = 5000,
      expectedStatus = 200, headers = {}, body = null,
      alertThreshold = 3,
    } = opts;

    const result = await pool.query(
      `INSERT INTO monitors
         (id, user_id, name, url, method, interval_sec, timeout_ms,
          expected_status, headers, body, alert_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [id, userId, name, url, method, intervalSec, timeoutMs,
       expectedStatus, JSON.stringify(headers), body, alertThreshold]
    );

    await this._invalidateCache(userId);
    return result.rows[0];
  }

  async update(id, userId, patch) {
    const pool = getPool();
    const allowed = ['name','url','method','interval_sec','timeout_ms',
                     'expected_status','headers','body','alert_threshold','is_active'];
    const sets = [];
    const vals = [];
    let idx = 1;

    for (const key of allowed) {
      if (patch[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        vals.push(key === 'headers' ? JSON.stringify(patch[key]) : patch[key]);
      }
    }
    if (!sets.length) throw new Error('No valid fields to update');

    vals.push(id, userId);
    const result = await pool.query(
      `UPDATE monitors SET ${sets.join(', ')}, updated_at = NOW()
       WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
      vals
    );
    if (!result.rows.length) throw Object.assign(new Error('Not found'), { status: 404 });

    await this._invalidateCache(userId);
    return result.rows[0];
  }

  async delete(id, userId) {
    const pool = getPool();
    const result = await pool.query(
      'DELETE FROM monitors WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    if (!result.rows.length) throw Object.assign(new Error('Not found'), { status: 404 });
    await this._invalidateCache(userId);
  }

  async getById(id, userId) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM monitors WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async listForUser(userId) {
    const redis = getRedis();
    const cacheKey = `monitors:user:${userId}`;

    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM monitors WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    await redis.set(cacheKey, JSON.stringify(result.rows), 'EX', CACHE_TTL);
    return result.rows;
  }

  /** Fetch all active monitors (used by the scheduler) */
  async listActive() {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM monitors WHERE is_active = TRUE'
    );
    return result.rows;
  }

  async _invalidateCache(userId) {
    await getRedis().del(`monitors:user:${userId}`).catch(() => null);
  }
}

module.exports = new MonitorService();
