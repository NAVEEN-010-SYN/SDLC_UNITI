# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal/api/src (part 2 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `apps/sdwan-portal/api/src/domain/types.ts` (292 lines)
- `apps/sdwan-portal/api/src/errors/problem.ts` (126 lines)
- `apps/sdwan-portal/api/src/http/middleware.ts` (63 lines)
- `apps/sdwan-portal/api/src/jobs/Scheduler.test.ts` (54 lines)
- `apps/sdwan-portal/api/src/jobs/Scheduler.ts` (91 lines)
- `apps/sdwan-portal/api/src/jobs/tasks.ts` (74 lines)
- `apps/sdwan-portal/api/src/logging/logger.ts` (85 lines)
- `apps/sdwan-portal/api/src/providers/ProviderRegistry.ts` (60 lines)
- `apps/sdwan-portal/api/src/providers/SdwanProvider.ts` (72 lines)
- `apps/sdwan-portal/api/src/providers/applicationCatalog.ts` (47 lines)
- `apps/sdwan-portal/api/src/providers/fortinet/FortiManagerClient.test.ts` (61 lines)
- `apps/sdwan-portal/api/src/providers/fortinet/FortiManagerClient.ts` (157 lines)
- `apps/sdwan-portal/api/src/providers/fortinet/FortinetAdapter.ts` (345 lines)

## apps/sdwan-portal/api/src/domain/types.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/types.ts`.

```typescript
/**
 * Vendor-neutral SD-WAN model. Every adapter maps its controller's native objects
 * into these shapes; nothing above the provider layer knows which vendor it is
 * talking to except through the `vendor` discriminator.
 */

export type Vendor = 'VELOCLOUD' | 'FORTINET';

export type Role = 'BUSINESS_ADMIN' | 'BUSINESS_USER' | 'SUPPORT_AGENT' | 'PARTNER_ADMIN' | 'PARTNER_AGENT';

/** Opaque reference to the object inside the vendor controller (VCO edge id, FortiGate serial, ...). */
export interface VendorRef {
  vendor: Vendor;
  /** VeloCloud enterpriseId or FortiManager ADOM. */
  tenant: string;
  id: string;
}

export interface Site {
  id: string;
  accountId: string;
  name: string;
  address: { line1: string; city: string; postcode: string; country: string };
  vendor: Vendor;
  vendorRef: VendorRef;
  region?: string;
  edgeIds: string[];
}

export type EdgeStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type HaState = 'STANDALONE' | 'ACTIVE' | 'STANDBY' | 'FAILED';
export type Transport = 'FIBRE' | 'BROADBAND' | 'LTE' | 'MPLS' | 'UNKNOWN';
export type LinkState = 'UP' | 'DOWN' | 'STANDBY' | 'UNKNOWN';

export interface WanLink {
  id: string;
  edgeId: string;
  name: string;
  interface: string;
  transport: Transport;
  ispName?: string;
  publicIp?: string;
  bandwidthDownKbps: number;
  bandwidthUpKbps: number;
  state: LinkState;
}

export interface Edge {
  id: string;
  siteId: string;
  accountId: string;
  vendor: Vendor;
  vendorRef: VendorRef;
  name: string;
  model: string;
  serialNumber: string;
  softwareVersion: string;
  status: EdgeStatus;
  haState: HaState;
  lastContact?: string;
  links: WanLink[];
}

/** One measurement interval for one WAN link. */
export interface LinkSample {
  edgeId: string;
  linkId: string;
  timestamp: string;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  rxBps: number;
  txBps: number;
}

export type ServiceClass = 'REALTIME' | 'TRANSACTIONAL' | 'BULK';
export type PolicyPriority = 'HIGH' | 'NORMAL' | 'LOW';
export type SteeringMode = 'BEST_PATH' | 'PREFERRED_TRANSPORT' | 'LOAD_BALANCE' | 'MANDATORY_TRANSPORT';

export interface SlaThresholds {
  maxLatencyMs: number;
  maxJitterMs: number;
  maxLossPct: number;
}

export interface PolicyMatch {
  applications?: string[];
  sourceCidrs?: string[];
  destinationCidrs?: string[];
  protocol?: 'TCP' | 'UDP' | 'ICMP' | 'ANY';
  destinationPorts?: PortRange[];
  dscp?: number;
}

export interface PortRange {
  from: number;
  to: number;
}

export interface BusinessPolicy {
  id: string;
  name: string;
  /** Lower number = evaluated first. */
  order: number;
  enabled: boolean;
  match: PolicyMatch;
  action: {
    serviceClass: ServiceClass;
    priority: PolicyPriority;
    steering: SteeringMode;
    preferredTransport?: Transport;
    sla?: SlaThresholds;
    rateLimitKbps?: number;
    dscpRemark?: number;
  };
}

export type FirewallAction = 'ALLOW' | 'DENY';

export interface FirewallRule {
  id: string;
  name: string;
  sequence: number;
  enabled: boolean;
  action: FirewallAction;
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'ANY';
  sourceCidrs: string[];
  destinationCidrs: string[];
  destinationPorts: PortRange[];
  log: boolean;
}

export type ChangeType =
  | 'POLICY_UPDATE'
  | 'FIREWALL_UPDATE'
  | 'CONFIG_ROLLBACK'
  | 'SOFTWARE_UPGRADE'
  | 'EDGE_REBOOT';

export type ChangeStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Approval {
  userId: string;
  role: Role;
  decision: 'APPROVE' | 'REJECT';
  comment?: string;
  decidedAt: string;
}

export interface ChangeHistoryEntry {
  at: string;
  by: string;
  from: ChangeStatus | null;
  to: ChangeStatus;
  note?: string;
}

export type ChangePayload =
  | { type: 'POLICY_UPDATE'; policies: BusinessPolicy[] }
  | { type: 'FIREWALL_UPDATE'; rules: FirewallRule[] }
  | { type: 'CONFIG_ROLLBACK'; backupId: string }
  | { type: 'SOFTWARE_UPGRADE'; targetVersion: string }
  | { type: 'EDGE_REBOOT' };

export interface ChangeExecutionResult {
  edgeId: string;
  ok: boolean;
  backupId?: string;
  error?: string;
  finishedAt: string;
}

export interface ChangeRequest {
  id: string;
  accountId: string;
  title: string;
  description?: string;
  type: ChangeType;
  edgeIds: string[];
  payload: ChangePayload;
  risk: RiskLevel;
  riskReasons: string[];
  emergency: boolean;
  status: ChangeStatus;
  requestedBy: string;
  requestedByRole: Role;
  approvals: Approval[];
  maintenanceWindowId?: string;
  scheduledFor?: string;
  results: ChangeExecutionResult[];
  history: ChangeHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceWindow {
  id: string;
  accountId: string;
  name: string;
  /** 0 = Sunday ... 6 = Saturday, in UTC. */
  daysOfWeek: number[];
  /** HH:mm UTC. */
  startTime: string;
  durationMinutes: number;
  /** Optional blackout dates (YYYY-MM-DD) where the window does not open. */
  blackoutDates: string[];
}

export interface ConfigBackup {
  id: string;
  accountId: string;
  edgeId: string;
  vendor: Vendor;
  takenAt: string;
  takenBy: string;
  reason: 'MANUAL' | 'PRE_CHANGE' | 'SCHEDULED';
  changeRequestId?: string;
  checksum: string;
  sizeBytes: number;
  vendorVersion: string;
  content: Record<string, unknown>;
}

export type AlertSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlertType =
  | 'EDGE_DOWN'
  | 'LINK_DOWN'
  | 'HIGH_LATENCY'
  | 'HIGH_JITTER'
  | 'HIGH_LOSS'
  | 'SLA_BREACH'
  | 'HA_FAILOVER'
  | 'CONFIG_CHANGE';

export interface Alert {
  id: string;
  accountId: string;
  edgeId: string;
  linkId?: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  /** Key used to de-duplicate repeated raises of the same condition. */
  fingerprint: string;
  occurrences: number;
  raisedAt: string;
  lastSeenAt: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

export interface SdwanEvent {
  id: string;
  accountId: string;
  edgeId?: string;
  vendor: Vendor;
  occurredAt: string;
  category: 'EDGE' | 'LINK' | 'CONFIG' | 'SECURITY' | 'SYSTEM';
  severity: AlertSeverity;
  message: string;
  raw?: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Principal {
  userId: string;
  roles: Role[];
  /** Business users are bound to one account; support agents may carry none. */
  accountId?: string;
  partnerAccountIds?: string[];
}
```

## apps/sdwan-portal/api/src/errors/problem.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/errors/problem.ts`.

```typescript
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from '../logging/logger';
import { currentCorrelationId } from '../logging/logger';

const TYPE_BASE = 'https://errors.uniti.example/sdwan';

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  [extension: string]: unknown;
}

/** Base for every error that maps onto an RFC 7807 response. */
export class ProblemError extends Error {
  constructor(
    public readonly status: number,
    public readonly slug: string,
    public readonly title: string,
    detail?: string,
    public readonly extensions: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }

  toProblem(instance?: string): ProblemDetails {
    return {
      type: `${TYPE_BASE}/${this.slug}`,
      title: this.title,
      status: this.status,
      detail: this.message,
      instance,
      correlationId: currentCorrelationId(),
      ...this.extensions,
    };
  }
}

export class ValidationProblem extends ProblemError {
  constructor(errors: Array<{ path: string; message: string }>) {
    super(400, 'validation', 'Request validation failed', `${errors.length} field(s) invalid`, { errors });
  }
}

export class UnauthorizedProblem extends ProblemError {
  constructor(detail = 'A valid bearer token is required') {
    super(401, 'unauthorized', 'Unauthorized', detail);
  }
}

export class ForbiddenProblem extends ProblemError {
  constructor(detail = 'You do not have permission to perform this action') {
    super(403, 'forbidden', 'Forbidden', detail);
  }
}

export class NotFoundProblem extends ProblemError {
  constructor(resource: string, id: string) {
    super(404, 'not-found', 'Resource not found', `${resource} ${id} was not found`, { resource, id });
  }
}

export class ConflictProblem extends ProblemError {
  constructor(detail: string, extensions: Record<string, unknown> = {}) {
    super(409, 'conflict', 'Conflict', detail, extensions);
  }
}

export class BusinessRuleProblem extends ProblemError {
  constructor(rule: string, detail: string, extensions: Record<string, unknown> = {}) {
    super(422, `rule/${rule}`, 'Business rule violated', detail, { rule, ...extensions });
  }
}

/** Upstream vendor (VCO / FortiManager / FortiGate) failed or returned something we cannot use. */
export class UpstreamProblem extends ProblemError {
  constructor(vendor: string, detail: string, public readonly retryable = false, upstreamStatus?: number) {
    super(502, 'upstream', 'Upstream SD-WAN controller error', detail, { vendor, retryable, upstreamStatus });
  }
}

export class UpstreamTimeoutProblem extends ProblemError {
  constructor(vendor: string, timeoutMs: number) {
    super(504, 'upstream-timeout', 'Upstream SD-WAN controller timed out', `${vendor} did not respond within ${timeoutMs} ms`, {
      vendor,
      retryable: true,
    });
  }
}

export function zodToValidationProblem(err: ZodError): ValidationProblem {
  return new ValidationProblem(
    err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
  );
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new ProblemError(404, 'route-not-found', 'Route not found', `${req.method} ${req.path} is not a known endpoint`));
};

export function problemHandler(logger: Logger): ErrorRequestHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    let problem: ProblemError;
    if (err instanceof ProblemError) {
      problem = err;
    } else if (err instanceof ZodError) {
      problem = zodToValidationProblem(err);
    } else if (err?.type === 'entity.parse.failed') {
      problem = new ProblemError(400, 'malformed-json', 'Malformed JSON body', 'The request body is not valid JSON');
    } else {
      logger.error('unhandled error', { err, path: req.path, method: req.method });
      problem = new ProblemError(500, 'internal', 'Internal Server Error', 'An unexpected error occurred');
    }
    if (problem.status >= 500 && err instanceof ProblemError) {
      logger.warn('upstream/server problem', { status: problem.status, slug: problem.slug, detail: problem.message });
    }
    res.status(problem.status).type('application/problem+json').json(problem.toProblem(req.originalUrl));
  };
}
```

## apps/sdwan-portal/api/src/http/middleware.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/http/middleware.ts`.

```typescript
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger } from '../logging/logger';
import { requestContext } from '../logging/logger';

const CORRELATION_HEADER = 'x-correlation-id';
const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Accepts an inbound X-Correlation-Id (if well-formed) or mints one, echoes it on the
 * response, and runs the rest of the request inside an AsyncLocalStorage context so
 * logs and outbound vendor calls carry it automatically.
 */
export const correlationId: RequestHandler = (req, res, next) => {
  const inbound = req.header(CORRELATION_HEADER);
  const id = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Correlation-Id', id);
  requestContext.run({ correlationId: id }, () => next());
};

export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      logger[level]('http request', {
        method: req.method,
        path: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
        status: res.statusCode,
        durationMs: Math.round(ms * 10) / 10,
      });
    });
    next();
  };
}

export function cors(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins.filter(Boolean));
  return (req, res, next) => {
    const origin = req.header('origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Correlation-Id, If-Match');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id, ETag');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  };
}

/** Wraps an async handler so rejections reach the problem+json error handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

## apps/sdwan-portal/api/src/jobs/Scheduler.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/jobs/Scheduler.test.ts`.

```typescript
import { currentCorrelationId, silentLogger } from '../logging/logger';
import { createHarness, HA_EDGE } from '../testing/harness';
import { Scheduler } from './Scheduler';
import { pollMetrics } from './tasks';

describe('Scheduler', () => {
  it('skips a tick while the previous run is still in flight', async () => {
    const s = new Scheduler(silentLogger);
    let release!: () => void;
    s.register('slow', 1000, () => new Promise<void>((r) => (release = r)));
    const first = s.runNow('slow');
    await expect(s.runNow('slow')).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
    expect(s.status()[0]).toMatchObject({ running: false, skippedOverlaps: 1, consecutiveFailures: 0 });
  });

  it('runs each job in its own correlation context and records failures', async () => {
    const s = new Scheduler(silentLogger);
    const seen: Array<string | undefined> = [];
    s.register('flaky', 1000, async () => {
      seen.push(currentCorrelationId());
      throw new Error('controller unreachable');
    });
    await s.runNow('flaky');
    await s.runNow('flaky');
    expect(seen[0]).toMatch(/^job-flaky-/);
    expect(seen[0]).not.toBe(seen[1]);
    expect(s.status()[0]).toMatchObject({ consecutiveFailures: 2, lastError: 'controller unreachable' });
  });
});

describe('pollMetrics', () => {
  it('backfills an hour on first poll and continues from the newest stored sample', async () => {
    const h = createHarness();
    const deps = { tenants: h.c.repos.tenants, inventory: h.c.inventory, metrics: h.c.repos.metrics, logger: silentLogger };
    const spy = jest.spyOn(h.mocks.VELOCLOUD, 'getLinkMetrics');

    const first = await pollMetrics(deps, h.clock.now);
    expect(first.failures).toBe(0);
    expect(first.samples).toBeGreaterThan(0);
    const hqCall = spy.mock.calls.find(([, edge]) => edge === 'hq-edge-1')!;
    expect(Date.parse(hqCall[2].to) - Date.parse(hqCall[2].from)).toBe(60 * 60_000);

    const newest = h.c.repos.metrics.lastTimestampForEdge(HA_EDGE);
    h.clock.advance(10);
    spy.mockClear();
    await pollMetrics(deps, h.clock.now);
    const next = spy.mock.calls.find(([, edge]) => edge === 'hq-edge-1')!;
    expect(next[2].from).toBe(newest);
    expect(Date.parse(next[2].to) - Date.parse(next[2].from)).toBeLessThanOrEqual(15 * 60_000);
  });
});
```

## apps/sdwan-portal/api/src/jobs/Scheduler.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/jobs/Scheduler.ts`.

```typescript
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
```

## apps/sdwan-portal/api/src/jobs/tasks.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/jobs/tasks.ts`.

```typescript
import type { Edge } from '../domain/types';
import type { Logger } from '../logging/logger';
import type { TenantDirectory } from '../repositories';
import type { MetricsStore } from '../repositories/MetricsStore';
import type { AlertService } from '../services/AlertService';
import type { ChangeRequestService } from '../services/ChangeRequestService';
import type { InventoryService } from '../services/InventoryService';

/** First poll for an edge looks back this far; later polls continue from the newest stored sample. */
const INITIAL_LOOKBACK_MS = 60 * 60_000;

/** Bounds concurrent controller calls so a large account does not burst the VCO/FortiManager API. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]);
  });
  await Promise.all(workers);
}

export interface PollResult {
  edges: number;
  samples: number;
  failures: number;
}

export async function pollMetrics(
  deps: { tenants: TenantDirectory; inventory: InventoryService; metrics: MetricsStore; logger: Logger },
  now: () => Date = () => new Date(),
  concurrency = 4,
): Promise<PollResult> {
  const result: PollResult = { edges: 0, samples: 0, failures: 0 };
  for (const accountId of deps.tenants.accounts()) {
    let edges: Edge[];
    try {
      edges = await deps.inventory.listEdges(accountId);
    } catch (err) {
      deps.logger.warn('metrics poll: inventory unavailable', { accountId, err });
      result.failures++;
      continue;
    }
    const to = now().toISOString();
    await mapLimit(edges.filter((e) => e.status !== 'DOWN'), concurrency, async (edge) => {
      const last = deps.metrics.lastTimestampForEdge(edge.id);
      const from = last ?? new Date(Date.parse(to) - INITIAL_LOOKBACK_MS).toISOString();
      try {
        const { provider, ctx } = await deps.inventory.resolveEdge(accountId, edge.id);
        result.samples += deps.metrics.append(await provider.getLinkMetrics(ctx, edge.vendorRef.id, { from, to }));
        result.edges++;
      } catch (err) {
        result.failures++;
        deps.logger.warn('metrics poll failed for edge', { accountId, edgeId: edge.id, err });
      }
    });
  }
  deps.logger.info('metrics poll complete', { ...result });
  return result;
}

export async function evaluateAlerts(deps: { tenants: TenantDirectory; alerts: AlertService; logger: Logger }): Promise<void> {
  for (const accountId of deps.tenants.accounts()) {
    try {
      await deps.alerts.evaluateAccount(accountId);
    } catch (err) {
      deps.logger.warn('alert evaluation failed', { accountId, err });
    }
  }
}

export async function executeDueChanges(deps: { changes: ChangeRequestService; logger: Logger }): Promise<void> {
  const done = await deps.changes.executeDue();
  if (done.length) deps.logger.info('change executor run', { executed: done.map((c) => ({ id: c.id, status: c.status })) });
}
```

## apps/sdwan-portal/api/src/logging/logger.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/logging/logger.ts`.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface RequestContext {
  correlationId: string;
  userId?: string;
  accountId?: string;
}

/** Carries the correlation ID through async call chains without threading it through every signature. */
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|apikey|api_key|session/i;

/** Recursively masks values whose keys look like credentials. Vendor payloads routinely echo them back. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

type Sink = (line: string) => void;

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: Sink = (line) => process.stdout.write(line + '\n'),
): Logger {
  const threshold = LEVEL_ORDER[level];

  const emit = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const ctx = requestContext.getStore();
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: lvl,
      msg,
      service: 'sdwan-portal-api',
      ...bindings,
      ...(ctx ? { correlationId: ctx.correlationId, userId: ctx.userId, accountId: ctx.accountId } : {}),
    };
    if (fields) {
      for (const [k, v] of Object.entries(fields)) {
        record[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : redact(v);
      }
    }
    sink(JSON.stringify(record));
  };

  return {
    debug: (m, f) => emit('debug', m, f),
    info: (m, f) => emit('info', m, f),
    warn: (m, f) => emit('warn', m, f),
    error: (m, f) => emit('error', m, f),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink),
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};
```

## apps/sdwan-portal/api/src/providers/ProviderRegistry.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/ProviderRegistry.ts`.

```typescript
import type { AppConfig } from '../config/env';
import type { Vendor } from '../domain/types';
import type { Logger } from '../logging/logger';
import { FortinetAdapter } from './fortinet/FortinetAdapter';
import { FortiManagerClient } from './fortinet/FortiManagerClient';
import { MockProvider } from './mock/MockProvider';
import type { SdwanProvider } from './SdwanProvider';
import { VeloCloudAdapter } from './velocloud/VeloCloudAdapter';
import { VeloCloudClient } from './velocloud/VeloCloudClient';

/** Resolves the adapter for a vendor. Services never construct adapters directly. */
export class ProviderRegistry {
  constructor(private readonly providers: Map<Vendor, SdwanProvider>) {}

  get(vendor: Vendor): SdwanProvider {
    const p = this.providers.get(vendor);
    if (!p) throw new Error(`no SD-WAN provider registered for ${vendor}`);
    return p;
  }

  all(): SdwanProvider[] {
    return [...this.providers.values()];
  }

  async health(): Promise<Record<Vendor, boolean>> {
    const entries = await Promise.all(this.all().map(async (p) => [p.vendor, await p.ping()] as const));
    return Object.fromEntries(entries) as Record<Vendor, boolean>;
  }

  static fromConfig(cfg: AppConfig, logger: Logger): ProviderRegistry {
    if (cfg.SDWAN_PROVIDER_MODE === 'mock') {
      return new ProviderRegistry(
        new Map<Vendor, SdwanProvider>([
          ['VELOCLOUD', new MockProvider('VELOCLOUD')],
          ['FORTINET', new MockProvider('FORTINET')],
        ]),
      );
    }
    const http = {
      maxRetries: cfg.HTTP_MAX_RETRIES,
      backoffBaseMs: cfg.HTTP_BACKOFF_BASE_MS,
      backoffMaxMs: cfg.HTTP_BACKOFF_MAX_MS,
    };
    const vco = new VeloCloudClient(
      { ...http, baseUrl: cfg.VCO_BASE_URL!, timeoutMs: cfg.VCO_TIMEOUT_MS, logger: logger.child({ vendor: 'VELOCLOUD' }) },
      { username: cfg.VCO_USERNAME!, password: cfg.VCO_PASSWORD!, loginType: 'operator' },
    );
    const fmg = new FortiManagerClient(
      { ...http, baseUrl: cfg.FMG_BASE_URL!, timeoutMs: cfg.FORTI_TIMEOUT_MS, logger: logger.child({ vendor: 'FORTINET' }) },
      { username: cfg.FMG_USERNAME!, password: cfg.FMG_PASSWORD! },
    );
    return new ProviderRegistry(
      new Map<Vendor, SdwanProvider>([
        ['VELOCLOUD', new VeloCloudAdapter(vco, logger)],
        ['FORTINET', new FortinetAdapter(fmg, logger, { policyPackage: cfg.FMG_POLICY_PACKAGE })],
      ]),
    );
  }
}
```

## apps/sdwan-portal/api/src/providers/SdwanProvider.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/SdwanProvider.ts`.

```typescript
import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent, Vendor } from '../domain/types';

/**
 * Identifies which tenant inside the vendor controller a call targets and which portal
 * account it belongs to. Built by the service layer from the site/edge record.
 */
export interface ProviderContext {
  accountId: string;
  /** VeloCloud enterpriseId or FortiManager ADOM name. */
  tenant: string;
  correlationId?: string;
}

/** A site as discovered from the controller, before it is linked to a portal record. */
export interface DiscoveredSite {
  vendorId: string;
  name: string;
  address?: { line1: string; city: string; postcode: string; country: string };
  edgeVendorIds: string[];
}

export interface ConfigSnapshot {
  /** Vendor-native configuration document (VCO configuration stack / FortiOS JSON config). */
  content: Record<string, unknown>;
  /** Firmware / config schema version the snapshot came from; restores check compatibility. */
  vendorVersion: string;
}

export interface ApplyResult {
  /** Vendor task / install id, if the controller applies asynchronously. */
  taskId?: string;
  applied: number;
  warnings: string[];
}

export interface TimeRange {
  from: string;
  to: string;
}

/**
 * Contract implemented by every vendor adapter. All methods accept and return the
 * vendor-neutral model; adapters own every bit of vendor-specific mapping, session
 * handling and error translation (to ProblemError subclasses).
 */
export interface SdwanProvider {
  readonly vendor: Vendor;

  listSites(ctx: ProviderContext): Promise<DiscoveredSite[]>;
  listEdges(ctx: ProviderContext): Promise<Edge[]>;
  getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge>;

  getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]>;

  listBusinessPolicies(ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]>;
  applyBusinessPolicies(ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult>;

  listFirewallRules(ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]>;
  applyFirewallRules(ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult>;

  exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot>;
  restoreConfig(ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult>;

  rebootEdge(ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult>;
  upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult>;

  listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]>;

  /** Cheap connectivity/auth probe used by /readyz. */
  ping(): Promise<boolean>;
}
```

## apps/sdwan-portal/api/src/providers/applicationCatalog.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/applicationCatalog.ts`.

```typescript
/**
 * Neutral application names exposed to customers, with the identifiers each vendor's
 * DPI engine uses. Only applications offered in the managed SD-WAN product catalogue
 * are listed; the UI only allows selecting from this list.
 */
export interface ApplicationDef {
  key: string;
  label: string;
  category: 'COLLABORATION' | 'SAAS' | 'VOICE' | 'STREAMING' | 'BACKUP' | 'UPDATES';
  velocloudAppId: number;
  fortinetAppId: number;
}

export const APPLICATIONS: ApplicationDef[] = [
  { key: 'ms-teams', label: 'Microsoft Teams', category: 'COLLABORATION', velocloudAppId: 2069, fortinetAppId: 43541 },
  { key: 'zoom', label: 'Zoom', category: 'COLLABORATION', velocloudAppId: 1904, fortinetAppId: 38446 },
  { key: 'webex', label: 'Cisco Webex', category: 'COLLABORATION', velocloudAppId: 351, fortinetAppId: 16166 },
  { key: 'office365', label: 'Microsoft 365', category: 'SAAS', velocloudAppId: 1713, fortinetAppId: 33182 },
  { key: 'salesforce', label: 'Salesforce', category: 'SAAS', velocloudAppId: 300, fortinetAppId: 16920 },
  { key: 'google-workspace', label: 'Google Workspace', category: 'SAAS', velocloudAppId: 1471, fortinetAppId: 34050 },
  { key: 'sip', label: 'SIP Voice', category: 'VOICE', velocloudAppId: 58, fortinetAppId: 15520 },
  { key: 'youtube', label: 'YouTube', category: 'STREAMING', velocloudAppId: 467, fortinetAppId: 31077 },
  { key: 'netflix', label: 'Netflix', category: 'STREAMING', velocloudAppId: 1027, fortinetAppId: 18155 },
  { key: 'veeam', label: 'Veeam Backup', category: 'BACKUP', velocloudAppId: 2210, fortinetAppId: 40166 },
  { key: 'windows-update', label: 'Windows Update', category: 'UPDATES', velocloudAppId: 418, fortinetAppId: 16190 },
];

const byKey = new Map(APPLICATIONS.map((a) => [a.key, a]));
const byVelo = new Map(APPLICATIONS.map((a) => [a.velocloudAppId, a]));
const byForti = new Map(APPLICATIONS.map((a) => [a.fortinetAppId, a]));

export function applicationByKey(key: string): ApplicationDef | undefined {
  return byKey.get(key.toLowerCase());
}

export function applicationByVelocloudId(id: number): ApplicationDef | undefined {
  return byVelo.get(id);
}

export function applicationByFortinetId(id: number): ApplicationDef | undefined {
  return byForti.get(id);
}

export function unknownApplications(keys: string[]): string[] {
  return keys.filter((k) => !byKey.has(k.toLowerCase()));
}
```

## apps/sdwan-portal/api/src/providers/fortinet/FortiManagerClient.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/fortinet/FortiManagerClient.test.ts`.

```typescript
import { silentLogger } from '../../logging/logger';
import { fakeFetch, FakeReply, noSleep } from '../../testing/fakeFetch';
import { FortiManagerClient } from './FortiManagerClient';

const ok = (data: unknown, url = '/x'): FakeReply => ({ body: { id: 1, result: [{ status: { code: 0, message: 'OK' }, url, data }] } });
const status = (code: number, message: string): FakeReply => ({ body: { id: 1, result: [{ status: { code, message }, url: '/x' }] } });
const login = (session: string): FakeReply => ({ body: { id: 1, session, result: [{ status: { code: 0, message: 'OK' }, url: '/sys/login/user' }] } });

function client(replies: FakeReply[]) {
  const fake = fakeFetch(replies);
  const fmg = new FortiManagerClient(
    { baseUrl: 'https://fmg.test', timeoutMs: 1000, maxRetries: 1, backoffBaseMs: 1, backoffMaxMs: 1, logger: silentLogger, fetchImpl: fake.fetch, sleepImpl: noSleep },
    { username: 'api', password: 'pw' },
  );
  return { fmg, calls: fake.calls };
}

describe('FortiManagerClient', () => {
  it('passes the session token in the JSON-RPC body and returns result data', async () => {
    const { fmg, calls } = client([login('s-1'), ok([{ name: 'fgt-leeds' }])]);
    await expect(fmg.rpc('get', '/dvmdb/adom/acme/device')).resolves.toEqual([{ name: 'fgt-leeds' }]);
    expect(calls[1].body).toMatchObject({ method: 'get', session: 's-1', params: [{ url: '/dvmdb/adom/acme/device' }] });
  });

  it('logs in again and replays the call on an invalid session code', async () => {
    const { fmg, calls } = client([login('s-1'), status(-11, 'No permission for the resource'), login('s-2'), ok({ done: true })]);
    await expect(fmg.rpc('get', '/task/task/1')).resolves.toEqual({ done: true });
    expect((calls[3].body as { session: string }).session).toBe('s-2');
  });

  it('turns a non-zero status into an upstream problem', async () => {
    const { fmg } = client([login('s-1'), status(-3, 'Object does not exist')]);
    await expect(fmg.rpc('get', '/pm/config/adom/acme/obj/firewall/address/x')).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('Object does not exist'),
    });
  });

  it('distinguishes an unreachable device from a device that rejected the request', async () => {
    const unreachable = client([login('s'), ok([{ status: { code: -1, message: 'timeout' }, target: 'fgt' }])]);
    await expect(unreachable.fmg.proxy('acme', 'fgt', 'get', '/api/v2/monitor/system/status')).rejects.toMatchObject({
      extensions: expect.objectContaining({ retryable: true }),
    });

    const rejected = client([login('s'), ok([{ status: { code: 0, message: 'OK' }, target: 'fgt', response: { status: 'error', http_status: 424 } }])]);
    await expect(rejected.fmg.proxy('acme', 'fgt', 'put', '/api/v2/cmdb/firewall/policy/1', {})).rejects.toMatchObject({
      extensions: expect.objectContaining({ retryable: false, upstreamStatus: 424 }),
    });
  });

  it('reports task failures with per-device detail', async () => {
    const { fmg } = client([
      login('s'),
      ok({ percent: 40, num_err: 0, state: 1 }),
      ok({ percent: 100, num_err: 1, state: 4 }),
      ok([{ name: 'fgt-york', detail: 'install failed: policy conflict' }]),
    ]);
    await expect(fmg.waitForTask(9, { timeoutMs: 10_000, pollMs: 1, sleep: noSleep })).rejects.toThrow(/fgt-york: install failed/);
  });
});
```

## apps/sdwan-portal/api/src/providers/fortinet/FortiManagerClient.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/fortinet/FortiManagerClient.ts`.

```typescript
import { HttpClient, HttpClientOptions } from '../http/HttpClient';
import { UpstreamProblem } from '../../errors/problem';
import type { FgtProxyResponse, FmgResponse } from './fortinetTypes';

export interface FortiManagerCredentials {
  username: string;
  password: string;
}

type RpcMethod = 'get' | 'set' | 'add' | 'update' | 'delete' | 'exec' | 'replace';

/** FortiManager status codes that mean the session token is no longer valid. */
const SESSION_INVALID_CODES = new Set([-11, -20]);

/**
 * FortiManager JSON-RPC client. Login returns a session token that is passed in every
 * request body. Sessions expire after idle timeout; on a session-invalid code the
 * client logs in again once and replays the request. FortiGate REST endpoints are
 * reached through FortiManager's /sys/proxy/json, so devices never need to be directly
 * reachable from the portal.
 */
export class FortiManagerClient {
  private session: string | null = null;
  private loginInFlight: Promise<string> | null = null;
  private nextId = 1;
  private readonly http: HttpClient;

  constructor(
    httpOptions: Omit<HttpClientOptions, 'vendor'>,
    private readonly credentials: FortiManagerCredentials,
  ) {
    this.http = new HttpClient({ ...httpOptions, vendor: 'FORTINET' });
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  async login(): Promise<string> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = (async () => {
      const res = await this.http.request<FmgResponse<unknown>>({
        method: 'POST',
        path: '/jsonrpc',
        idempotent: true,
        body: {
          id: this.nextId++,
          method: 'exec',
          params: [{ url: '/sys/login/user', data: { user: this.credentials.username, passwd: this.credentials.password } }],
        },
      });
      const status = res.data?.result?.[0]?.status;
      if (!status || status.code !== 0 || !res.data.session) {
        throw new UpstreamProblem('FORTINET', `FortiManager login failed: ${status?.message ?? 'no session returned'}`);
      }
      this.session = res.data.session;
      return this.session;
    })();
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      await this.rawRpc('exec', '/sys/logout', undefined);
    } finally {
      this.session = null;
    }
  }

  /** Performs one JSON-RPC call and returns `result[0].data`, throwing on a non-zero status. */
  async rpc<T>(method: RpcMethod, url: string, data?: unknown, extraParams: Record<string, unknown> = {}): Promise<T> {
    if (!this.session) await this.login();
    let res = await this.rawRpc<T>(method, url, data, extraParams);
    let status = res.result?.[0]?.status;
    if (status && SESSION_INVALID_CODES.has(status.code)) {
      this.session = null;
      await this.login();
      res = await this.rawRpc<T>(method, url, data, extraParams);
      status = res.result?.[0]?.status;
    }
    if (!status) throw new UpstreamProblem('FORTINET', `${method} ${url}: malformed JSON-RPC response`);
    if (status.code !== 0) {
      throw new UpstreamProblem('FORTINET', `${method} ${url} failed (${status.code}): ${status.message}`, false);
    }
    return res.result[0].data as T;
  }

  private async rawRpc<T>(method: RpcMethod, url: string, data: unknown, extraParams: Record<string, unknown> = {}): Promise<FmgResponse<T>> {
    const res = await this.http.request<FmgResponse<T>>({
      method: 'POST',
      path: '/jsonrpc',
      idempotent: method === 'get',
      body: {
        id: this.nextId++,
        method,
        params: [{ url, ...(data !== undefined ? { data } : {}), ...extraParams }],
        session: this.session,
      },
    });
    return res.data;
  }

  /**
   * Calls a FortiOS REST resource on a managed device through FortiManager. Returns the
   * device's `results` payload, or throws if FortiManager or the device reported an error.
   */
  async proxy<T>(adom: string, device: string, action: 'get' | 'post' | 'put', resource: string, payload?: unknown): Promise<T> {
    const target = `adom/${adom}/device/${device}`;
    const data = await this.rpc<Array<FgtProxyResponse<T>>>('exec', '/sys/proxy/json', {
      target: [target],
      action,
      resource,
      ...(payload !== undefined ? { payload } : {}),
    });
    const entry = data?.[0];
    if (!entry) throw new UpstreamProblem('FORTINET', `proxy ${resource} on ${device}: empty response`);
    if (entry.status.code !== 0) {
      throw new UpstreamProblem('FORTINET', `device ${device} unreachable via FortiManager: ${entry.status.message}`, true);
    }
    if (!entry.response || entry.response.status !== 'success') {
      throw new UpstreamProblem(
        'FORTINET',
        `device ${device} rejected ${action.toUpperCase()} ${resource} (HTTP ${entry.response?.http_status ?? '?'})`,
        false,
        entry.response?.http_status,
      );
    }
    return entry.response.results;
  }

  /**
   * Waits for a FortiManager task (install, upgrade) to finish. FortiManager reports
   * percent complete and a state; num_err > 0 means at least one device failed.
   */
  async waitForTask(taskId: number, opts: { timeoutMs: number; pollMs: number; sleep: (ms: number) => Promise<void> }): Promise<void> {
    const deadline = Date.now() + opts.timeoutMs;
    for (;;) {
      const task = await this.rpc<{ percent: number; num_err: number; state: number; title?: string }>('get', `/task/task/${taskId}`);
      if (task.percent >= 100) {
        if (task.num_err > 0) {
          const lines = await this.rpc<Array<{ name: string; detail: string }>>('get', `/task/task/${taskId}/line`).catch(() => []);
          const detail = lines.map((l) => `${l.name}: ${l.detail}`).join('; ');
          throw new UpstreamProblem('FORTINET', `FortiManager task ${taskId} finished with errors${detail ? `: ${detail}` : ''}`);
        }
        return;
      }
      if (Date.now() > deadline) throw new UpstreamProblem('FORTINET', `FortiManager task ${taskId} did not finish in time`, true);
      await opts.sleep(opts.pollMs);
    }
  }
}
```

## apps/sdwan-portal/api/src/providers/fortinet/FortinetAdapter.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/providers/fortinet/FortinetAdapter.ts`.

```typescript
import type { BusinessPolicy, Edge, FirewallRule, LinkSample, SdwanEvent } from '../../domain/types';
import { NotFoundProblem, UpstreamProblem } from '../../errors/problem';
import type { Logger } from '../../logging/logger';
import { sleep } from '../http/backoff';
import type { ApplyResult, ConfigSnapshot, DiscoveredSite, ProviderContext, SdwanProvider, TimeRange } from '../SdwanProvider';
import { FortiManagerClient } from './FortiManagerClient';
import {
  firewallFromForti,
  firewallToForti,
  mapDevice,
  mapEventLog,
  mapLinks,
  MemberInfo,
  OBJ_PREFIX,
  parseInterfaceDescription,
  policiesFromForti,
  policiesToForti,
  samplesFromMonitor,
} from './fortinetMappers';
import type {
  FgtAddress,
  FgtEventLog,
  FgtFirewallPolicy,
  FgtHealthCheck,
  FgtHealthCheckMonitor,
  FgtInterface,
  FgtSdwanMember,
  FgtSdwanService,
  FgtService,
  FmgDevice,
  FmgDeviceGroup,
} from './fortinetTypes';

export interface FortinetAdapterOptions {
  policyPackage: string;
  installTimeoutMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
}

const DEVICE_FIELDS = ['name', 'sn', 'platform_str', 'os_ver', 'mr', 'patch', 'build', 'conn_status', 'ha_mode', 'ha_slave', 'last_checked', 'desc', 'meta fields'];

export class FortinetAdapter implements SdwanProvider {
  readonly vendor = 'FORTINET' as const;
  private readonly sleepImpl: (ms: number) => Promise<void>;

  constructor(
    private readonly fmg: FortiManagerClient,
    private readonly logger: Logger,
    private readonly opts: FortinetAdapterOptions,
  ) {
    this.sleepImpl = opts.sleepImpl ?? sleep;
  }

  private devPath(device: string): string {
    return `/pm/config/device/${encodeURIComponent(device)}/vdom/root`;
  }

  private async devices(adom: string): Promise<FmgDevice[]> {
    return (await this.fmg.rpc<FmgDevice[]>('get', `/dvmdb/adom/${adom}/device`, undefined, { fields: DEVICE_FIELDS })) ?? [];
  }

  private async groups(adom: string): Promise<FmgDeviceGroup[]> {
    return (await this.fmg.rpc<FmgDeviceGroup[]>('get', `/dvmdb/adom/${adom}/group`)) ?? [];
  }

  /** Maps device name → owning site (device group). Devices outside any group become their own site. */
  private siteIndex(adom: string, groups: FmgDeviceGroup[]): Map<string, string> {
    const idx = new Map<string, string>();
    for (const g of groups) {
      if (g.name.startsWith('All_')) continue; // FortiManager built-in groups
      for (const m of g['object member'] ?? []) idx.set(m.name, `ft-site-${adom}-${g.name}`);
    }
    return idx;
  }

  async listSites(ctx: ProviderContext): Promise<DiscoveredSite[]> {
    const [devices, groups] = await Promise.all([this.devices(ctx.tenant), this.groups(ctx.tenant)]);
    const known = new Set(devices.map((d) => d.name));
    const sites: DiscoveredSite[] = [];
    const grouped = new Set<string>();
    for (const g of groups.filter((x) => !x.name.startsWith('All_'))) {
      const members = (g['object member'] ?? []).map((m) => m.name).filter((n) => known.has(n));
      if (members.length === 0) continue;
      members.forEach((m) => grouped.add(m));
      const meta = devices.find((d) => d.name === members[0])?.['meta fields'] ?? {};
      sites.push({
        vendorId: g.name,
        name: g.desc || g.name,
        address: meta.Address ? { line1: meta.Address, city: meta.City ?? '', postcode: meta.Postcode ?? '', country: meta.Country ?? 'GB' } : undefined,
        edgeVendorIds: members,
      });
    }
    for (const d of devices.filter((x) => !grouped.has(x.name))) {
      sites.push({ vendorId: d.name, name: d.desc || d.name, edgeVendorIds: [d.name] });
    }
    return sites;
  }

  private async sdwanMembers(device: string): Promise<FgtSdwanMember[]> {
    return (await this.fmg.rpc<FgtSdwanMember[]>('get', `${this.devPath(device)}/system/sdwan/members`)) ?? [];
  }

  private async wanInterfaces(device: string): Promise<FgtInterface[]> {
    const all = (await this.fmg.rpc<FgtInterface[]>('get', `/pm/config/device/${encodeURIComponent(device)}/global/system/interface`)) ?? [];
    return all.filter((i) => i.role === 'wan');
  }

  private async healthMonitor(adom: string, device: string): Promise<FgtHealthCheckMonitor | undefined> {
    try {
      return await this.fmg.proxy<FgtHealthCheckMonitor>(adom, device, 'get', '/api/v2/monitor/virtual-wan/health-check');
    } catch (err) {
      // An offline device cannot be proxied; inventory should still render with UNKNOWN links.
      this.logger.debug('health-check monitor unavailable', { device, err });
      return undefined;
    }
  }

  private async buildEdge(ctx: ProviderContext, d: FmgDevice, siteId: string): Promise<Edge> {
    const online = d.conn_status === 1;
    const [members, interfaces, monitor] = await Promise.all([
      this.sdwanMembers(d.name),
      this.wanInterfaces(d.name),
      online ? this.healthMonitor(ctx.tenant, d.name) : Promise.resolve(undefined),
    ]);
    const edgeId = `ft-${ctx.tenant}-${d.name}`;
    return mapDevice(ctx.tenant, ctx.accountId, siteId, d, mapLinks(edgeId, members, interfaces, monitor));
  }

  async listEdges(ctx: ProviderContext): Promise<Edge[]> {
    const [devices, groups] = await Promise.all([this.devices(ctx.tenant), this.groups(ctx.tenant)]);
    const idx = this.siteIndex(ctx.tenant, groups);
    return Promise.all(devices.map((d) => this.buildEdge(ctx, d, idx.get(d.name) ?? `ft-site-${ctx.tenant}-${d.name}`)));
  }

  async getEdge(ctx: ProviderContext, edgeVendorId: string): Promise<Edge> {
    const [devices, groups] = await Promise.all([this.devices(ctx.tenant), this.groups(ctx.tenant)]);
    const device = devices.find((d) => d.name === edgeVendorId);
    if (!device) throw new NotFoundProblem('Edge', edgeVendorId);
    const idx = this.siteIndex(ctx.tenant, groups);
    return this.buildEdge(ctx, device, idx.get(device.name) ?? `ft-site-${ctx.tenant}-${device.name}`);
  }

  /**
   * Returns the current health-check reading as a single sample per link. Historical
   * ranges are served from the portal's own metrics store, which the poller fills.
   */
  async getLinkMetrics(ctx: ProviderContext, edgeVendorId: string, range: TimeRange): Promise<LinkSample[]> {
    const now = new Date().toISOString();
    if (now < range.from || now > range.to) return [];
    const monitor = await this.healthMonitor(ctx.tenant, edgeVendorId);
    if (!monitor) return [];
    return samplesFromMonitor(`ft-${ctx.tenant}-${edgeVendorId}`, monitor, now);
  }

  private async memberInfo(device: string): Promise<MemberInfo[]> {
    const [members, interfaces] = await Promise.all([this.sdwanMembers(device), this.wanInterfaces(device)]);
    const ifMap = new Map(interfaces.map((i) => [i.name, i]));
    return members
      .filter((m) => m.status === 'enable')
      .map((m) => ({ seq: m['seq-num'], transport: parseInterfaceDescription(ifMap.get(m.interface)?.description).transport }));
  }

  private async adomAddresses(adom: string): Promise<FgtAddress[]> {
    return (await this.fmg.rpc<FgtAddress[]>('get', `/pm/config/adom/${adom}/obj/firewall/address`)) ?? [];
  }

  async listBusinessPolicies(ctx: ProviderContext, edgeVendorId: string): Promise<BusinessPolicy[]> {
    const base = this.devPath(edgeVendorId);
    const [services, healthChecks, addresses, members] = await Promise.all([
      this.fmg.rpc<FgtSdwanService[]>('get', `${base}/system/sdwan/service`),
      this.fmg.rpc<FgtHealthCheck[]>('get', `${base}/system/sdwan/health-check`),
      this.adomAddresses(ctx.tenant),
      this.memberInfo(edgeVendorId),
    ]);
    return policiesFromForti(services ?? [], healthChecks ?? [], addresses, members);
  }

  /**
   * Writes address objects, health checks and SD-WAN rules to the device database in
   * FortiManager, then installs the device settings. Address objects are upserted
   * ("set") so re-applying the same policy set is idempotent.
   */
  async applyBusinessPolicies(ctx: ProviderContext, edgeVendorId: string, policies: BusinessPolicy[]): Promise<ApplyResult> {
    const base = this.devPath(edgeVendorId);
    const members = await this.memberInfo(edgeVendorId);
    if (members.length === 0) throw new UpstreamProblem('FORTINET', `device ${edgeVendorId} has no enabled SD-WAN members`);
    const bundle = policiesToForti(policies, members);

    if (bundle.addresses.length) await this.fmg.rpc('set', `/pm/config/adom/${ctx.tenant}/obj/firewall/address`, bundle.addresses);
    const existingHc = (await this.fmg.rpc<FgtHealthCheck[]>('get', `${base}/system/sdwan/health-check`)) ?? [];
    const managedHc = existingHc.filter((h) => h.name.startsWith(OBJ_PREFIX) && !bundle.healthChecks.some((n) => n.name === h.name));
    await this.fmg.rpc('set', `${base}/system/sdwan/health-check`, bundle.healthChecks);
    // Rules must be replaced before stale health checks are deleted (they may still be referenced).
    await this.fmg.rpc('replace', `${base}/system/sdwan/service`, bundle.services);
    for (const hc of managedHc) {
      await this.fmg.rpc('delete', `${base}/system/sdwan/health-check/${encodeURIComponent(hc.name)}`);
    }
    const taskId = await this.installDevice(ctx.tenant, edgeVendorId);
    return {
      taskId: String(taskId),
      applied: bundle.services.length,
      warnings: bundle.services.length > policies.length ? [`${policies.length} policies expanded into ${bundle.services.length} SD-WAN rules`] : [],
    };
  }

  private pkgPath(adom: string): string {
    return `/pm/config/adom/${adom}/pkg/${encodeURIComponent(this.opts.policyPackage)}/firewall/policy`;
  }

  async listFirewallRules(ctx: ProviderContext, edgeVendorId: string): Promise<FirewallRule[]> {
    const [policies, addresses, services] = await Promise.all([
      this.fmg.rpc<FgtFirewallPolicy[]>('get', this.pkgPath(ctx.tenant), undefined, {
        filter: ['scope member', 'contain', { name: edgeVendorId, vdom: 'root' }],
      }),
      this.adomAddresses(ctx.tenant),
      this.fmg.rpc<FgtService[]>('get', `/pm/config/adom/${ctx.tenant}/obj/firewall/service/custom`),
    ]);
    const managed = (policies ?? []).filter((p) => p.comments?.startsWith('uniti:') || p.policyid >= 1000);
    return firewallFromForti(managed, addresses, services ?? []);
  }

  async applyFirewallRules(ctx: ProviderContext, edgeVendorId: string, rules: FirewallRule[]): Promise<ApplyResult> {
    const bundle = firewallToForti(rules);
    if (bundle.addresses.length) await this.fmg.rpc('set', `/pm/config/adom/${ctx.tenant}/obj/firewall/address`, bundle.addresses);
    if (bundle.services.length) await this.fmg.rpc('set', `/pm/config/adom/${ctx.tenant}/obj/firewall/service/custom`, bundle.services);

    const existing = (await this.fmg.rpc<FgtFirewallPolicy[]>('get', this.pkgPath(ctx.tenant))) ?? [];
    for (const p of existing.filter((x) => x.policyid >= 1000)) {
      await this.fmg.rpc('delete', `${this.pkgPath(ctx.tenant)}/${p.policyid}`);
    }
    if (bundle.policies.length) await this.fmg.rpc('add', this.pkgPath(ctx.tenant), bundle.policies);
    const taskId = await this.installPackage(ctx.tenant, edgeVendorId);
    return { taskId: String(taskId), applied: bundle.policies.length, warnings: [] };
  }

  private async installPackage(adom: string, device: string): Promise<number> {
    const res = await this.fmg.rpc<{ task: number }>('exec', '/securityconsole/install/package', {
      adom,
      pkg: this.opts.policyPackage,
      scope: [{ name: device, vdom: 'root' }],
      flags: ['none'],
    });
    await this.fmg.waitForTask(res.task, { timeoutMs: this.opts.installTimeoutMs ?? 300_000, pollMs: 3000, sleep: this.sleepImpl });
    return res.task;
  }

  private async installDevice(adom: string, device: string): Promise<number> {
    const res = await this.fmg.rpc<{ task: number }>('exec', '/securityconsole/install/device', {
      adom,
      scope: [{ name: device, vdom: 'root' }],
      flags: ['none'],
    });
    await this.fmg.waitForTask(res.task, { timeoutMs: this.opts.installTimeoutMs ?? 300_000, pollMs: 3000, sleep: this.sleepImpl });
    return res.task;
  }

  async exportConfig(ctx: ProviderContext, edgeVendorId: string): Promise<ConfigSnapshot> {
    const edge = await this.getEdge(ctx, edgeVendorId);
    const text = await this.fmg.proxy<string>(ctx.tenant, edgeVendorId, 'get', '/api/v2/monitor/system/config/backup?scope=global');
    if (typeof text !== 'string' || !text.includes('config system global')) {
      throw new UpstreamProblem('FORTINET', `backup of ${edgeVendorId} did not return a FortiOS configuration`);
    }
    return {
      content: { format: 'fortios-cli', lines: text.split('\n').length, text },
      vendorVersion: edge.softwareVersion,
    };
  }

  async restoreConfig(ctx: ProviderContext, edgeVendorId: string, snapshot: ConfigSnapshot): Promise<ApplyResult> {
    if (snapshot.content.format !== 'fortios-cli' || typeof snapshot.content.text !== 'string') {
      throw new UpstreamProblem('FORTINET', 'snapshot is not a FortiOS configuration backup');
    }
    const edge = await this.getEdge(ctx, edgeVendorId);
    const [major, minor] = edge.softwareVersion.split('.');
    const [sMajor, sMinor] = snapshot.vendorVersion.split('.');
    if (major !== sMajor || minor !== sMinor) {
      throw new UpstreamProblem(
        'FORTINET',
        `backup was taken on FortiOS ${snapshot.vendorVersion}; device runs ${edge.softwareVersion}. Cross-version restore is not supported`,
      );
    }
    await this.fmg.proxy(ctx.tenant, edgeVendorId, 'post', '/api/v2/monitor/system/config/restore', {
      source: 'upload',
      scope: 'global',
      file_content: Buffer.from(snapshot.content.text).toString('base64'),
    });
    // The device reboots after restore; FortiManager must re-sync its device database.
    await this.fmg.rpc('exec', '/dvm/cmd/reload/dev-list', { adom: ctx.tenant, 'reload-dev-member-list': [{ name: edgeVendorId, vdom: 'root' }] });
    return { applied: 1, warnings: ['device reboots to apply the restored configuration'] };
  }

  async rebootEdge(ctx: ProviderContext, edgeVendorId: string): Promise<ApplyResult> {
    await this.fmg.proxy(ctx.tenant, edgeVendorId, 'post', '/api/v2/monitor/system/os/reboot', { event_log_message: 'Reboot requested via Uniti self-care' });
    return { applied: 1, warnings: [] };
  }

  async upgradeEdge(ctx: ProviderContext, edgeVendorId: string, targetVersion: string): Promise<ApplyResult> {
    const [major, minor, patch] = targetVersion.split('.').map(Number);
    if ([major, minor, patch].some((n) => !Number.isInteger(n))) {
      throw new UpstreamProblem('FORTINET', `invalid FortiOS version "${targetVersion}"`);
    }
    const res = await this.fmg.rpc<{ taskid: number }>('exec', '/um/image/upgrade', {
      adom: ctx.tenant,
      device: [{ name: edgeVendorId }],
      image: { release: `${major}.${minor}.${patch}` },
      flags: 'f_boot_alt_partition',
    });
    return { applied: 1, taskId: String(res.taskid), warnings: [] };
  }

  async listEvents(ctx: ProviderContext, range: TimeRange): Promise<SdwanEvent[]> {
    const devices = (await this.devices(ctx.tenant)).filter((d) => d.conn_status === 1);
    const from = Date.parse(range.from);
    const to = Date.parse(range.to);
    const perDevice = await Promise.all(
      devices.map(async (d) => {
        try {
          const logs = await this.fmg.proxy<FgtEventLog[]>(ctx.tenant, d.name, 'get', '/api/v2/log/memory/event/system?rows=500');
          return (logs ?? []).map((l) => mapEventLog(ctx.tenant, ctx.accountId, d.name, l));
        } catch (err) {
          this.logger.warn('event fetch failed for device', { device: d.name, err });
          return [];
        }
      }),
    );
    return perDevice
      .flat()
      .filter((e) => {
        const t = Date.parse(e.occurredAt);
        return t >= from && t <= to;
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async ping(): Promise<boolean> {
    try {
      await this.fmg.rpc('get', '/sys/status');
      return true;
    } catch (err) {
      this.logger.warn('fortimanager ping failed', { err });
      return false;
    }
  }
}
```
