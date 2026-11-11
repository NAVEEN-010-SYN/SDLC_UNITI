'use strict';

const express = require('express');

/**
 * Liveness and readiness probes.
 *
 * - `/health` answers as long as the process is serving requests (used by
 *   the container HEALTHCHECK and the load balancer)
 * - `/health/ready` also requires MongoDB; the orchestrator stops routing
 *   traffic to a pod that loses its database instead of restarting it
 *
 * @param {{ isDatabaseReady: () => boolean, scheduler?: { status(): object[] }, version?: string }} deps
 */
function createHealthRouter({ isDatabaseReady, scheduler, version = process.env.npm_package_version || 'dev' }) {
  const router = express.Router();
  const startedAt = new Date();

  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'UP',
      version,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  router.get('/ready', (_req, res) => {
    const database = isDatabaseReady() ? 'UP' : 'DOWN';
    const jobs = scheduler ? scheduler.status() : [];
    const status = database === 'UP' ? 'UP' : 'DOWN';
    res
      .status(status === 'UP' ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status, checks: { database }, jobs: jobs.map(({ name, running, lastRunAt, lastError }) => ({ name, running, lastRunAt, failing: Boolean(lastError) })) });
  });

  return router;
}

module.exports = { createHealthRouter };
