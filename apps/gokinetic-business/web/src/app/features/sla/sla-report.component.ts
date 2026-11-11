import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, startWith, switchMap } from 'rxjs';
import { AccountApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { SlaReport } from '../../core/models/api.models';
import { MoneyPipe, PercentPipe } from '../../shared/money.pipe';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';

/** The most recent `count` periods (YYYY-MM), newest first, including the current month. */
export function selectablePeriods(now: Date, count = 24): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

type ReportState = { report: SlaReport | null; problem: ApiProblem | null; loading: boolean };

@Component({
  selector: 'gkb-sla-report',
  standalone: true,
  imports: [MoneyPipe, PercentPipe, DatePipe, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>SLA report</h1>
      <label>Period
        <select [value]="period()" (change)="period.set($any($event.target).value)">
          @for (p of periods; track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </label>
    </header>
    <gkb-problem-alert [problem]="state().problem" />
    @if (state().loading) { <p>Loading report\u2026</p> }
    @if (state().report; as r) {
      @if (r.provisional) { <p class="alert alert--info">This month is still in progress; figures are provisional until month end.</p> }
      <div class="tiles">
        <div class="tile"><span class="tile__label">Overall availability</span><span class="tile__value">{{ r.overallAvailabilityMilliPct | pct }}</span></div>
        <div class="tile"><span class="tile__label">Services measured</span><span class="tile__value">{{ r.servicesMeasured }}</span></div>
        <div class="tile" [class.tile--alert]="r.servicesBreached > 0"><span class="tile__label">Below target</span><span class="tile__value">{{ r.servicesBreached }}</span></div>
        <div class="tile"><span class="tile__label">Service credits due</span><span class="tile__value">{{ r.totalCredit.amountMinor | money: r.totalCredit.currency }}</span></div>
      </div>

      <h2>Availability by service</h2>
      <table class="table">
        <thead><tr><th>Service</th><th>Tier</th><th class="num">Availability</th><th class="num">Target</th><th class="num">Downtime</th><th class="num">Planned</th><th class="num">Credit</th></tr></thead>
        <tbody>
          @for (s of r.services; track s.serviceId) {
            <tr [class.row--alert]="!s.met">
              <td>{{ s.productName }}</td><td>{{ s.slaTier }}</td>
              <td class="num">{{ s.availabilityMilliPct | pct }}</td><td class="num">{{ s.targetMilliPct | pct }}</td>
              <td class="num">{{ duration(s.downtimeMinutes) }} ({{ s.outageCount }})</td><td class="num">{{ duration(s.plannedMinutes) }}</td>
              <td class="num">{{ s.creditBps ? (s.credit.amountMinor | money: s.credit.currency) : '\u2014' }}</td>
            </tr>
          } @empty { <tr><td colspan="7" class="empty">No services were active in this period.</td></tr> }
        </tbody>
      </table>

      <h2>Ticket response and resolution</h2>
      <table class="table">
        <thead><tr><th>Priority</th><th class="num">Resolved</th><th class="num">Response met</th><th class="num">Resolution met</th></tr></thead>
        <tbody>
          @for (t of r.tickets; track t.priority) {
            <tr><td>{{ t.priority }}</td><td class="num">{{ t.resolvedCount }}</td><td class="num">{{ t.responseMetBps | pct: 'bps' }}</td><td class="num">{{ t.resolutionMetBps | pct: 'bps' }}</td></tr>
          } @empty { <tr><td colspan="4" class="empty">No tickets were resolved in this period.</td></tr> }
        </tbody>
      </table>
      <p class="hint">Generated {{ r.generatedAt | date: 'd MMM y, HH:mm' }}. Planned maintenance is excluded from availability.</p>
    }
  `
})
export class SlaReportComponent {
  private readonly api = inject(AccountApi);
  readonly periods = selectablePeriods(new Date());
  /** Default to the last complete month, which is what customers usually review. */
  readonly period = signal(this.periods[1]);
  readonly duration = formatDuration;

  readonly state = toSignal(
    toObservable(this.period).pipe(
      switchMap((period) =>
        this.api.slaReport(period).pipe(
          map((report): ReportState => ({ report, problem: null, loading: false })),
          catchError((problem: ApiProblem) => of<ReportState>({ report: null, problem, loading: false })),
          startWith<ReportState>({ report: null, problem: null, loading: true })
        )
      )
    ),
    { initialValue: { report: null, problem: null, loading: true } as ReportState }
  );
}
