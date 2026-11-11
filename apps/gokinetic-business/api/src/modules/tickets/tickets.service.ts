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
import { actorFor, assertTicketShape, statusTransitionPatch } from './ticket-rules';
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

// Re-exported so existing imports from this module keep working.
export { assertTicketShape, statusTransitionPatch };

export interface TicketNotifier {
  ticketUpdated(ticket: Ticket, event: TicketEvent): Promise<void>;
}

export interface TicketDetailWithActions extends TicketDetail {
  allowedStatuses: TicketStatus[];
}

/** Where a new ticket points and which SLA tier applies. */
interface TicketTarget {
  siteId: string | null;
  tier: SlaTier;
  serviceStatus: string | null;
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
    const target = await this.resolveTarget(ctx, input);
    assertTicketShape(input, target.serviceStatus);

    const due = computeDueDates(target.tier, input.priority, now);
    return this.db.tx(async (tx) => {
      await this.assertNoOpenFault(ctx, input, tx);
      const ticket = await this.repo.insert(
        {
          accountId: ctx.accountId,
          reference: newReference('TKT', now),
          category: input.category,
          priority: input.priority,
          serviceId: input.serviceId ?? null,
          siteId: target.siteId,
          subject: input.subject,
          description: input.description,
          raisedBy: ctx.userId,
          contactPhone: input.contactPhone ?? null,
          slaTier: target.tier,
          openedAt: now.toISOString(),
          responseDueAt: due.responseDueAt.toISOString(),
          resolutionDueAt: due.resolutionDueAt.toISOString()
        },
        tx
      );
      const details = { reference: ticket.reference, category: ticket.category, priority: ticket.priority };
      await this.recordAudit(ctx, 'ticket.created', ticket.id, details, tx);
      return { ...ticket, sla: slaView(ticket, now) };
    });
  }

  async comment(ctx: AuthContext, ticketId: string, input: { body: string; internal: boolean; version: number }): Promise<TicketView> {
    const actor = actorFor(ctx);
    if (input.internal && actor !== 'agent') throw new ForbiddenError('Only support agents can add internal notes');
    const now = this.clock.now();

    const change = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      if (current.status === 'CLOSED') {
        throw new BusinessRuleError('ticket-closed', 'Closed tickets cannot receive comments; raise a new ticket instead');
      }
      const event = await this.repo.addEvent(
        { ticketId: current.id, kind: 'COMMENT', authorId: ctx.userId, body: input.body, internal: input.internal },
        tx
      );
      const patch = await this.commentPatch(ctx, current, actor, input.internal, now, tx);
      const ticket = await this.repo.update(current.id, current.version, patch, tx);
      return { ticket, event };
    });

    if (!change.event.internal) await this.notifySafely(change.ticket, change.event);
    return { ...change.ticket, sla: slaView(change.ticket, now) };
  }

  async changeStatus(ctx: AuthContext, ticketId: string, input: { status: TicketStatus; reason?: string; version: number }): Promise<TicketView> {
    const actor = actorFor(ctx);
    const now = this.clock.now();

    const change = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      assertTicketTransition(current.status, input.status, actor);
      this.assertReopenAllowed(current, input.status, actor, now);

      const patch = statusTransitionPatch(current, input.status, actor, now);
      const ticket = await this.repo.update(current.id, current.version, patch, tx);
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
      const details = { from: current.status, to: input.status, reason: input.reason ?? null };
      await this.recordAudit(ctx, `ticket.${input.status.toLowerCase()}`, current.id, details, tx);
      return { ticket, event };
    });

    await this.notifySafely(change.ticket, change.event);
    return { ...change.ticket, sla: slaView(change.ticket, now) };
  }

  /**
   * Raises the escalation level by one. Customers may escalate once half of the resolution
   * target has elapsed (immediately for P1); escalations are rate-limited per ticket.
   */
  async escalate(ctx: AuthContext, ticketId: string, input: { reason: string; version: number }): Promise<TicketView> {
    const actor = actorFor(ctx);
    const now = this.clock.now();

    const change = await this.db.tx(async (tx) => {
      const current = await this.requireTicket(ctx, ticketId, tx);
      this.assertVersion(current, input.version);
      const consumed = resolutionConsumedBps(current, now);
      await this.assertCanEscalate(current, actor, consumed, now, tx);

      // Never escalate below the level the SLA position already implies.
      const wanted = Math.max(current.escalationLevel + 1, automaticEscalationLevel(consumed));
      const level = Math.min(MAX_ESCALATION_LEVEL, wanted);
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
      await this.recordAudit(ctx, 'ticket.escalated', current.id, { level, reason: input.reason }, tx);
      return { ticket, event };
    });

    await this.notifySafely(change.ticket, change.event);
    return { ...change.ticket, sla: slaView(change.ticket, now) };
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
        {
          ticketId: current.id,
          kind: 'PRIORITY_CHANGE',
          authorId: ctx.userId,
          body: input.reason,
          fromValue: current.priority,
          toValue: input.priority,
          internal: true
        },
        tx
      );
      await this.recordAudit(ctx, 'ticket.reprioritised', current.id, { from: current.priority, to: input.priority }, tx);
      return updated;
    });
    return { ...ticket, sla: slaView(ticket, now) };
  }

  /** Works out the site and SLA tier for a new ticket from its service or site. */
  private async resolveTarget(ctx: AuthContext, input: NewTicketInput): Promise<TicketTarget> {
    const siteId = input.siteId ?? null;

    if (input.serviceId) {
      const service = await this.inventory.findService(ctx.accountId, input.serviceId);
      if (!service || !canAccessSite(ctx, service.siteId)) throw new NotFoundError('Service', input.serviceId);
      if (siteId && siteId !== service.siteId) {
        throw new BusinessRuleError('service-site-mismatch', 'The service does not belong to the selected site');
      }
      if (service.status === 'CEASED') {
        throw new BusinessRuleError('service-ceased', 'Tickets cannot be raised against a ceased service');
      }
      return { siteId: service.siteId, tier: service.slaTier, serviceStatus: service.status };
    }

    if (siteId) {
      const site = await this.inventory.findSite(ctx.accountId, siteId);
      if (!site || !canAccessSite(ctx, siteId)) throw new NotFoundError('Site', siteId);
    }
    const account = await this.accounts.get(ctx.accountId);
    return { siteId, tier: account.slaTier, serviceStatus: null };
  }

  /** Only one fault may be open per service at a time. */
  private async assertNoOpenFault(ctx: AuthContext, input: NewTicketInput, tx: Db): Promise<void> {
    if (input.category !== 'FAULT' || !input.serviceId) return;
    const duplicate = await this.repo.findOpenFaultForService(ctx.accountId, input.serviceId, tx);
    if (!duplicate) return;
    throw new ConflictError(`Fault ${duplicate.reference} is already open for this service`, {
      ticketId: duplicate.id,
      reference: duplicate.reference
    });
  }

  /** Patch applied alongside a comment (customer reply or first agent response). */
  private async commentPatch(
    ctx: AuthContext,
    current: Ticket,
    actor: TicketActor,
    internal: boolean,
    now: Date,
    tx: Db
  ): Promise<TicketPatch> {
    if (actor === 'customer' && current.status === 'PENDING_CUSTOMER') {
      // A customer reply hands the ticket back to the agent and restarts the clock.
      await this.repo.addEvent(
        { ticketId: current.id, kind: 'STATUS_CHANGE', authorId: ctx.userId, fromValue: current.status, toValue: 'IN_PROGRESS' },
        tx
      );
      return statusTransitionPatch(current, 'IN_PROGRESS', actor, now);
    }
    if (actor === 'agent' && !internal && !current.firstResponseAt) {
      return { firstResponseAt: now.toISOString() };
    }
    return {};
  }

  /** Customers can only reopen a resolved ticket within the reopen window. */
  private assertReopenAllowed(current: Ticket, to: TicketStatus, actor: TicketActor, now: Date): void {
    if (actor !== 'customer' || current.status !== 'RESOLVED' || to !== 'IN_PROGRESS') return;
    const resolvedAgoMs = now.getTime() - new Date(current.resolvedAt ?? current.openedAt).getTime();
    if (resolvedAgoMs > REOPEN_WINDOW_DAYS * MS_PER_DAY) {
      throw new BusinessRuleError('reopen-window-closed', `Tickets can only be reopened within ${REOPEN_WINDOW_DAYS} days of resolution`);
    }
  }

  private async assertCanEscalate(current: Ticket, actor: TicketActor, consumed: number, now: Date, tx: Db): Promise<void> {
    if (current.status === 'RESOLVED' || current.status === 'CLOSED') {
      throw new BusinessRuleError('ticket-not-active', 'Only active tickets can be escalated');
    }
    if (current.escalationLevel >= MAX_ESCALATION_LEVEL) {
      throw new BusinessRuleError('max-escalation', 'This ticket is already at the highest escalation level');
    }
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
  }

  private async recordAudit(ctx: AuthContext, action: string, ticketId: string, details: Record<string, unknown>, tx: Db): Promise<void> {
    await this.audit.record(
      { accountId: ctx.accountId, actorId: ctx.userId, action, entity: 'ticket', entityId: ticketId, details },
      tx
    );
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
