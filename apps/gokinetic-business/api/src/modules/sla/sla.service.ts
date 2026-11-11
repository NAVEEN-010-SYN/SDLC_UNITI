import { AuthContext, siteFilterFor } from '../../auth/permissions';
import { BusinessRuleError } from '../../lib/errors';
import { Clock, parsePeriod, systemClock } from '../../lib/dates';
import { CurrencyCode, Money, sum } from '../../lib/money';
import { AccountsRepository } from '../accounts/accounts.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { SlaTier } from '../inventory/inventory.types';
import { ServiceAvailability, serviceAvailability } from './sla.availability';
import { AvailabilityPolicy, TicketPriority, TicketSlaTarget, availabilityPolicy, ticketTarget } from './sla.policy';
import { PriorityCompliance, SlaRepository } from './sla.repository';

/** Reports older than this are archived and served from the documents store instead. */
export const SLA_REPORT_LOOKBACK_MONTHS = 24;

export interface ComplianceSummary extends PriorityCompliance {
  responseMetBps: number | null;
  resolutionMetBps: number | null;
}

export interface SlaReport {
  period: string;
  /** True while the period is still running; figures may change until month end. */
  provisional: boolean;
  generatedAt: string;
  services: ServiceAvailability[];
  servicesMeasured: number;
  servicesBreached: number;
  /** Availability weighted by measured minutes across all services, in thousandths of a percent. */
  overallAvailabilityMilliPct: number | null;
  totalCredit: Money;
  tickets: ComplianceSummary[];
}

export interface SlaPolicyView {
  tier: SlaTier;
  availability: AvailabilityPolicy;
  tickets: Record<TicketPriority, TicketSlaTarget>;
}

const PRIORITIES: TicketPriority[] = ['P1', 'P2', 'P3', 'P4'];

const ratioBps = (part: number, whole: number): number | null => (whole === 0 ? null : Math.floor((part * 10_000) / whole));

export function summariseCompliance(rows: PriorityCompliance[]): ComplianceSummary[] {
  return rows.map((r) => ({
    ...r,
    responseMetBps: ratioBps(r.responseMetCount, r.resolvedCount),
    resolutionMetBps: ratioBps(r.resolutionMetCount, r.resolvedCount)
  }));
}

export function weightedAvailability(services: ServiceAvailability[]): number | null {
  const measured = services.reduce((acc, s) => acc + s.measuredMinutes, 0);
  if (measured === 0) return null;
  const down = services.reduce((acc, s) => acc + s.downtimeMinutes, 0);
  return Math.floor(((measured - down) * 100_000) / measured);
}

function monthsBack(period: string, now: Date): number {
  const { year, month } = parsePeriod(period);
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

export class SlaService {
  constructor(
    private readonly repo: SlaRepository,
    private readonly inventory: InventoryRepository,
    private readonly accounts: AccountsRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async monthlyReport(ctx: AuthContext, period: string): Promise<SlaReport> {
    const now = this.clock.now();
    const age = monthsBack(period, now);
    if (age < 0) throw new BusinessRuleError('future-period', 'SLA reports are not available for future periods');
    if (age > SLA_REPORT_LOOKBACK_MONTHS) {
      throw new BusinessRuleError('period-archived', `Online SLA reports cover the last ${SLA_REPORT_LOOKBACK_MONTHS} months`);
    }

    const { start, end } = parsePeriod(period);
    const scope = siteFilterFor(ctx);
    const [account, services, outages, compliance] = await Promise.all([
      this.accounts.get(ctx.accountId),
      this.inventory.allServices(ctx.accountId, scope),
      this.repo.outages(ctx.accountId, start, end, scope),
      this.repo.ticketCompliance(ctx.accountId, start, end, scope)
    ]);

    const measured = services
      .map((svc) => serviceAvailability(svc, outages, start, end, now))
      .filter((s): s is ServiceAvailability => s !== null)
      .sort((a, b) => a.availabilityMilliPct - b.availabilityMilliPct);

    return {
      period,
      provisional: age === 0,
      generatedAt: now.toISOString(),
      services: measured,
      servicesMeasured: measured.length,
      servicesBreached: measured.filter((s) => !s.met).length,
      overallAvailabilityMilliPct: weightedAvailability(measured),
      totalCredit: sum(measured.map((s) => s.credit), account.currency as CurrencyCode),
      tickets: summariseCompliance(compliance)
    };
  }

  async policy(ctx: AuthContext): Promise<SlaPolicyView> {
    const { slaTier } = await this.accounts.get(ctx.accountId);
    const tickets = Object.fromEntries(PRIORITIES.map((p) => [p, ticketTarget(slaTier, p)])) as Record<TicketPriority, TicketSlaTarget>;
    return { tier: slaTier, availability: availabilityPolicy(slaTier), tickets };
  }
}
