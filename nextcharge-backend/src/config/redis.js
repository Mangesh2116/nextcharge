const { createClient } = require('redis');
const logger = require('../utils/logger');

let client;

const connectRedis = async () => {
  client = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

  client.on('error', (err) => logger.error('Redis error:', err));
  client.on('connect', () => logger.info('✅ Redis connected'));
  client.on('reconnecting', () => logger.warn('Redis reconnecting...'));

  await client.connect();
  return client;
};

const getRedis = () => {
  if (!client) throw new Error('Redis not initialized');
  return client;
};

// Helper wrappers
const setCache = async (key, value, ttlSeconds = 300) => {
  if (!client) return; // 🔥 prevent crash

  await client.setEx(key, ttlSeconds, JSON.stringify(value));
};

const getCache = async (key) => {
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
};

const deleteCache = async (key) => {
  await client.del(key);
};

const deleteCachePattern = async (pattern) => {
  const keys = await client.keys(pattern);
  if (keys.length) await client.del(keys);
};

module.exports = { connectRedis, getRedis, setCache, getCache, deleteCache, deleteCachePattern };
