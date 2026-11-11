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
