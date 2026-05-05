const { getPool } = require('../config/database');
const checkerService = require('../services/checker.service');
const monitorService = require('../services/monitor.service');

/**
 * ReportController
 *
 * Generates aggregated uptime and latency reports.
 * Uses PostgreSQL for historical queries (beyond 24h Redis window)
 * and Redis for the recent 24h fast-path.
 */

exports.summary = async (req, res, next) => {
  try {
    const monitors = await monitorService.listForUser(req.user.id);
    const statsPromises = monitors.map((m) =>
      checkerService.getStats(m.id).catch(() => null)
    );
    const stats = await Promise.all(statsPromises);

    const enriched = monitors.map((m, i) => ({
      ...m,
      stats: stats[i],
    }));

    res.json({ monitors: enriched });
  } catch (err) { next(err); }
};

exports.uptimeReport = async (req, res, next) => {
  try {
    const { monitorId } = req.params;
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const pool = getPool();

    const result = await pool.query(
      `SELECT
         DATE_TRUNC('day', checked_at) AS day,
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'up' THEN 1 ELSE 0 END) AS up_count,
         ROUND(AVG(latency_ms)) AS avg_latency_ms,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms
       FROM check_results cr
       JOIN monitors m ON m.id = cr.monitor_id
       WHERE cr.monitor_id = $1
         AND m.user_id = $2
         AND checked_at >= NOW() - INTERVAL '${days} days'
       GROUP BY day
       ORDER BY day DESC`,
      [monitorId, req.user.id]
    );

    const rows = result.rows.map((r) => ({
      day: r.day,
      total: parseInt(r.total),
      uptimePercent: r.total > 0
        ? ((r.up_count / r.total) * 100).toFixed(2)
        : null,
      avgLatencyMs: r.avg_latency_ms ? parseInt(r.avg_latency_ms) : null,
      p95LatencyMs: r.p95_latency_ms ? parseInt(r.p95_latency_ms) : null,
    }));

    res.json({ monitorId, days, report: rows });
  } catch (err) { next(err); }
};

exports.incidentLog = async (req, res, next) => {
  try {
    const { monitorId } = req.params;
    const pool = getPool();

    // Detect incidents = sequences of consecutive 'down' checks
    const result = await pool.query(
      `WITH ranked AS (
         SELECT
           checked_at,
           status,
           error_message,
           latency_ms,
           LAG(status) OVER (ORDER BY checked_at) AS prev_status
         FROM check_results cr
         JOIN monitors m ON m.id = cr.monitor_id
         WHERE cr.monitor_id = $1 AND m.user_id = $2
         ORDER BY checked_at DESC
         LIMIT 1000
       )
       SELECT * FROM ranked
       WHERE (status = 'down' AND (prev_status IS NULL OR prev_status = 'up'))
          OR (status = 'up'   AND prev_status = 'down')
       ORDER BY checked_at DESC`,
      [monitorId, req.user.id]
    );

    res.json({ monitorId, incidents: result.rows });
  } catch (err) { next(err); }
};
