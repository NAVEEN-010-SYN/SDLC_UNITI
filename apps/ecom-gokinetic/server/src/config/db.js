'use strict';

const mongoose = require('mongoose');
const { logger } = require('./logger');

mongoose.set('strictQuery', true);

/**
 * Connects to MongoDB with bounded retries and exponential back-off.
 * @param {string} uri
 * @param {{ maxAttempts?: number, baseDelayMs?: number }} [options]
 */
async function connectDatabase(uri, { maxAttempts = 5, baseDelayMs = 500 } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 20,
        autoIndex: process.env.NODE_ENV !== 'production',
      });
      logger.info('mongo.connected', { host: mongoose.connection.host, attempt });
      return mongoose.connection;
    } catch (err) {
      if (attempt >= maxAttempts) {
        logger.error('mongo.connect_failed', { attempt, error: err });
        throw err;
      }
      const delay = baseDelayMs * 2 ** (attempt - 1);
      logger.warn('mongo.connect_retry', { attempt, delayMs: delay, error: err.message });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info('mongo.disconnected');
}

/** True when the default connection is in the `connected` state. */
function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseReady };
