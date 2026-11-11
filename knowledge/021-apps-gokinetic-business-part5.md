# Go Kinetic Business self-care (B2B): apps/gokinetic-business (part 5 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 20

## Files

- `apps/gokinetic-business/api/src/modules/tickets/tickets.routes.ts` (128 lines)
- `apps/gokinetic-business/api/src/modules/tickets/tickets.service.test.ts` (212 lines)
- `apps/gokinetic-business/api/src/modules/tickets/tickets.service.ts` (372 lines)
- `apps/gokinetic-business/api/src/modules/tickets/tickets.types.ts` (87 lines)
- `apps/gokinetic-business/api/src/modules/users/users.repository.ts` (160 lines)
- `apps/gokinetic-business/api/src/modules/users/users.routes.ts` (98 lines)
- `apps/gokinetic-business/api/src/modules/users/users.service.test.ts` (169 lines)
- `apps/gokinetic-business/api/src/modules/users/users.service.ts` (229 lines)
- `apps/gokinetic-business/api/src/modules/users/users.types.ts` (33 lines)
- `apps/gokinetic-business/api/src/server.ts` (110 lines)
- `apps/gokinetic-business/api/src/test/fixtures.ts` (113 lines)
- `apps/gokinetic-business/api/src/test/ticket-fixtures.ts` (32 lines)
- `apps/gokinetic-business/api/src/types/express.d.ts` (14 lines)
- `apps/gokinetic-business/api/tsconfig.build.json` (8 lines)
- `apps/gokinetic-business/api/tsconfig.json` (22 lines)
- `apps/gokinetic-business/web/angular.json` (68 lines)
- `apps/gokinetic-business/web/karma.conf.js` (32 lines)
- `apps/gokinetic-business/web/package.json` (43 lines)
- `apps/gokinetic-business/web/proxy.conf.json` (9 lines)
- `apps/gokinetic-business/web/src/app/app.config.ts` (40 lines)

## apps/gokinetic-business/api/src/modules/tickets/tickets.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/tickets.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { TicketsService } from './tickets.service';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from './tickets.types';

const ListQuery = PaginationQuery.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  siteId: z.string().uuid().optional(),
  search: z.string().trim().min(2).max(80).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
});

const CreateBody = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  serviceId: z.string().uuid().nullish(),
  siteId: z.string().uuid().nullish(),
  subject: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(5000),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'contactPhone must be a valid phone number')
    .nullish()
});

const Version = z.number().int().positive();

const CommentBody = z.object({
  body: z.string().trim().min(1).max(5000),
  internal: z.boolean().default(false),
  version: Version
});

const StatusBody = z.object({
  status: z.enum(TICKET_STATUSES),
  reason: z.string().trim().max(1000).optional(),
  version: Version
});

const EscalateBody = z.object({ reason: z.string().trim().min(10).max(1000), version: Version });

const PriorityBody = z.object({
  priority: z.enum(TICKET_PRIORITIES),
  reason: z.string().trim().min(3).max(1000),
  version: Version
});

export function ticketsRoutes(service: TicketsService): Router {
  const router = Router();

  router.get(
    '/tickets',
    requirePermission('tickets:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.post(
    '/tickets',
    requirePermission('tickets:create'),
    validate({ body: CreateBody }),
    asyncHandler(async (req, res) => {
      const ticket = await service.create(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/tickets/${ticket.id}`).json(ticket);
    })
  );

  router.get(
    '/tickets/:id',
    requirePermission('tickets:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/tickets/:id/comments',
    requirePermission('tickets:create'),
    validate({ params: UuidParam, body: CommentBody }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.comment(requireAuth(req), req.params.id, req.body));
    })
  );

  router.post(
    '/tickets/:id/status',
    requirePermission('tickets:read'),
    validate({ params: UuidParam, body: StatusBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.changeStatus(requireAuth(req), req.params.id, req.body));
    })
  );

  router.post(
    '/tickets/:id/escalate',
    requirePermission('tickets:escalate'),
    validate({ params: UuidParam, body: EscalateBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.escalate(requireAuth(req), req.params.id, req.body));
    })
  );

  router.put(
    '/tickets/:id/priority',
    requirePermission('tickets:internal'),
    validate({ params: UuidParam, body: PriorityBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.changePriority(requireAuth(req), req.params.id, req.body));
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/tickets/tickets.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/tickets.service.test.ts`.

```typescript
import { BusinessRuleError, ConflictError, ForbiddenError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors';
import { fixedClock } from '../../lib/dates';
import { ACCOUNT_ID, SITE_B, adminCtx, agentCtx, makeService, passthroughDb, recordingAudit, userCtx } from '../../test/fixtures';
import { makeTicket } from '../../test/ticket-fixtures';
import { AccountsRepository } from '../accounts/accounts.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { TicketsRepository } from './tickets.repository';
import { TicketsService, assertTicketShape, statusTransitionPatch } from './tickets.service';
import { Ticket, TicketEvent } from './tickets.types';

const NOW = '2024-06-03T12:00:00.000Z';

function setup(ticket: Ticket = makeTicket()) {
  let stored = ticket;
  const repo: jest.Mocked<TicketsRepository> = {
    list: jest.fn(),
    find: jest.fn(async () => stored),
    findOpenFaultForService: jest.fn(async () => null),
    insert: jest.fn(async (t) => makeTicket({ ...t, status: 'OPEN', version: 1 })),
    update: jest.fn(async (_id, _v, patch) => {
      stored = { ...stored, ...patch, version: stored.version + 1 };
      return stored;
    }),
    addEvent: jest.fn(async (e) => ({
      id: 1,
      ticketId: e.ticketId,
      kind: e.kind,
      authorId: e.authorId,
      body: e.body ?? null,
      fromValue: e.fromValue ?? null,
      toValue: e.toValue ?? null,
      internal: e.internal ?? false,
      createdAt: NOW
    }) as TicketEvent),
    events: jest.fn(async () => []),
    lastEventAt: jest.fn(async () => null)
  };
  const inventory = {
    findService: jest.fn(async () => makeService()),
    findSite: jest.fn()
  } as unknown as jest.Mocked<InventoryRepository>;
  const accounts = {
    get: jest.fn(async () => ({ id: ACCOUNT_ID, name: 'Acme', status: 'ACTIVE', currency: 'GBP', slaTier: 'PREMIUM', approvalThresholdMinor: 0 }))
  } as unknown as jest.Mocked<AccountsRepository>;
  const notifier = { ticketUpdated: jest.fn(async () => undefined) };
  const audit = recordingAudit();
  const service = new TicketsService(passthroughDb(), repo, inventory, accounts, notifier, audit, fixedClock(NOW));
  return { repo, inventory, accounts, notifier, audit, service };
}

describe('assertTicketShape', () => {
  const base = { category: 'FAULT' as const, priority: 'P2' as const, subject: 'x', description: 'y', serviceId: 'svc' };

  it('requires a service for faults', () => {
    expect(() => assertTicketShape({ ...base, serviceId: null }, null)).toThrow(BusinessRuleError);
  });

  it('reserves P1 for faults on active services', () => {
    expect(() => assertTicketShape({ ...base, priority: 'P1' }, 'SUSPENDED')).toThrow(/active service/);
    expect(() => assertTicketShape({ ...base, category: 'GENERAL', priority: 'P1' }, 'ACTIVE')).toThrow(/reserved/);
    expect(() => assertTicketShape({ ...base, priority: 'P1' }, 'ACTIVE')).not.toThrow();
  });

  it('keeps billing queries at P3/P4', () => {
    expect(() => assertTicketShape({ ...base, category: 'BILLING', priority: 'P2', serviceId: null }, null)).toThrow(BusinessRuleError);
  });
});

describe('statusTransitionPatch', () => {
  const now = new Date('2024-06-03T12:00:00Z');

  it('starts a pending window and records first response for an agent', () => {
    const patch = statusTransitionPatch(makeTicket({ status: 'IN_PROGRESS' }), 'PENDING_CUSTOMER', 'agent', now);
    expect(patch).toMatchObject({ status: 'PENDING_CUSTOMER', pendingSince: NOW, firstResponseAt: NOW });
  });

  it('accumulates paused time and pushes the resolution due date when resuming', () => {
    const ticket = makeTicket({ status: 'PENDING_CUSTOMER', pendingSince: '2024-06-03T10:00:00.000Z', firstResponseAt: '2024-06-03T09:05:00.000Z' });
    const patch = statusTransitionPatch(ticket, 'IN_PROGRESS', 'customer', now);
    expect(patch.pausedMs).toBe(2 * 3_600_000);
    expect(patch.pendingSince).toBeNull();
    expect(patch.resolutionDueAt).toBe('2024-06-04T11:00:00.000Z');
    expect(patch.firstResponseAt).toBeUndefined();
  });

  it('excludes time spent resolved when a ticket is reopened', () => {
    const ticket = makeTicket({ status: 'RESOLVED', resolvedAt: '2024-06-03T11:00:00.000Z', firstResponseAt: '2024-06-03T09:05:00.000Z' });
    const patch = statusTransitionPatch(ticket, 'IN_PROGRESS', 'customer', now);
    expect(patch.resolvedAt).toBeNull();
    expect(patch.pausedMs).toBe(3_600_000);
  });
});

describe('TicketsService.create', () => {
  const input = { category: 'FAULT' as const, priority: 'P2' as const, serviceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', subject: 'Line down', description: 'No sync since this morning at the HQ' };

  it('derives site and SLA tier from the service', async () => {
    const { service, repo, audit } = setup();
    const ticket = await service.create(userCtx(), input);
    const inserted = repo.insert.mock.calls[0][0];
    expect(inserted.siteId).toBe(makeService().siteId);
    expect(inserted.slaTier).toBe('ENHANCED');
    expect(inserted.responseDueAt).toBe('2024-06-03T13:00:00.000Z');
    expect(ticket.sla.response.state).toBe('ON_TRACK');
    expect(audit.entries[0].action).toBe('ticket.created');
  });

  it('uses the account tier for account-level tickets', async () => {
    const { service, repo } = setup();
    await service.create(adminCtx(), { category: 'GENERAL', priority: 'P4', subject: 'Question', description: 'How do I add a new site to my account?' });
    expect(repo.insert.mock.calls[0][0].slaTier).toBe('PREMIUM');
  });

  it('rejects a duplicate open fault for the same service', async () => {
    const { service, repo } = setup();
    repo.findOpenFaultForService.mockResolvedValue(makeTicket());
    await expect(service.create(userCtx(), input)).rejects.toThrow(ConflictError);
  });

  it('hides services outside the caller site scope', async () => {
    const { service, inventory } = setup();
    (inventory.findService as jest.Mock).mockResolvedValue(makeService({ siteId: SITE_B }));
    await expect(service.create(userCtx(), input)).rejects.toThrow(NotFoundError);
  });
});

describe('TicketsService.comment', () => {
  it('moves a pending ticket back to in-progress when the customer replies', async () => {
    const { service, repo, notifier } = setup(makeTicket({ status: 'PENDING_CUSTOMER', pendingSince: '2024-06-03T11:00:00.000Z' }));
    const result = await service.comment(userCtx(), 'id', { body: 'Router rebooted, still down', internal: false, version: 1 });
    expect(result.status).toBe('IN_PROGRESS');
    expect(repo.addEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'STATUS_CHANGE', toValue: 'IN_PROGRESS' }), expect.anything());
    expect(notifier.ticketUpdated).toHaveBeenCalled();
  });

  it('records first response on the first public agent comment', async () => {
    const { service } = setup();
    const result = await service.comment(agentCtx(), 'id', { body: 'Looking into it', internal: false, version: 1 });
    expect(result.firstResponseAt).toBe(NOW);
  });

  it('does not notify the customer about internal notes', async () => {
    const { service, notifier } = setup();
    await service.comment(agentCtx(), 'id', { body: 'Checking OLT port', internal: true, version: 1 });
    expect(notifier.ticketUpdated).not.toHaveBeenCalled();
  });

  it('forbids customers from writing internal notes', async () => {
    const { service } = setup();
    await expect(service.comment(userCtx(), 'id', { body: 'x', internal: true, version: 1 })).rejects.toThrow(ForbiddenError);
  });

  it('rejects stale versions', async () => {
    const { service } = setup(makeTicket({ version: 4 }));
    await expect(service.comment(userCtx(), 'id', { body: 'x', internal: false, version: 3 })).rejects.toThrow(ConflictError);
  });
});

describe('TicketsService.changeStatus', () => {
  it('lets a customer withdraw an open ticket', async () => {
    const { service, audit } = setup();
    const result = await service.changeStatus(userCtx(), 'id', { status: 'CLOSED', version: 1 });
    expect(result.status).toBe('CLOSED');
    expect(audit.entries[0].action).toBe('ticket.closed');
  });

  it('prevents customers from resolving tickets', async () => {
    const { service } = setup(makeTicket({ status: 'IN_PROGRESS' }));
    await expect(service.changeStatus(userCtx(), 'id', { status: 'RESOLVED', version: 1 })).rejects.toThrow(InvalidStateTransitionError);
  });

  it('enforces the reopen window', async () => {
    const { service } = setup(makeTicket({ status: 'RESOLVED', resolvedAt: '2024-05-20T09:00:00.000Z' }));
    await expect(service.changeStatus(userCtx(), 'id', { status: 'IN_PROGRESS', version: 1 })).rejects.toThrow(/reopened within/);
  });
});

describe('TicketsService.escalate', () => {
  it('blocks early customer escalation of non-P1 tickets', async () => {
    const { service } = setup(makeTicket({ openedAt: '2024-06-03T11:00:00.000Z' }));
    await expect(service.escalate(userCtx(), 'id', { reason: 'Nobody has called us back', version: 1 })).rejects.toThrow(/well within/);
  });

  it('jumps to the level implied by SLA consumption', async () => {
    // 21h of a 24h target consumed => automatic level 2
    const { service } = setup(makeTicket({ openedAt: '2024-06-02T15:00:00.000Z' }));
    const result = await service.escalate(userCtx(), 'id', { reason: 'Still down after most of a day', version: 1 });
    expect(result.escalationLevel).toBe(2);
  });

  it('applies a cooldown between escalations', async () => {
    const { service, repo } = setup(makeTicket({ priority: 'P1', escalationLevel: 1 }));
    repo.lastEventAt.mockResolvedValue(new Date('2024-06-03T11:30:00Z'));
    await expect(service.escalate(userCtx(), 'id', { reason: 'Escalating again please', version: 1 })).rejects.toThrow(/limited/);
  });
});

describe('TicketsService.changePriority', () => {
  it('is restricted to support agents', async () => {
    const { service } = setup();
    await expect(service.changePriority(adminCtx(), 'id', { priority: 'P1', reason: 'urgent', version: 1 })).rejects.toThrow(ForbiddenError);
  });

  it('recomputes due dates from the open time', async () => {
    const { service } = setup();
    const result = await service.changePriority(agentCtx(), 'id', { priority: 'P1', reason: 'Total outage', version: 1 });
    expect(result.priority).toBe('P1');
    expect(result.responseDueAt).toBe('2024-06-03T10:00:00.000Z');
    expect(result.resolutionDueAt).toBe('2024-06-03T17:00:00.000Z');
  });
});
```

## apps/gokinetic-business/api/src/modules/tickets/tickets.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/tickets.service.ts`.

```typescript
import { AuthContext, can, canAccessSite, siteFilterFor } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { Clock, MS_PER_DAY, MS_PER_MINUTE, systemClock } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { Page, PageRequest, mapPage } from '../../lib/pagination';
import { newReference } from '../../lib/references';
import { AccountsRepository } from '../accounts/accounts.repository';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { SlaTier } from '../inventory/inventory.types';
import { MAX_ESCALATION_LEVEL, TicketPriority } from '../sla/sla.policy';
import { automaticEscalationLevel, computeDueDates, effectivePausedMs, resolutionConsumedBps, slaView } from './ticket-sla';
import { TicketActor, assertTicketTransition, nextStatusesFor } from './ticket-state-machine';
import { TicketFilter, TicketPatch, TicketsRepository } from './tickets.repository';
import {
  CUSTOMER_ESCALATION_MIN_CONSUMED_BPS,
  ESCALATION_COOLDOWN_MINUTES,
  NewTicketInput,
  REOPEN_WINDOW_DAYS,
  Ticket,
  TicketDetail,
  TicketEvent,
  TicketStatus,
  TicketView
} from './tickets.types';

export interface TicketNotifier {
  ticketUpdated(ticket: Ticket, event: TicketEvent): Promise<void>;
}

export interface TicketDetailWithActions extends TicketDetail {
  allowedStatuses: TicketStatus[];
}

function actorFor(ctx: AuthContext): TicketActor {
  return can(ctx, 'tickets:internal') ? 'agent' : 'customer';
}

/**
 * Field changes implied by a status transition: pausing/resuming the resolution clock,
 * stamping resolution/closure, and treating any agent action as the first response.
 */
export function statusTransitionPatch(ticket: Ticket, to: TicketStatus, actor: TicketActor, now: Date): TicketPatch {
  const patch: TicketPatch = { status: to };
  const nowIso = now.toISOString();

  if (actor === 'agent' && !ticket.firstResponseAt) patch.firstResponseAt = nowIso;

  let pausedMs = ticket.pausedMs;
  if (ticket.status === 'PENDING_CUSTOMER') {
    pausedMs = effectivePausedMs(ticket, now);
    patch.pendingSince = null;
  }
  if (ticket.status === 'RESOLVED' && to === 'IN_PROGRESS' && ticket.resolvedAt) {
    // Time spent resolved does not count against the reopened ticket.
    pausedMs += Math.max(0, now.getTime() - new Date(ticket.resolvedAt).getTime());
    patch.resolvedAt = null;
  }
  if (to === 'PENDING_CUSTOMER') patch.pendingSince = nowIso;
  if (to === 'RESOLVED') patch.resolvedAt = nowIso;
  if (to === 'CLOSED') patch.closedAt = nowIso;

  if (pausedMs !== ticket.pausedMs) {
    patch.pausedMs = pausedMs;
    patch.resolutionDueAt = computeDueDates(ticket.slaTier, ticket.priority, new Date(ticket.openedAt), pausedMs)
      .resolutionDueAt.toISOString();
  }
  return patch;
}

/** Validates the category/priority/service combination for a new ticket. */
export function assertTicketShape(input: NewTicketInput, serviceStatus: string | null): void {
  if (input.category === 'FAULT' && !input.serviceId) {
    throw new BusinessRuleError('fault-needs-service', 'A fault must be raised against a specific service');
  }
  if (input.priority === 'P1') {
    if (input.category !== 'FAULT') {
      throw new BusinessRuleError('p1-fault-only', 'Priority P1 is reserved for faults causing a total loss of service');
    }
    if (serviceStatus !== 'ACTIVE') {
      throw new BusinessRuleError('p1-active-service', 'Priority P1 can only be raised against an active service');
    }
  }
  if (input.category === 'BILLING' && (input.priority === 'P1' || input.priority === 'P2')) {
    throw new BusinessRuleError('billing-priority', 'Billing queries are handled at priority P3 or P4');
  }
}

export class TicketsService {
  constructor(
    private readonly db: Db,
    private readonly repo: TicketsRepository,
    private readonly inventory: InventoryRepository,
    private readonly accounts: AccountsRepository,
    private readonly notifier: TicketNotifier,
    private readonly audit: AuditRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async list(ctx: AuthContext, filter: Omit<TicketFilter, 'siteIds'>, page: PageRequest): Promise<Page<TicketView>> {
    if (filter.siteId && !canAccessSite(ctx, filter.siteId)) throw new ForbiddenError('You do not have access to this site');
    const now = this.clock.now();
    const result = await this.repo.list(ctx.accountId, { ...filter, siteIds: siteFilterFor(ctx) }, page);
    return mapPage(result, (t) => ({ ...t, sla: slaView(t, now) }));
  }

  async get(ctx: AuthContext, ticketId: string): Promise<TicketDetailWithActions> {
    const ticket = await this.requireTicket(ctx, ticketId);
    const events = await this.repo.events(ticket.id, can(ctx, 'tickets:internal'));
    return {
      ...ticket,
      sla: slaView(ticket, this.clock.now()),
      events,
      allowedStatuses: nextStatusesFor(ticket.status, actorFor(ctx))
    };
  }

  async create(ctx: AuthContext, input: NewTicketInput): Promise<TicketView> {
    const now = this.clock.now();
    let siteId = input.siteId ?? null;
    let tier: SlaTier;
    let serviceStatus: string | null = null;

    if (input.serviceId) {
      const service = await this.inventory.findService(ctx.accountId, input.serviceId);
      if (!service || !canAccessSite(ctx, service.siteId)) throw new NotFoundError('Service', input.serviceId);
      if (siteId && siteId !== service.siteId) {
        throw new BusinessRuleError('service-site-mismatch', 'The service does not belong to the selected site');
      }
      if (service.status === 'CEASED') {
        throw new BusinessRuleError('service-ceased', 'Tickets cannot be raised against a ceased service');
      }
      siteId = service.siteId;
      tier = service.slaTier;
      serviceStatus = service.status;
    } else {
      if (siteId) {
        const site = await this.inventory.findSite(ctx.accountId, siteId);
        if (!site || !canAccessSite(ctx, siteId)) throw new NotFoundError('Site', siteId);
      }
      tier = (await this.accounts.get(ctx.accountId)).slaTier;
    }
    assertTicketShape(input, serviceStatus);

    const due = computeDueDates(tier, input.priority, now);
    return this.db.tx(async (tx) => {
      if (input.category === 'FAULT' && input.serviceId) {
        const duplicate = await this.repo.findOpenFaultForService(ctx.accountId, input.serviceId, tx);
        if (duplicate) {
          throw new ConflictError(`Fault ${duplicate.reference} is already open for this service`, {
            ticketId: duplicate.id,
            reference: duplicate.reference
          });
        }
      }
      const ticket = await this.repo.insert(
        {
          accountId: ctx.accountId,
          reference: newReference('TKT', now),
          category: input.category,
          priority: input.priority,
          serviceId: input.serviceId ?? null,
          siteId,
          subject: input.subject,
          description: input.description,
          raisedBy: ctx.userId,
          contactPhone: input.contactPhone ?? null,
          slaTier: tier,
          openedAt: now.toISOString(),
          responseDueAt: due.responseDueAt.toISOString(),
          resolutionDueAt: due.resolutionDueAt.toISOString()
        },
        tx
      );
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: 'ticket.created',
          entity: 'ticket',
          entityId: ticket.id,
          details: { reference: ticket.reference, category: ticket.category, priority: ticket.priority }
        },
        tx
      );
      return { ...ticket, sla: slaView(ticket, now) };
    });
  }

  async comment(ctx: AuthContext, ticketId: string, input: { body: string; internal: boolean; version: number }): Promise<TicketView> {
    const actor = actorFor(ctx);
    if (input.internal && actor !== 'agent') throw new ForbiddenError('Only support agents can add internal notes');
    const now = this.clock.now();

    const { ticket, event } = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      if (current.status === 'CLOSED') {
        throw new BusinessRuleError('ticket-closed', 'Closed tickets cannot receive comments; raise a new ticket instead');
      }
      const event = await this.repo.addEvent(
        { ticketId: current.id, kind: 'COMMENT', authorId: ctx.userId, body: input.body, internal: input.internal },
        tx
      );
      let patch: TicketPatch = {};
      if (actor === 'customer' && current.status === 'PENDING_CUSTOMER') {
        // A customer reply hands the ticket back to the agent and restarts the clock.
        patch = statusTransitionPatch(current, 'IN_PROGRESS', actor, now);
        await this.repo.addEvent(
          { ticketId: current.id, kind: 'STATUS_CHANGE', authorId: ctx.userId, fromValue: current.status, toValue: 'IN_PROGRESS' },
          tx
        );
      } else if (actor === 'agent' && !input.internal && !current.firstResponseAt) {
        patch = { firstResponseAt: now.toISOString() };
      }
      const ticket = await this.repo.update(current.id, current.version, patch, tx);
      return { ticket, event };
    });

    if (!event.internal) await this.notifySafely(ticket, event);
    return { ...ticket, sla: slaView(ticket, now) };
  }

  async changeStatus(ctx: AuthContext, ticketId: string, input: { status: TicketStatus; reason?: string; version: number }): Promise<TicketView> {
    const actor = actorFor(ctx);
    const now = this.clock.now();

    const { ticket, event } = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      assertTicketTransition(current.status, input.status, actor);
      if (actor === 'customer' && current.status === 'RESOLVED' && input.status === 'IN_PROGRESS') {
        const resolvedAgoMs = now.getTime() - new Date(current.resolvedAt ?? current.openedAt).getTime();
        if (resolvedAgoMs > REOPEN_WINDOW_DAYS * MS_PER_DAY) {
          throw new BusinessRuleError('reopen-window-closed', `Tickets can only be reopened within ${REOPEN_WINDOW_DAYS} days of resolution`);
        }
      }
      const ticket = await this.repo.update(current.id, current.version, statusTransitionPatch(current, input.status, actor, now), tx);
      const event = await this.repo.addEvent(
        {
          ticketId: current.id,
          kind: 'STATUS_CHANGE',
          authorId: ctx.userId,
          body: input.reason ?? null,
          fromValue: current.status,
          toValue: input.status
        },
        tx
      );
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: `ticket.${input.status.toLowerCase()}`,
          entity: 'ticket',
          entityId: current.id,
          details: { from: current.status, to: input.status, reason: input.reason ?? null }
        },
        tx
      );
      return { ticket, event };
    });

    await this.notifySafely(ticket, event);
    return { ...ticket, sla: slaView(ticket, now) };
  }

  /**
   * Raises the escalation level by one. Customers may escalate once half of the resolution
   * target has elapsed (immediately for P1); escalations are rate-limited per ticket.
   */
  async escalate(ctx: AuthContext, ticketId: string, input: { reason: string; version: number }): Promise<TicketView> {
    const actor = actorFor(ctx);
    const now = this.clock.now();

    const { ticket, event } = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      if (current.status === 'RESOLVED' || current.status === 'CLOSED') {
        throw new BusinessRuleError('ticket-not-active', 'Only active tickets can be escalated');
      }
      if (current.escalationLevel >= MAX_ESCALATION_LEVEL) {
        throw new BusinessRuleError('max-escalation', 'This ticket is already at the highest escalation level');
      }
      const consumed = resolutionConsumedBps(current, now);
      if (actor === 'customer' && current.priority !== 'P1' && consumed < CUSTOMER_ESCALATION_MIN_CONSUMED_BPS) {
        throw new BusinessRuleError('escalation-too-early', 'This ticket is still well within its resolution target', {
          consumedBps: consumed,
          requiredBps: CUSTOMER_ESCALATION_MIN_CONSUMED_BPS
        });
      }
      const last = await this.repo.lastEventAt(current.id, 'ESCALATION', tx);
      if (last && now.getTime() - last.getTime() < ESCALATION_COOLDOWN_MINUTES * MS_PER_MINUTE) {
        throw new BusinessRuleError('escalation-cooldown', `Escalations are limited to one every ${ESCALATION_COOLDOWN_MINUTES} minutes`);
      }
      // Never escalate below the level the SLA position already implies.
      const level = Math.min(MAX_ESCALATION_LEVEL, Math.max(current.escalationLevel + 1, automaticEscalationLevel(consumed)));
      const ticket = await this.repo.update(current.id, current.version, { escalationLevel: level }, tx);
      const event = await this.repo.addEvent(
        {
          ticketId: current.id,
          kind: 'ESCALATION',
          authorId: ctx.userId,
          body: input.reason,
          fromValue: String(current.escalationLevel),
          toValue: String(level)
        },
        tx
      );
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'ticket.escalated', entity: 'ticket', entityId: current.id, details: { level, reason: input.reason } },
        tx
      );
      return { ticket, event };
    });

    await this.notifySafely(ticket, event);
    return { ...ticket, sla: slaView(ticket, now) };
  }

  /** Agent-only re-triage. Due dates are recomputed from the original open time. */
  async changePriority(ctx: AuthContext, ticketId: string, input: { priority: TicketPriority; reason: string; version: number }): Promise<TicketView> {
    if (actorFor(ctx) !== 'agent') throw new ForbiddenError('Only support agents can change ticket priority');
    const now = this.clock.now();
    const ticket = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      if (current.priority === input.priority) return current;
      if (current.status === 'CLOSED') throw new BusinessRuleError('ticket-closed', 'Closed tickets cannot be re-prioritised');
      const due = computeDueDates(current.slaTier, input.priority, new Date(current.openedAt), effectivePausedMs(current, now));
      const patch: TicketPatch = { priority: input.priority, resolutionDueAt: due.resolutionDueAt.toISOString() };
      if (!current.firstResponseAt) patch.responseDueAt = due.responseDueAt.toISOString();
      const updated = await this.repo.update(current.id, current.version, patch, tx);
      await this.repo.addEvent(
        { ticketId: current.id, kind: 'PRIORITY_CHANGE', authorId: ctx.userId, body: input.reason, fromValue: current.priority, toValue: input.priority, internal: true },
        tx
      );
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'ticket.reprioritised', entity: 'ticket', entityId: current.id, details: { from: current.priority, to: input.priority } },
        tx
      );
      return updated;
    });
    return { ...ticket, sla: slaView(ticket, now) };
  }

  private assertVersion(ticket: Ticket, version: number): void {
    if (ticket.version !== version) {
      throw new ConflictError('The ticket was changed by someone else; reload and try again', {
        ticketId: ticket.id,
        currentVersion: ticket.version
      });
    }
  }

  private async requireTicket(ctx: AuthContext, ticketId: string, db?: Db): Promise<Ticket> {
    const ticket = await this.repo.find(ctx.accountId, ticketId, db);
    if (!ticket || !canAccessSite(ctx, ticket.siteId)) throw new NotFoundError('Ticket', ticketId);
    return ticket;
  }

  private async notifySafely(ticket: Ticket, event: TicketEvent): Promise<void> {
    try {
      await this.notifier.ticketUpdated(ticket, event);
    } catch (err) {
      // Delivery is best effort; the ticket timeline is the source of truth.
      logger.warn('ticket notification failed', { ticketId: ticket.id, eventId: event.id, err });
    }
  }
}
```

## apps/gokinetic-business/api/src/modules/tickets/tickets.types.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/tickets.types.ts`.

```typescript
import { SlaTier } from '../inventory/inventory.types';
import { TicketPriority } from '../sla/sla.policy';

export const TICKET_CATEGORIES = ['FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL'] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const satisfies readonly TicketPriority[];

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ACTIVE_TICKET_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER'];

export type TicketEventKind = 'COMMENT' | 'STATUS_CHANGE' | 'ESCALATION' | 'PRIORITY_CHANGE';

export interface Ticket {
  id: string;
  accountId: string;
  reference: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  serviceId: string | null;
  siteId: string | null;
  subject: string;
  description: string;
  raisedBy: string;
  contactPhone: string | null;
  escalationLevel: number;
  slaTier: SlaTier;
  openedAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  pendingSince: string | null;
  pausedMs: number;
  responseDueAt: string;
  resolutionDueAt: string;
  version: number;
}

export interface TicketEvent {
  id: number;
  ticketId: string;
  kind: TicketEventKind;
  authorId: string | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  internal: boolean;
  createdAt: string;
}

export type SlaMeasureState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET' | 'PAUSED';

export interface TicketSlaView {
  response: { dueAt: string; state: SlaMeasureState; consumedBps: number };
  resolution: { dueAt: string; state: SlaMeasureState; consumedBps: number };
}

export interface TicketView extends Ticket {
  sla: TicketSlaView;
}

export interface TicketDetail extends TicketView {
  events: TicketEvent[];
}

export interface NewTicketInput {
  category: TicketCategory;
  priority: TicketPriority;
  serviceId?: string | null;
  siteId?: string | null;
  subject: string;
  description: string;
  contactPhone?: string | null;
}

/** A resolved ticket may be reopened by the customer within this many days. */
export const REOPEN_WINDOW_DAYS = 7;
/** Minimum gap between two escalations of the same ticket. */
export const ESCALATION_COOLDOWN_MINUTES = 120;
/** Share of the resolution target that must be consumed before a customer may escalate (P1 excepted). */
export const CUSTOMER_ESCALATION_MIN_CONSUMED_BPS = 5_000;
/** Share of a target consumed at which a measure is flagged AT_RISK. */
export const AT_RISK_BPS = 7_500;
```

## apps/gokinetic-business/api/src/modules/users/users.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/users/users.repository.ts`.

```typescript
import { Db, WhereBuilder } from '../../db/query';
import { ConflictError } from '../../lib/errors';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { BusinessRole, BusinessUser, UserStatus } from './users.types';

interface UserRow {
  id: string;
  account_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: BusinessRole;
  status: UserStatus;
  site_scope: string[] | null;
  invited_by: string | null;
  last_login_at: Date | null;
  version: number;
  created_at: Date;
  total?: string;
}

function toUser(r: UserRow): BusinessUser {
  return {
    id: r.id,
    accountId: r.account_id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    status: r.status,
    siteScope: r.site_scope,
    invitedBy: r.invited_by,
    lastLoginAt: r.last_login_at?.toISOString() ?? null,
    version: r.version,
    createdAt: r.created_at.toISOString()
  };
}

export interface UserFilter {
  role?: BusinessRole;
  status?: UserStatus;
  search?: string;
}

export interface NewUser {
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  siteScope: string[] | null;
  invitedBy: string;
}

export type UserPatch = Partial<Pick<BusinessUser, 'role' | 'status' | 'siteScope' | 'firstName' | 'lastName'>>;

export interface UsersRepository {
  list(accountId: string, filter: UserFilter, page: PageRequest): Promise<Page<BusinessUser>>;
  find(accountId: string, userId: string, db?: Db): Promise<BusinessUser | null>;
  findByEmail(accountId: string, email: string, db?: Db): Promise<BusinessUser | null>;
  countActiveAdmins(accountId: string, db?: Db): Promise<number>;
  countSeats(accountId: string, db?: Db): Promise<number>;
  insert(user: NewUser, db?: Db): Promise<BusinessUser>;
  /** Applies a patch only if the stored version matches; bumps the version. */
  update(accountId: string, userId: string, expectedVersion: number, patch: UserPatch, db?: Db): Promise<BusinessUser>;
}

export function createUsersRepository(defaultDb: Db): UsersRepository {
  return {
    async list(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('role = ?', filter.role)
        .add('status = ?', filter.status);
      if (filter.search) {
        const p = where.nextParam(`%${filter.search.toLowerCase()}%`);
        where.addRaw(`(lower(email) LIKE ${p} OR lower(first_name || ' ' || last_name) LIKE ${p})`);
      }
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<UserRow>(
        `SELECT *, count(*) OVER() AS total FROM users ${where.toSql()}
          ORDER BY last_name, first_name
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toUser), page, rows.length ? Number(rows[0].total) : 0);
    },

    async find(accountId, userId, db = defaultDb) {
      const row = await db.oneOrNone<UserRow>('SELECT * FROM users WHERE account_id = $1 AND id = $2', [accountId, userId]);
      return row ? toUser(row) : null;
    },

    async findByEmail(accountId, email, db = defaultDb) {
      const row = await db.oneOrNone<UserRow>('SELECT * FROM users WHERE account_id = $1 AND lower(email) = lower($2)', [
        accountId,
        email
      ]);
      return row ? toUser(row) : null;
    },

    async countActiveAdmins(accountId, db = defaultDb) {
      const row = await db.one<{ n: string }>(
        `SELECT count(*) AS n FROM users WHERE account_id = $1 AND role = 'BUSINESS_ADMIN' AND status = 'ACTIVE'`,
        [accountId]
      );
      return Number(row.n);
    },

    async countSeats(accountId, db = defaultDb) {
      const row = await db.one<{ n: string }>(
        `SELECT count(*) AS n FROM users WHERE account_id = $1 AND status <> 'DEACTIVATED'`,
        [accountId]
      );
      return Number(row.n);
    },

    async insert(user, db = defaultDb) {
      const row = await db.one<UserRow>(
        `INSERT INTO users (account_id, email, first_name, last_name, role, status, site_scope, invited_by)
         VALUES ($1, lower($2), $3, $4, $5, 'INVITED', $6::uuid[], $7)
         RETURNING *`,
        [user.accountId, user.email, user.firstName, user.lastName, user.role, user.siteScope, user.invitedBy]
      );
      return toUser(row);
    },

    async update(accountId, userId, expectedVersion, patch, db = defaultDb) {
      const row = await db.oneOrNone<UserRow>(
        `UPDATE users SET
            role = coalesce($4, role),
            status = coalesce($5, status),
            site_scope = CASE WHEN $6::boolean THEN $7::uuid[] ELSE site_scope END,
            first_name = coalesce($8, first_name),
            last_name = coalesce($9, last_name),
            version = version + 1
          WHERE account_id = $1 AND id = $2 AND version = $3
          RETURNING *`,
        [
          accountId,
          userId,
          expectedVersion,
          patch.role ?? null,
          patch.status ?? null,
          'siteScope' in patch,
          patch.siteScope ?? null,
          patch.firstName ?? null,
          patch.lastName ?? null
        ]
      );
      if (!row) {
        throw new ConflictError('The user was modified by someone else; reload and try again', {
          expectedVersion
        });
      }
      return toUser(row);
    }
  };
}
```

## apps/gokinetic-business/api/src/modules/users/users.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/users/users.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { UsersService } from './users.service';
import { BUSINESS_ROLES, USER_STATUSES } from './users.types';

const ListQuery = PaginationQuery.extend({
  role: z.enum(BUSINESS_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  search: z.string().trim().min(2).max(80).optional()
});

const SiteScope = z.array(z.string().uuid()).max(500).nullish();

const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  role: z.enum(BUSINESS_ROLES),
  siteScope: SiteScope
});

const RoleBody = z.object({
  role: z.enum(BUSINESS_ROLES),
  siteScope: SiteScope,
  version: z.number().int().positive()
});

const VersionBody = z.object({ version: z.number().int().positive() });

export function usersRoutes(service: UsersService): Router {
  const router = Router();

  router.get(
    '/users',
    requirePermission('users:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/users/:id',
    requirePermission('users:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/users',
    requirePermission('users:manage'),
    validate({ body: InviteBody }),
    asyncHandler(async (req, res) => {
      const user = await service.invite(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/users/${user.id}`).json(user);
    })
  );

  router.put(
    '/users/:id/role',
    requirePermission('users:manage'),
    validate({ params: UuidParam, body: RoleBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.changeRole(requireAuth(req), req.params.id, req.body));
    })
  );

  for (const action of ['suspend', 'reactivate', 'deactivate'] as const) {
    router.post(
      `/users/:id/${action}`,
      requirePermission('users:manage'),
      validate({ params: UuidParam, body: VersionBody }),
      asyncHandler(async (req, res) => {
        res.json(await service.transition(requireAuth(req), req.params.id, action, req.body.version));
      })
    );
  }

  router.post(
    '/users/:id/resend-invitation',
    requirePermission('users:manage'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      await service.resendInvitation(requireAuth(req), req.params.id);
      res.status(202).end();
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/users/users.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/users/users.service.test.ts`.

```typescript
import { BusinessRuleError, ConflictError, InvalidStateTransitionError } from '../../lib/errors';
import { ACCOUNT_ID, ADMIN_ID, SITE_A, SITE_B, adminCtx, makeSite, passthroughDb, recordingAudit } from '../../test/fixtures';
import { InventoryRepository } from '../inventory/inventory.repository';
import { UsersRepository } from './users.repository';
import { UsersService, resolveSiteScope } from './users.service';
import { BusinessUser } from './users.types';

const TARGET = '44444444-4444-4444-8444-444444444444';

function makeUser(overrides: Partial<BusinessUser> = {}): BusinessUser {
  return {
    id: TARGET,
    accountId: ACCOUNT_ID,
    email: 'jo@acme.example',
    firstName: 'Jo',
    lastName: 'Bloggs',
    role: 'BUSINESS_USER',
    status: 'ACTIVE',
    siteScope: null,
    invitedBy: ADMIN_ID,
    lastLoginAt: null,
    version: 3,
    createdAt: '2024-02-01T00:00:00.000Z',
    ...overrides
  };
}

function setup() {
  const repo: jest.Mocked<UsersRepository> = {
    list: jest.fn(),
    find: jest.fn(),
    findByEmail: jest.fn(async () => null),
    countActiveAdmins: jest.fn(async () => 2),
    countSeats: jest.fn(async () => 5),
    insert: jest.fn(async (u) => makeUser({ ...u, status: 'INVITED', version: 1 })),
    update: jest.fn(async (_a, _id, _v, patch) => makeUser({ ...patch }))
  };
  const inventory = {
    findSitesByIds: jest.fn(async (_acc: string, ids: string[]) => ids.map((id) => makeSite({ id })))
  } as unknown as jest.Mocked<InventoryRepository>;
  const invitations = { sendInvitation: jest.fn(async () => undefined) };
  const audit = recordingAudit();
  const service = new UsersService(passthroughDb(), repo, inventory, invitations, audit);
  return { repo, inventory, invitations, audit, service };
}

describe('resolveSiteScope', () => {
  it('returns null for admins', () => {
    expect(resolveSiteScope('BUSINESS_ADMIN', null)).toBeNull();
  });
  it('rejects a scoped admin', () => {
    expect(() => resolveSiteScope('BUSINESS_ADMIN', [SITE_A])).toThrow(BusinessRuleError);
  });
  it('deduplicates user scopes', () => {
    expect(resolveSiteScope('BUSINESS_USER', [SITE_A, SITE_A, SITE_B])).toEqual([SITE_A, SITE_B]);
  });
  it('rejects an explicitly empty scope', () => {
    expect(() => resolveSiteScope('BUSINESS_USER', [])).toThrow(BusinessRuleError);
  });
});

describe('UsersService.invite', () => {
  const input = { email: 'new@acme.example', firstName: 'New', lastName: 'Person', role: 'BUSINESS_USER' as const };

  it('creates an invited user and sends the invitation', async () => {
    const { service, invitations, audit } = setup();
    const user = await service.invite(adminCtx(), { ...input, siteScope: [SITE_A] });
    expect(user.status).toBe('INVITED');
    expect(invitations.sendInvitation).toHaveBeenCalledWith(user, 'admin@acme.example');
    expect(audit.entries[0].action).toBe('user.invited');
  });

  it('rejects an email that already has access', async () => {
    const { service, repo } = setup();
    repo.findByEmail.mockResolvedValue(makeUser());
    await expect(service.invite(adminCtx(), input)).rejects.toBeInstanceOf(ConflictError);
  });

  it('re-invites a previously deactivated user', async () => {
    const { service, repo, audit } = setup();
    repo.findByEmail.mockResolvedValue(makeUser({ status: 'DEACTIVATED' }));
    await service.invite(adminCtx(), input);
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, expect.objectContaining({ status: 'INVITED' }), expect.anything());
    expect(audit.entries[0].action).toBe('user.reinvited');
  });

  it('enforces the seat limit', async () => {
    const { service, repo } = setup();
    repo.countSeats.mockResolvedValue(250);
    await expect(service.invite(adminCtx(), input)).rejects.toMatchObject({ code: 'business-rule/seat-limit' });
  });

  it('rejects decommissioned sites in the scope', async () => {
    const { service, inventory } = setup();
    (inventory.findSitesByIds as jest.Mock).mockResolvedValue([makeSite({ id: SITE_A, status: 'DECOMMISSIONED' })]);
    await expect(service.invite(adminCtx(), { ...input, siteScope: [SITE_A] })).rejects.toMatchObject({
      code: 'business-rule/invalid-site-scope'
    });
  });

  it('still returns the user when invitation delivery fails', async () => {
    const { service, invitations } = setup();
    invitations.sendInvitation.mockRejectedValue(new Error('smtp down'));
    await expect(service.invite(adminCtx(), input)).resolves.toMatchObject({ email: 'new@acme.example' });
  });
});

describe('UsersService.changeRole', () => {
  it('prevents changing your own role', async () => {
    const { service } = setup();
    await expect(service.changeRole(adminCtx(), ADMIN_ID, { role: 'BUSINESS_USER', version: 1 })).rejects.toMatchObject({
      code: 'business-rule/self-role-change'
    });
  });

  it('prevents demoting the last active admin', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ role: 'BUSINESS_ADMIN' }));
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(service.changeRole(adminCtx(), TARGET, { role: 'BUSINESS_USER', version: 3 })).rejects.toMatchObject({
      code: 'business-rule/last-admin'
    });
  });

  it('promotes a user to admin and clears the scope', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ siteScope: [SITE_A] }));
    await service.changeRole(adminCtx(), TARGET, { role: 'BUSINESS_ADMIN', version: 3 });
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, { role: 'BUSINESS_ADMIN', siteScope: null }, expect.anything());
  });
});

describe('UsersService.transition', () => {
  it('suspends an active user', async () => {
    const { service, repo, audit } = setup();
    repo.find.mockResolvedValue(makeUser());
    await service.transition(adminCtx(), TARGET, 'suspend', 3);
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, { status: 'SUSPENDED' }, expect.anything());
    expect(audit.entries[0].action).toBe('user.suspended');
  });

  it('rejects reactivating an active user', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser());
    await expect(service.transition(adminCtx(), TARGET, 'reactivate', 3)).rejects.toBeInstanceOf(InvalidStateTransitionError);
  });

  it('prevents deactivating the last admin', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ role: 'BUSINESS_ADMIN' }));
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(service.transition(adminCtx(), TARGET, 'deactivate', 3)).rejects.toMatchObject({
      code: 'business-rule/last-admin'
    });
  });

  it('allows revoking a pending invitation', async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue(makeUser({ status: 'INVITED' }));
    await service.transition(adminCtx(), TARGET, 'deactivate', 3);
    expect(repo.update).toHaveBeenCalledWith(ACCOUNT_ID, TARGET, 3, { status: 'DEACTIVATED' }, expect.anything());
  });

  it('prevents acting on yourself', async () => {
    const { service } = setup();
    await expect(service.transition(adminCtx(), ADMIN_ID, 'suspend', 1)).rejects.toBeInstanceOf(BusinessRuleError);
  });
});
```

## apps/gokinetic-business/api/src/modules/users/users.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/users/users.service.ts`.

```typescript
import { AuthContext } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ConflictError, InvalidStateTransitionError, NotFoundError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { Page, PageRequest } from '../../lib/pagination';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { UserFilter, UserPatch, UsersRepository } from './users.repository';
import { BusinessRole, BusinessUser, MAX_USERS_PER_ACCOUNT, USER_TRANSITIONS, UserAction } from './users.types';

const AUDIT_ACTIONS: Record<UserAction, string> = {
  suspend: 'user.suspended',
  reactivate: 'user.reactivated',
  deactivate: 'user.deactivated'
};

export interface InvitationSender {
  sendInvitation(user: BusinessUser, invitedByEmail: string): Promise<void>;
}

export interface InviteUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  siteScope?: string[] | null;
}

export interface ChangeRoleInput {
  role: BusinessRole;
  siteScope?: string[] | null;
  version: number;
}

/**
 * Resolves the effective site scope for a role. Admins always see every site, so any
 * supplied scope is rejected rather than silently discarded.
 */
export function resolveSiteScope(role: BusinessRole, scope: string[] | null | undefined): string[] | null {
  if (role === 'BUSINESS_ADMIN') {
    if (scope && scope.length > 0) {
      throw new BusinessRuleError('admin-site-scope', 'Business admins cannot be restricted to specific sites');
    }
    return null;
  }
  if (scope === undefined || scope === null) return null;
  const unique = Array.from(new Set(scope));
  if (unique.length === 0) {
    throw new BusinessRuleError('empty-site-scope', 'A site scope, when given, must contain at least one site');
  }
  return unique;
}

export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly repo: UsersRepository,
    private readonly inventory: InventoryRepository,
    private readonly invitations: InvitationSender,
    private readonly audit: AuditRepository
  ) {}

  list(ctx: AuthContext, filter: UserFilter, page: PageRequest): Promise<Page<BusinessUser>> {
    return this.repo.list(ctx.accountId, filter, page);
  }

  async get(ctx: AuthContext, userId: string): Promise<BusinessUser> {
    const user = await this.repo.find(ctx.accountId, userId);
    if (!user) throw new NotFoundError('User', userId);
    return user;
  }

  async invite(ctx: AuthContext, input: InviteUserInput): Promise<BusinessUser> {
    const siteScope = resolveSiteScope(input.role, input.siteScope);
    if (siteScope) await this.assertSitesUsable(ctx.accountId, siteScope);

    const user = await this.db.tx(async (tx) => {
      const existing = await this.repo.findByEmail(ctx.accountId, input.email, tx);
      if (existing && existing.status !== 'DEACTIVATED') {
        throw new ConflictError(`${input.email} already has access to this account`, { userId: existing.id });
      }
      const seats = await this.repo.countSeats(ctx.accountId, tx);
      if (seats >= MAX_USERS_PER_ACCOUNT) {
        throw new BusinessRuleError('seat-limit', `This account has reached its limit of ${MAX_USERS_PER_ACCOUNT} users`);
      }
      const created = existing
        ? await this.repo.update(ctx.accountId, existing.id, existing.version, {
            status: 'INVITED',
            role: input.role,
            siteScope,
            firstName: input.firstName,
            lastName: input.lastName
          }, tx)
        : await this.repo.insert(
            {
              accountId: ctx.accountId,
              email: input.email,
              firstName: input.firstName,
              lastName: input.lastName,
              role: input.role,
              siteScope,
              invitedBy: ctx.userId
            },
            tx
          );
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: existing ? 'user.reinvited' : 'user.invited',
          entity: 'user',
          entityId: created.id,
          details: { role: created.role, siteScope }
        },
        tx
      );
      return created;
    });

    try {
      await this.invitations.sendInvitation(user, ctx.email);
    } catch (err) {
      // The user record is the source of truth; the invite can be re-sent from the portal.
      logger.warn('invitation delivery failed', { userId: user.id, err });
    }
    return user;
  }

  async changeRole(ctx: AuthContext, userId: string, input: ChangeRoleInput): Promise<BusinessUser> {
    if (userId === ctx.userId) {
      throw new BusinessRuleError('self-role-change', 'You cannot change your own role');
    }
    const siteScope = resolveSiteScope(input.role, input.siteScope);
    if (siteScope) await this.assertSitesUsable(ctx.accountId, siteScope);

    return this.db.tx(async (tx) => {
      const user = await this.requireUser(ctx.accountId, userId, tx);
      if (user.status === 'DEACTIVATED') {
        throw new BusinessRuleError('user-deactivated', 'Deactivated users cannot be modified');
      }
      if (user.role === 'BUSINESS_ADMIN' && input.role !== 'BUSINESS_ADMIN' && user.status === 'ACTIVE') {
        await this.assertNotLastAdmin(ctx.accountId, tx);
      }
      const updated = await this.repo.update(ctx.accountId, userId, input.version, { role: input.role, siteScope }, tx);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: 'user.role_changed',
          entity: 'user',
          entityId: userId,
          details: { from: { role: user.role, siteScope: user.siteScope }, to: { role: input.role, siteScope } }
        },
        tx
      );
      return updated;
    });
  }

  async transition(ctx: AuthContext, userId: string, action: UserAction, version: number): Promise<BusinessUser> {
    if (userId === ctx.userId) {
      throw new BusinessRuleError('self-lifecycle', 'You cannot change the status of your own account');
    }
    const rule = USER_TRANSITIONS[action];
    return this.db.tx(async (tx) => {
      const user = await this.requireUser(ctx.accountId, userId, tx);
      if (!rule.from.includes(user.status)) {
        throw new InvalidStateTransitionError('User', user.status, rule.to);
      }
      if (user.role === 'BUSINESS_ADMIN' && user.status === 'ACTIVE' && rule.to !== 'ACTIVE') {
        await this.assertNotLastAdmin(ctx.accountId, tx);
      }
      const patch: UserPatch = { status: rule.to };
      const updated = await this.repo.update(ctx.accountId, userId, version, patch, tx);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: AUDIT_ACTIONS[action],
          entity: 'user',
          entityId: userId,
          details: { from: user.status, to: rule.to }
        },
        tx
      );
      return updated;
    });
  }

  async resendInvitation(ctx: AuthContext, userId: string): Promise<void> {
    const user = await this.requireUser(ctx.accountId, userId);
    if (user.status !== 'INVITED') {
      throw new BusinessRuleError('not-invited', 'Only users with a pending invitation can be re-sent an invite');
    }
    await this.invitations.sendInvitation(user, ctx.email);
    await this.audit.record({
      accountId: ctx.accountId,
      actorId: ctx.userId,
      action: 'user.invitation_resent',
      entity: 'user',
      entityId: userId
    });
  }

  private async requireUser(accountId: string, userId: string, db?: Db): Promise<BusinessUser> {
    const user = await this.repo.find(accountId, userId, db);
    if (!user) throw new NotFoundError('User', userId);
    return user;
  }

  private async assertNotLastAdmin(accountId: string, db: Db): Promise<void> {
    const admins = await this.repo.countActiveAdmins(accountId, db);
    if (admins <= 1) {
      throw new BusinessRuleError('last-admin', 'The account must keep at least one active business admin');
    }
  }

  private async assertSitesUsable(accountId: string, siteIds: string[]): Promise<void> {
    const sites = await this.inventory.findSitesByIds(accountId, siteIds);
    const usable = new Set(sites.filter((s) => s.status !== 'DECOMMISSIONED').map((s) => s.id));
    const invalid = siteIds.filter((id) => !usable.has(id));
    if (invalid.length > 0) {
      throw new BusinessRuleError('invalid-site-scope', 'Site scope contains unknown or decommissioned sites', {
        siteIds: invalid
      });
    }
  }
}
```

## apps/gokinetic-business/api/src/modules/users/users.types.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/users/users.types.ts`.

```typescript
export const BUSINESS_ROLES = ['BUSINESS_ADMIN', 'BUSINESS_USER'] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface BusinessUser {
  id: string;
  accountId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: BusinessRole;
  status: UserStatus;
  siteScope: string[] | null;
  invitedBy: string | null;
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
}

export type UserAction = 'suspend' | 'reactivate' | 'deactivate';

/** Allowed lifecycle transitions keyed by action. */
export const USER_TRANSITIONS: Record<UserAction, { from: UserStatus[]; to: UserStatus }> = {
  suspend: { from: ['ACTIVE'], to: 'SUSPENDED' },
  reactivate: { from: ['SUSPENDED'], to: 'ACTIVE' },
  deactivate: { from: ['INVITED', 'ACTIVE', 'SUSPENDED'], to: 'DEACTIVATED' }
};

/** Maximum number of non-deactivated portal users per business account. */
export const MAX_USERS_PER_ACCOUNT = 250;
```

## apps/gokinetic-business/api/src/server.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/server.ts`.

```typescript
import { createServer } from 'node:http';
import { createApp } from './app';
import { createTokenVerifier } from './auth/jwt';
import { loadConfig } from './config/env';
import { createDb, createPool } from './db/query';
import { logger } from './lib/logger';
import { createAccountsRepository } from './modules/accounts/accounts.repository';
import { accountsRoutes } from './modules/accounts/accounts.routes';
import { AccountsService } from './modules/accounts/accounts.service';
import { createAuditRepository } from './modules/audit/audit.repository';
import { auditRoutes } from './modules/audit/audit.routes';
import { AuditService } from './modules/audit/audit.service';
import { createBillingRepository } from './modules/billing/billing.repository';
import { billingRoutes } from './modules/billing/billing.routes';
import { BillingService } from './modules/billing/billing.service';
import { createInventoryRepository } from './modules/inventory/inventory.repository';
import { inventoryRoutes } from './modules/inventory/inventory.routes';
import { InventoryService } from './modules/inventory/inventory.service';
import { createOutbox, outboxInvitationSender, outboxTicketNotifier } from './modules/notifications/outbox';
import { createOrdersRepository } from './modules/orders/orders.repository';
import { ordersRoutes } from './modules/orders/orders.routes';
import { OrdersService } from './modules/orders/orders.service';
import { createHttpPaymentGateway } from './modules/payments/payment-gateway';
import { createPaymentMethodsRepository } from './modules/payments/payment-methods.repository';
import { paymentMethodsRoutes } from './modules/payments/payment-methods.routes';
import { PaymentMethodsService } from './modules/payments/payment-methods.service';
import { createSlaRepository } from './modules/sla/sla.repository';
import { slaRoutes } from './modules/sla/sla.routes';
import { SlaService } from './modules/sla/sla.service';
import { createTicketsRepository } from './modules/tickets/tickets.repository';
import { ticketsRoutes } from './modules/tickets/tickets.routes';
import { TicketsService } from './modules/tickets/tickets.service';
import { createUsersRepository } from './modules/users/users.repository';
import { usersRoutes } from './modules/users/users.routes';
import { UsersService } from './modules/users/users.service';

const SHUTDOWN_GRACE_MS = 15_000;

function main(): void {
  const config = loadConfig();
  const pool = createPool(config.database.url, config.database.poolMax, config.database.statementTimeoutMs);
  const db = createDb(pool);

  const audit = createAuditRepository(db);
  const accounts = createAccountsRepository(db);
  const inventoryRepo = createInventoryRepository(db);
  const outbox = createOutbox(db);

  const billing = new BillingService(db, createBillingRepository(db), inventoryRepo, audit);
  const orders = new OrdersService(db, createOrdersRepository(db), inventoryRepo, accounts, audit);
  const inventory = new InventoryService(db, inventoryRepo, billing, orders, audit);
  const users = new UsersService(db, createUsersRepository(db), inventoryRepo, outboxInvitationSender(outbox), audit);
  const tickets = new TicketsService(db, createTicketsRepository(db), inventoryRepo, accounts, outboxTicketNotifier(outbox), audit);
  const sla = new SlaService(createSlaRepository(db), inventoryRepo, accounts);
  const payments = new PaymentMethodsService(
    db,
    createPaymentMethodsRepository(db),
    createHttpPaymentGateway(config.payments),
    inventoryRepo,
    audit
  );

  const app = createApp({
    config,
    verifier: createTokenVerifier(config.jwt),
    health: { ready: async () => void (await db.one('SELECT 1 AS ok')) },
    routers: [
      accountsRoutes(new AccountsService(db, accounts, audit)),
      inventoryRoutes(inventory),
      ordersRoutes(orders),
      billingRoutes(billing),
      paymentMethodsRoutes(payments),
      usersRoutes(users),
      ticketsRoutes(tickets),
      slaRoutes(sla),
      auditRoutes(new AuditService(audit))
    ]
  });

  const server = createServer(app);
  server.keepAliveTimeout = 65_000;
  server.listen(config.port, () => logger.info('gokinetic-business-api listening', { port: config.port, env: config.env }));

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    const force = setTimeout(() => {
      logger.error('forced shutdown after grace period');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();
    server.close(() => {
      pool
        .end()
        .then(() => process.exit(0))
        .catch((err) => {
          logger.error('error closing database pool', { err });
          process.exit(1);
        });
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('unhandled promise rejection', { err: reason }));
}

main();
```

## apps/gokinetic-business/api/src/test/fixtures.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/test/fixtures.ts`.

```typescript
import { AuthContext } from '../auth/permissions';
import { Db } from '../db/query';
import { AuditEntry, AuditRepository } from '../modules/audit/audit.repository';
import { Service, Site } from '../modules/inventory/inventory.types';

export const ACCOUNT_ID = 'ACC-10000001';
export const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_ID = '33333333-3333-4333-8333-333333333333';
export const SITE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const SITE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export function adminCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: ADMIN_ID,
    email: 'admin@acme.example',
    roles: ['BUSINESS_ADMIN'],
    accountId: ACCOUNT_ID,
    siteScope: null,
    ...overrides
  };
}

export function userCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: USER_ID,
    email: 'user@acme.example',
    roles: ['BUSINESS_USER'],
    accountId: ACCOUNT_ID,
    siteScope: [SITE_A],
    ...overrides
  };
}

export function agentCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: AGENT_ID,
    email: 'agent@uniti.example',
    roles: ['SUPPORT_AGENT'],
    accountId: ACCOUNT_ID,
    siteScope: null,
    ...overrides
  };
}

/** A Db whose transactions simply invoke the callback; repositories are faked separately. */
export function passthroughDb(): Db {
  const db: Db = {
    many: jest.fn(async () => []),
    oneOrNone: jest.fn(async () => null),
    one: jest.fn(async () => {
      throw new Error('not expected in unit test');
    }),
    exec: jest.fn(async () => 0),
    tx: jest.fn(async (fn) => fn(db))
  };
  return db;
}

export interface RecordingAudit extends AuditRepository {
  entries: AuditEntry[];
}

export function recordingAudit(): RecordingAudit {
  const entries: AuditEntry[] = [];
  return {
    entries,
    record: jest.fn(async (entry: AuditEntry) => {
      entries.push(entry);
    }),
    list: jest.fn()
  };
}

export function makeSite(overrides: Partial<Site> = {}): Site {
  return {
    id: SITE_A,
    accountId: ACCOUNT_ID,
    code: 'LDN-01',
    name: 'London HQ',
    addressLine1: '1 Fibre Way',
    addressLine2: null,
    city: 'London',
    postcode: 'EC1A 1BB',
    country: 'GB',
    status: 'ACTIVE',
    costCentreId: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}

export function makeService(overrides: Partial<Service> = {}): Service {
  return {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    accountId: ACCOUNT_ID,
    siteId: SITE_A,
    contractId: null,
    costCentreId: null,
    productCode: 'FTTP-1000',
    productName: 'Business Fibre 1 Gbps',
    category: 'BROADBAND',
    bandwidthMbps: 1000,
    status: 'ACTIVE',
    slaTier: 'ENHANCED',
    monthlyChargeMinor: 12000,
    currency: 'GBP',
    activatedAt: '2024-01-10T00:00:00.000Z',
    ceasedAt: null,
    ...overrides
  };
}
```

## apps/gokinetic-business/api/src/test/ticket-fixtures.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/test/ticket-fixtures.ts`.

```typescript
import { Ticket } from '../modules/tickets/tickets.types';
import { ACCOUNT_ID, USER_ID } from './fixtures';

export function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    accountId: ACCOUNT_ID,
    reference: 'TKT-20240603-ABCDEF',
    category: 'FAULT',
    priority: 'P2',
    status: 'OPEN',
    serviceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    siteId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    subject: 'Line down at HQ',
    description: 'No sync on the ONT since 09:00 this morning.',
    raisedBy: USER_ID,
    contactPhone: null,
    escalationLevel: 0,
    slaTier: 'STANDARD',
    openedAt: '2024-06-03T09:00:00.000Z',
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    pendingSince: null,
    pausedMs: 0,
    responseDueAt: '2024-06-03T11:00:00.000Z',
    resolutionDueAt: '2024-06-04T09:00:00.000Z',
    version: 1,
    ...overrides
  };
}
```

## apps/gokinetic-business/api/src/types/express.d.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/types/express.d.ts`.

```typescript
import { AuthContext } from '../auth/permissions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      auth?: AuthContext;
    }
  }
}

export {};
```

## apps/gokinetic-business/api/tsconfig.build.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/api/tsconfig.build.json`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "exclude": ["src/**/*.test.ts", "src/test/**"]
}
```

## apps/gokinetic-business/api/tsconfig.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/api/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "types": ["node", "jest"]
  },
  "include": ["src/**/*.ts"]
}
```

## apps/gokinetic-business/web/angular.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/web/angular.json`.

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "gokinetic-business-web": {
      "projectType": "application",
      "schematics": {
        "@schematics/angular:component": { "style": "scss", "standalone": true, "changeDetection": "OnPush" }
      },
      "root": "",
      "sourceRoot": "src",
      "prefix": "gkb",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist/gokinetic-business-web",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "inlineStyleLanguage": "scss",
            "assets": [],
            "styles": ["src/styles.scss"]
          },
          "configurations": {
            "production": {
              "budgets": [
                { "type": "initial", "maximumWarning": "500kb", "maximumError": "1mb" },
                { "type": "anyComponentStyle", "maximumWarning": "4kb", "maximumError": "8kb" }
              ],
              "outputHashing": "all"
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true,
              "fileReplacements": [
                { "replace": "src/environments/environment.ts", "with": "src/environments/environment.development.ts" }
              ]
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "configurations": {
            "production": { "buildTarget": "gokinetic-business-web:build:production" },
            "development": { "buildTarget": "gokinetic-business-web:build:development" }
          },
          "defaultConfiguration": "development"
        },
        "test": {
          "builder": "@angular-devkit/build-angular:karma",
          "options": {
            "polyfills": ["zone.js", "zone.js/testing"],
            "tsConfig": "tsconfig.spec.json",
            "karmaConfig": "karma.conf.js",
            "inlineStyleLanguage": "scss",
            "styles": ["src/styles.scss"]
          }
        }
      }
    }
  }
}
```

## apps/gokinetic-business/web/karma.conf.js

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: javascript. Path: `apps/gokinetic-business/web/karma.conf.js`.

```javascript
// Karma configuration for the Angular CLI test builder.
module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: { random: true },
      clearContext: false
    },
    jasmineHtmlReporter: { suppressAll: true },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/gokinetic-business-web'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }, { type: 'lcovonly' }],
      check: { global: { statements: 70, branches: 60, functions: 70, lines: 70 } }
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['Chrome'],
    customLaunchers: {
      ChromeHeadlessCI: { base: 'ChromeHeadless', flags: ['--no-sandbox'] }
    },
    restartOnFileChange: true
  });
};
```

## apps/gokinetic-business/web/package.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/web/package.json`.

```json
{
  "name": "@uniti/gokinetic-business-web",
  "version": "1.0.0",
  "private": true,
  "description": "Go Kinetic Business self-care portal (Angular 17)",
  "scripts": {
    "start": "ng serve --proxy-config proxy.conf.json",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "ng test",
    "test:ci": "ng test --watch=false --browsers=ChromeHeadlessCI --code-coverage"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "@angular/animations": "^17.3.0",
    "@angular/common": "^17.3.0",
    "@angular/compiler": "^17.3.0",
    "@angular/core": "^17.3.0",
    "@angular/forms": "^17.3.0",
    "@angular/platform-browser": "^17.3.0",
    "@angular/platform-browser-dynamic": "^17.3.0",
    "@angular/router": "^17.3.0",
    "rxjs": "~7.8.1",
    "tslib": "^2.6.2",
    "zone.js": "~0.14.4"
  },
  "devDependencies": {
    "@angular-devkit/build-angular": "^17.3.0",
    "@angular/cli": "^17.3.0",
    "@angular/compiler-cli": "^17.3.0",
    "@types/jasmine": "~5.1.4",
    "jasmine-core": "~5.1.2",
    "karma": "~6.4.3",
    "karma-chrome-launcher": "~3.2.0",
    "karma-coverage": "~2.2.1",
    "karma-jasmine": "~5.1.0",
    "karma-jasmine-html-reporter": "~2.1.0",
    "typescript": "~5.4.5"
  }
}
```

## apps/gokinetic-business/web/proxy.conf.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/web/proxy.conf.json`.

```json
{
  "/api": {
    "target": "http://localhost:8080",
    "secure": false,
    "changeOrigin": true,
    "logLevel": "warn"
  }
}
```

## apps/gokinetic-business/web/src/app/app.config.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/app.config.ts`.

```typescript
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, Injectable } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling, RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { ApiProblem } from './core/http/api-problem';
import { authInterceptor, correlationIdInterceptor, problemInterceptor } from './core/http/interceptors';

@Injectable({ providedIn: 'root' })
export class PortalTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · Go Kinetic Business` : 'Go Kinetic Business');
  }
}

/** Handled API problems are shown inline by components; only genuinely unexpected errors are logged. */
@Injectable()
export class PortalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const err = (error as { rejection?: unknown })?.rejection ?? error;
    if (err instanceof ApiProblem) return;
    console.error('Unhandled client error', err);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // Order matters: the problem mapper runs innermost so it sees raw HttpErrorResponses.
    provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
    { provide: TitleStrategy, useClass: PortalTitleStrategy },
    { provide: ErrorHandler, useClass: PortalErrorHandler }
  ]
};
```
