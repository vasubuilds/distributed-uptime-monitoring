const Redis = require('ioredis');
const logger = require('../utils/logger');

let client;

async function connectRedis() {
  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: true,
  });
  client.on('error', (err) => logger.error('Redis error', err));
  await client.connect();
  return client;
}

const getRedis = () => {
  if (!client) throw new Error('Redis not initialized');
  return client;
};

module.exports = { connectRedis, getRedis };
