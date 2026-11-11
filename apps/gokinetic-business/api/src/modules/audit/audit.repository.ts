import { Db } from '../../db/query';
import { currentCorrelationId } from '../../lib/logger';
import { PageRequest, Page, pageOf, toLimitOffset } from '../../lib/pagination';

export interface AuditEntry {
  accountId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export interface AuditRecord extends Required<AuditEntry> {
  id: number;
  correlationId: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  account_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  details: Record<string, unknown>;
  correlation_id: string | null;
  created_at: Date;
  total?: string;
}

export interface AuditRepository {
  record(entry: AuditEntry, db?: Db): Promise<void>;
  list(accountId: string, filter: { entity?: string; actorId?: string }, page: PageRequest): Promise<Page<AuditRecord>>;
}

export function createAuditRepository(defaultDb: Db): AuditRepository {
  return {
    async record(entry, db = defaultDb) {
      await db.exec(
        `INSERT INTO audit_log (account_id, actor_id, action, entity, entity_id, details, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          entry.accountId,
          entry.actorId,
          entry.action,
          entry.entity,
          entry.entityId,
          JSON.stringify(entry.details ?? {}),
          currentCorrelationId() ?? null
        ]
      );
    },

    async list(accountId, filter, page) {
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<AuditRow>(
        `SELECT *, count(*) OVER() AS total FROM audit_log
          WHERE account_id = $1
            AND ($2::text IS NULL OR entity = $2)
            AND ($3::uuid IS NULL OR actor_id = $3)
          ORDER BY created_at DESC
          LIMIT $4 OFFSET $5`,
        [accountId, filter.entity ?? null, filter.actorId ?? null, limit, offset]
      );
      const total = rows.length ? Number(rows[0].total) : 0;
      return pageOf(
        rows.map((r) => ({
          id: Number(r.id),
          accountId: r.account_id,
          actorId: r.actor_id,
          action: r.action,
          entity: r.entity,
          entityId: r.entity_id,
          details: r.details,
          correlationId: r.correlation_id,
          createdAt: r.created_at.toISOString()
        })),
        page,
        total
      );
    }
  };
}
