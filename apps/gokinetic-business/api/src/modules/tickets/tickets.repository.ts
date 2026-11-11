import { Db, WhereBuilder } from '../../db/query';
import { ConflictError } from '../../lib/errors';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { SlaTier } from '../inventory/inventory.types';
import { TicketPriority } from '../sla/sla.policy';
import { Ticket, TicketCategory, TicketEvent, TicketEventKind, TicketStatus } from './tickets.types';

interface TicketRow {
  id: string;
  account_id: string;
  reference: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  service_id: string | null;
  site_id: string | null;
  subject: string;
  description: string;
  raised_by: string;
  contact_phone: string | null;
  escalation_level: number;
  sla_tier: SlaTier;
  opened_at: Date;
  first_response_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  pending_since: Date | null;
  paused_ms: string;
  response_due_at: Date;
  resolution_due_at: Date;
  version: number;
  total?: string;
}

interface EventRow {
  id: string;
  ticket_id: string;
  kind: TicketEventKind;
  author_id: string | null;
  body: string | null;
  from_value: string | null;
  to_value: string | null;
  internal: boolean;
  created_at: Date;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    accountId: r.account_id,
    reference: r.reference,
    category: r.category,
    priority: r.priority,
    status: r.status,
    serviceId: r.service_id,
    siteId: r.site_id,
    subject: r.subject,
    description: r.description,
    raisedBy: r.raised_by,
    contactPhone: r.contact_phone,
    escalationLevel: r.escalation_level,
    slaTier: r.sla_tier,
    openedAt: r.opened_at.toISOString(),
    firstResponseAt: iso(r.first_response_at),
    resolvedAt: iso(r.resolved_at),
    closedAt: iso(r.closed_at),
    pendingSince: iso(r.pending_since),
    pausedMs: Number(r.paused_ms),
    responseDueAt: r.response_due_at.toISOString(),
    resolutionDueAt: r.resolution_due_at.toISOString(),
    version: r.version
  };
}

function toEvent(r: EventRow): TicketEvent {
  return {
    id: Number(r.id),
    ticketId: r.ticket_id,
    kind: r.kind,
    authorId: r.author_id,
    body: r.body,
    fromValue: r.from_value,
    toValue: r.to_value,
    internal: r.internal,
    createdAt: r.created_at.toISOString()
  };
}

export interface TicketFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  siteId?: string;
  search?: string;
  /** Only tickets still being worked (OPEN, IN_PROGRESS, PENDING_CUSTOMER). */
  activeOnly?: boolean;
  siteIds: string[] | null;
}

export type NewTicket = Omit<
  Ticket,
  'id' | 'status' | 'escalationLevel' | 'firstResponseAt' | 'resolvedAt' | 'closedAt' | 'pendingSince' | 'pausedMs' | 'version'
>;

export type TicketPatch = Partial<
  Pick<
    Ticket,
    | 'status'
    | 'priority'
    | 'escalationLevel'
    | 'firstResponseAt'
    | 'resolvedAt'
    | 'closedAt'
    | 'pendingSince'
    | 'pausedMs'
    | 'responseDueAt'
    | 'resolutionDueAt'
  >
>;

export interface NewTicketEvent {
  ticketId: string;
  kind: TicketEventKind;
  authorId: string | null;
  body?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  internal?: boolean;
}

export interface TicketsRepository {
  list(accountId: string, filter: TicketFilter, page: PageRequest): Promise<Page<Ticket>>;
  find(accountId: string, ticketId: string, db?: Db): Promise<Ticket | null>;
  findOpenFaultForService(accountId: string, serviceId: string, db?: Db): Promise<Ticket | null>;
  insert(ticket: NewTicket, db: Db): Promise<Ticket>;
  /** Applies a patch only if the stored version matches; bumps the version. */
  update(ticketId: string, expectedVersion: number, patch: TicketPatch, db: Db): Promise<Ticket>;
  addEvent(event: NewTicketEvent, db: Db): Promise<TicketEvent>;
  events(ticketId: string, includeInternal: boolean): Promise<TicketEvent[]>;
  lastEventAt(ticketId: string, kind: TicketEventKind, db?: Db): Promise<Date | null>;
}

/** Column names for patchable fields; keeps the dynamic UPDATE free of user-controlled identifiers. */
const PATCH_COLUMNS: Record<keyof TicketPatch, string> = {
  status: 'status',
  priority: 'priority',
  escalationLevel: 'escalation_level',
  firstResponseAt: 'first_response_at',
  resolvedAt: 'resolved_at',
  closedAt: 'closed_at',
  pendingSince: 'pending_since',
  pausedMs: 'paused_ms',
  responseDueAt: 'response_due_at',
  resolutionDueAt: 'resolution_due_at'
};

export function createTicketsRepository(defaultDb: Db): TicketsRepository {
  return {
    async list(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('status = ?', filter.status)
        .add('priority = ?', filter.priority)
        .add('category = ?', filter.category)
        .add('site_id = ?', filter.siteId);
      if (filter.activeOnly) where.addRaw(`status IN ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER')`);
      if (filter.search) {
        const p = where.nextParam(`%${filter.search.toLowerCase()}%`);
        where.addRaw(`(lower(subject) LIKE ${p} OR lower(reference) LIKE ${p})`);
      }
      // Site-scoped users also see account-level tickets that are not tied to a site.
      if (filter.siteIds) where.addRaw(`(site_id IS NULL OR site_id = ANY(${where.nextParam(filter.siteIds)}::uuid[]))`);
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<TicketRow>(
        `SELECT *, count(*) OVER() AS total FROM tickets ${where.toSql()}
          ORDER BY CASE WHEN status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END, priority, opened_at DESC
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toTicket), page, rows.length ? Number(rows[0].total) : 0);
    },

    async find(accountId, ticketId, db = defaultDb) {
      const row = await db.oneOrNone<TicketRow>('SELECT * FROM tickets WHERE account_id = $1 AND id = $2', [
        accountId,
        ticketId
      ]);
      return row ? toTicket(row) : null;
    },

    async findOpenFaultForService(accountId, serviceId, db = defaultDb) {
      const row = await db.oneOrNone<TicketRow>(
        `SELECT * FROM tickets
          WHERE account_id = $1 AND service_id = $2 AND category = 'FAULT'
            AND status IN ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER')
          ORDER BY opened_at DESC LIMIT 1`,
        [accountId, serviceId]
      );
      return row ? toTicket(row) : null;
    },

    async insert(t, db) {
      const row = await db.one<TicketRow>(
        `INSERT INTO tickets (account_id, reference, category, priority, status, service_id, site_id, subject, description,
                              raised_by, contact_phone, sla_tier, opened_at, response_due_at, resolution_due_at)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          t.accountId,
          t.reference,
          t.category,
          t.priority,
          t.serviceId,
          t.siteId,
          t.subject,
          t.description,
          t.raisedBy,
          t.contactPhone,
          t.slaTier,
          t.openedAt,
          t.responseDueAt,
          t.resolutionDueAt
        ]
      );
      return toTicket(row);
    },

    async update(ticketId, expectedVersion, patch, db) {
      const sets: string[] = [];
      const params: unknown[] = [ticketId, expectedVersion];
      for (const [key, column] of Object.entries(PATCH_COLUMNS) as Array<[keyof TicketPatch, string]>) {
        if (!(key in patch)) continue;
        params.push(patch[key] ?? null);
        sets.push(`${column} = $${params.length}`);
      }
      sets.push('version = version + 1');
      const row = await db.oneOrNone<TicketRow>(
        `UPDATE tickets SET ${sets.join(', ')} WHERE id = $1 AND version = $2 RETURNING *`,
        params
      );
      if (!row) {
        throw new ConflictError('The ticket was changed by someone else; reload and try again', { ticketId });
      }
      return toTicket(row);
    },

    async addEvent(e, db) {
      const row = await db.one<EventRow>(
        `INSERT INTO ticket_events (ticket_id, kind, author_id, body, from_value, to_value, internal)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [e.ticketId, e.kind, e.authorId, e.body ?? null, e.fromValue ?? null, e.toValue ?? null, e.internal ?? false]
      );
      return toEvent(row);
    },

    async events(ticketId, includeInternal) {
      const rows = await defaultDb.many<EventRow>(
        `SELECT * FROM ticket_events WHERE ticket_id = $1 AND ($2::boolean OR internal = false) ORDER BY created_at, id`,
        [ticketId, includeInternal]
      );
      return rows.map(toEvent);
    },

    async lastEventAt(ticketId, kind, db = defaultDb) {
      const row = await db.oneOrNone<{ at: Date | null }>(
        'SELECT max(created_at) AS at FROM ticket_events WHERE ticket_id = $1 AND kind = $2',
        [ticketId, kind]
      );
      return row?.at ?? null;
    }
  };
}
