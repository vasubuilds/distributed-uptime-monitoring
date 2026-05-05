const { Pool } = require('pg');
const logger = require('../utils/logger');

let pool;

async function connectDB() {
  pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME     || 'healthmon',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  pool.on('error', (err) => logger.error('DB pool error', err));
  const c = await pool.connect();
  await c.query('SELECT 1');
  c.release();
  return pool;
}

const getPool = () => {
  if (!pool) throw new Error('DB not initialized');
  return pool;
};

module.exports = { connectDB, getPool };
