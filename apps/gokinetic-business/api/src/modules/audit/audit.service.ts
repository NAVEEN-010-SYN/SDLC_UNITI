import { AuthContext } from '../../auth/permissions';
import { BusinessRuleError } from '../../lib/errors';
import { Page, PageRequest, mapPage } from '../../lib/pagination';
import { AuditRecord, AuditRepository } from './audit.repository';

export interface AuditView extends AuditRecord {
  summary: string;
}

export interface AuditFilter {
  entity?: string;
  actorId?: string;
}

/** CSV exports are capped to keep the request inside the statement timeout. */
export const MAX_EXPORT_ROWS = 5_000;
const EXPORT_PAGE_SIZE = 100;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/**
 * Human-readable one-liners for the portal's activity log. Unknown actions fall back to
 * the raw action name so new events are visible before a description is added here.
 */
const DESCRIBERS: Record<string, (d: Record<string, unknown>) => string> = {
  'user.invited': (d) => `Invited a user as ${str(d.role)}`,
  'user.reinvited': (d) => `Re-invited a previously deactivated user as ${str(d.role)}`,
  'user.role_changed': (d) => {
    const from = d.from as { role?: string } | undefined;
    const to = d.to as { role?: string } | undefined;
    return `Changed a user's role from ${str(from?.role)} to ${str(to?.role)}`;
  },
  'user.suspended': () => 'Suspended a user',
  'user.reactivated': () => 'Reactivated a user',
  'user.deactivated': () => 'Deactivated a user',
  'user.invitation_resent': () => 'Re-sent a user invitation',
  'site.created': (d) => `Created site ${str(d.code)}`,
  'site.updated': () => 'Updated site details',
  'site.decommissioned': () => 'Decommissioned a site',
  'order.created': (d) => `Created ${str(d.type)} order ${str(d.reference)}`,
  'order.bulk_created': (d) => `Created bulk order ${str(d.reference)} with ${str(d.itemCount)} item(s)`,
  'invoice.disputed': (d) => `Disputed invoice ${str(d.number)}`,
  'cost_centre.created': (d) => `Created cost centre ${str(d.code)}`,
  'cost_centre.updated': () => 'Updated a cost centre',
  'cost_centre.split_updated': () => 'Changed a site cost split',
  'ticket.created': (d) => `Raised ${str(d.priority)} ${str(d.category)} ticket ${str(d.reference)}`,
  'ticket.escalated': (d) => `Escalated a ticket to level ${str(d.level)}`,
  'ticket.reprioritised': (d) => `Changed ticket priority from ${str(d.from)} to ${str(d.to)}`,
  'account.approval_threshold_changed': () => 'Changed the order approval threshold',
  'payment_method.added': (d) => `Added a ${str(d.kind) === 'CARD' ? 'card' : 'Direct Debit'} ending ${str(d.last4)}`,
  'payment_method.removed': (d) => `Removed a payment method ending ${str(d.last4)}`,
  'payment_method.default_changed': (d) => `Made the payment method ending ${str(d.last4)} the default`
};

export function describeAuditEntry(record: Pick<AuditRecord, 'action' | 'details'>): string {
  const describer = DESCRIBERS[record.action];
  if (describer) return describer(record.details ?? {});
  const [entity, verb] = record.action.split('.');
  if (entity === 'order' && verb) return `Moved an order to ${verb.toUpperCase()}`;
  if (entity === 'ticket' && verb) return `Moved a ticket to ${verb.toUpperCase().replace(/_/g, ' ')}`;
  return record.action;
}

/** RFC 4180 field escaping, plus a guard against spreadsheet formula injection. */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function auditToCsv(rows: AuditView[]): string {
  const header = ['timestamp', 'actor_id', 'action', 'entity', 'entity_id', 'summary', 'correlation_id'];
  const lines = rows.map((r) =>
    [r.createdAt, r.actorId ?? '', r.action, r.entity, r.entityId, r.summary, r.correlationId ?? ''].map(csvField).join(',')
  );
  return [header.join(','), ...lines].join('\r\n') + '\r\n';
}

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  async list(ctx: AuthContext, filter: AuditFilter, page: PageRequest): Promise<Page<AuditView>> {
    const result = await this.repo.list(ctx.accountId, filter, page);
    return mapPage(result, (r) => ({ ...r, summary: describeAuditEntry(r) }));
  }

  async exportCsv(ctx: AuthContext, filter: AuditFilter): Promise<{ filename: string; body: string }> {
    const rows: AuditView[] = [];
    for (let page = 1; rows.length < MAX_EXPORT_ROWS; page++) {
      const result = await this.list(ctx, filter, { page, pageSize: EXPORT_PAGE_SIZE });
      rows.push(...result.items);
      if (page === 1 && result.total > MAX_EXPORT_ROWS) {
        throw new BusinessRuleError('export-too-large', `Narrow the filter: exports are limited to ${MAX_EXPORT_ROWS} rows`, {
          total: result.total
        });
      }
      if (result.items.length < EXPORT_PAGE_SIZE) break;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `audit-${ctx.accountId}-${stamp}.csv`, body: auditToCsv(rows) };
  }
}
