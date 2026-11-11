import { randomUUID } from 'node:crypto';
import type { Logger } from '../logging/logger';
import { requestContext } from '../logging/logger';

export interface JobStatus {
  name: string;
  intervalMs: number;
  running: boolean;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastDurationMs?: number;
  lastError?: string;
  consecutiveFailures: number;
  skippedOverlaps: number;
}

interface Job {
  name: string;
  intervalMs: number;
  run: () => Promise<unknown>;
  timer?: NodeJS.Timeout;
  status: JobStatus;
}

/**
 * Interval scheduler for background work. A run that is still going when the next tick
 * fires is not started twice (a slow controller must not stack up pollers), and every run
 * executes in its own correlation context so its log lines and upstream calls can be traced.
 */
export class Scheduler {
  private readonly jobs = new Map<string, Job>();
  private started = false;

  constructor(private readonly logger: Logger) {}

  register(name: string, intervalMs: number, run: () => Promise<unknown>): void {
    if (this.jobs.has(name)) throw new Error(`job ${name} already registered`);
    if (intervalMs <= 0) return;
    this.jobs.set(name, { name, intervalMs, run, status: { name, intervalMs, running: false, consecutiveFailures: 0, skippedOverlaps: 0 } });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const job of this.jobs.values()) {
      job.timer = setInterval(() => void this.runNow(job.name), job.intervalMs);
      job.timer.unref();
    }
    this.logger.info('scheduler started', { jobs: [...this.jobs.keys()] });
  }

  stop(): void {
    for (const job of this.jobs.values()) clearInterval(job.timer);
    this.started = false;
  }

  /** Runs a job immediately (also used on boot to warm caches). Resolves false when skipped. */
  async runNow(name: string): Promise<boolean> {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`unknown job ${name}`);
    if (job.status.running) {
      job.status.skippedOverlaps++;
      this.logger.warn('job still running, skipping tick', { job: name });
      return false;
    }
    job.status.running = true;
    const started = Date.now();
    job.status.lastStartedAt = new Date(started).toISOString();
    await requestContext.run({ correlationId: `job-${name}-${randomUUID()}` }, async () => {
      try {
        await job.run();
        job.status.consecutiveFailures = 0;
        job.status.lastError = undefined;
      } catch (err) {
        job.status.consecutiveFailures++;
        job.status.lastError = (err as Error).message;
        this.logger.error('job failed', { job: name, err, consecutiveFailures: job.status.consecutiveFailures });
      } finally {
        job.status.running = false;
        job.status.lastDurationMs = Date.now() - started;
        job.status.lastFinishedAt = new Date().toISOString();
      }
    });
    return true;
  }

  status(): JobStatus[] {
    return [...this.jobs.values()].map((j) => ({ ...j.status }));
  }
}
