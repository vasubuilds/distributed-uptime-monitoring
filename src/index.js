require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { startScheduler } = require('./workers/scheduler');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await connectDB();
    logger.info('PostgreSQL connected');

    await connectRedis();
    logger.info('Redis connected');

    // Start background check scheduler
    await startScheduler();
    logger.info('Health check scheduler started');

    app.listen(PORT, () => {
      logger.info(`API HealthMon running on port ${PORT}`);
    });

    const graceful = () => {
      logger.info('Shutting down...');
      process.exit(0);
    };
    process.on('SIGTERM', graceful);
    process.on('SIGINT', graceful);
  } catch (err) {
    logger.error('Startup failed', err);
    process.exit(1);
  }
}

bootstrap();
