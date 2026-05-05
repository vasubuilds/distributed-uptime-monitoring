const cron = require('node-cron');
const monitorService = require('../services/monitor.service');
const checkerService = require('../services/checker.service');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Scheduler
 *
 * Runs a global tick every 30 seconds.
 * For each active monitor, checks whether its interval has elapsed
 * using a Redis timestamp key — this prevents duplicate checks across
 * multiple instances (distributed locking via SET NX EX).
 */
async function startScheduler() {
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const monitors = await monitorService.listActive();
      const redis = getRedis();
      const now = Date.now();

      for (const monitor of monitors) {
        const lockKey = `lock:check:${monitor.id}`;
        const intervalMs = (monitor.interval_sec || 60) * 1000;

        // Distributed lock: only one instance runs the check per interval
        // SET NX EX ensures atomicity
        const acquired = await redis.set(
          lockKey,
          '1',
          'PX', intervalMs - 1000,  // release ~1s before next interval
          'NX'                       // only set if not exists
        );

        if (!acquired) continue; // another instance already scheduled this one

        // Fire-and-forget the check; errors are logged, not rethrown
        checkerService.check(monitor).catch((err) => {
          logger.error({ err, monitorId: monitor.id }, 'Check failed unexpectedly');
        });
      }
    } catch (err) {
      logger.error({ err }, 'Scheduler tick error');
    }
  });

  logger.info('Scheduler initialized (30s tick)');
}

module.exports = { startScheduler };
