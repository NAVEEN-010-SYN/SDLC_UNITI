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
