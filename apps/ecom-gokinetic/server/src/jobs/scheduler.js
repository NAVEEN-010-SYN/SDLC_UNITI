'use strict';

const { logger, requestContext } = require('../config/logger');
const { generateCorrelationId } = require('../domain/identifiers');

/**
 * In-process interval scheduler for background jobs.
 *
 * - a job never overlaps itself: a tick is skipped while the previous run is
 *   still going (slow upstreams must not pile up concurrent runs)
 * - each run gets its own correlation id so its log lines (and outbound
 *   calls) can be traced like an HTTP request
 * - failures are logged and the job keeps its schedule
 *
 * With several API replicas each pod runs the jobs; every job is written to
 * be idempotent (compare-and-set transitions, unique invoice keys, email
 * de-duplication) so concurrent runs are safe, merely wasteful.
 */
function createScheduler({ log = logger, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const jobs = new Map();

  async function runJob(job) {
    if (job.running) {
      log.debug('job.skipped_overlap', { job: job.name });
      return { skipped: true };
    }
    job.running = true;
    const started = Date.now();
    const correlationId = `job-${job.name}-${generateCorrelationId()}`;
    try {
      const result = await requestContext.run({ correlationId }, () => job.run());
      job.lastRunAt = new Date();
      job.lastError = null;
      log.info('job.completed', { job: job.name, durationMs: Date.now() - started, result });
      return { skipped: false, result };
    } catch (err) {
      job.lastError = err.message;
      log.error('job.failed', { job: job.name, durationMs: Date.now() - started, error: err });
      return { skipped: false, error: err };
    } finally {
      job.running = false;
    }
  }

  return {
    /**
     * @param {string} name
     * @param {number} intervalMs
     * @param {() => Promise<unknown>} run
     */
    register(name, intervalMs, run) {
      if (jobs.has(name)) throw new Error(`Job ${name} already registered`);
      if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new RangeError(`Job ${name} interval must be at least 1000ms`);
      }
      jobs.set(name, { name, intervalMs, run, timer: null, running: false, lastRunAt: null, lastError: null });
    },

    start() {
      for (const job of jobs.values()) {
        job.timer = setIntervalFn(() => {
          runJob(job);
        }, job.intervalMs);
        if (job.timer && job.timer.unref) job.timer.unref();
      }
      log.info('jobs.started', { jobs: [...jobs.keys()] });
    },

    stop() {
      for (const job of jobs.values()) {
        if (job.timer) clearIntervalFn(job.timer);
        job.timer = null;
      }
    },

    /** Runs a job immediately (ops endpoint / tests). */
    async runNow(name) {
      const job = jobs.get(name);
      if (!job) throw new RangeError(`Unknown job ${name}`);
      return runJob(job);
    },

    status() {
      return [...jobs.values()].map((j) => ({
        name: j.name,
        intervalMs: j.intervalMs,
        running: j.running,
        lastRunAt: j.lastRunAt ? j.lastRunAt.toISOString() : null,
        lastError: j.lastError,
      }));
    },
  };
}

module.exports = { createScheduler };
