import { Db } from '../../db/query';
import { TicketPriority } from './sla.policy';
import { OutageWindow } from './sla.availability';

export interface PriorityCompliance {
  priority: TicketPriority;
  resolvedCount: number;
  responseMetCount: number;
  resolutionMetCount: number;
}

interface OutageRow {
  service_id: string;
  started_at: Date;
  ended_at: Date | null;
  planned: boolean;
}

interface ComplianceRow {
  priority: TicketPriority;
  resolved_count: string;
  response_met: string;
  resolution_met: string;
}

export interface SlaRepository {
  /** Outages for the account's services overlapping [start, end). */
  outages(accountId: string, start: Date, end: Date, siteIds: string[] | null): Promise<OutageWindow[]>;
  /** Ticket SLA outcomes for tickets resolved within [start, end). */
  ticketCompliance(accountId: string, start: Date, end: Date, siteIds: string[] | null): Promise<PriorityCompliance[]>;
}

export function createSlaRepository(db: Db): SlaRepository {
  return {
    async outages(accountId, start, end, siteIds) {
      const rows = await db.many<OutageRow>(
        `SELECT o.service_id, o.started_at, o.ended_at, o.planned
           FROM service_outages o
           JOIN services s ON s.id = o.service_id
          WHERE s.account_id = $1
            AND o.started_at < $3
            AND (o.ended_at IS NULL OR o.ended_at > $2)
            AND ($4::uuid[] IS NULL OR s.site_id = ANY($4::uuid[]))
          ORDER BY o.started_at`,
        [accountId, start, end, siteIds]
      );
      return rows.map((r) => ({ serviceId: r.service_id, startedAt: r.started_at, endedAt: r.ended_at, planned: r.planned }));
    },

    async ticketCompliance(accountId, start, end, siteIds) {
      const rows = await db.many<ComplianceRow>(
        `SELECT priority,
                count(*) AS resolved_count,
                count(*) FILTER (WHERE first_response_at IS NOT NULL AND first_response_at <= response_due_at) AS response_met,
                count(*) FILTER (WHERE resolved_at <= resolution_due_at) AS resolution_met
           FROM tickets
          WHERE account_id = $1
            AND resolved_at >= $2 AND resolved_at < $3
            AND ($4::uuid[] IS NULL OR site_id IS NULL OR site_id = ANY($4::uuid[]))
          GROUP BY priority
          ORDER BY priority`,
        [accountId, start, end, siteIds]
      );
      return rows.map((r) => ({
        priority: r.priority,
        resolvedCount: Number(r.resolved_count),
        responseMetCount: Number(r.response_met),
        resolutionMetCount: Number(r.resolution_met)
      }));
    }
  };
}
