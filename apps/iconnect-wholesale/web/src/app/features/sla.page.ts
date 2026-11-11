import { DatePipe, KeyValuePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiProblem } from '../core/api-problem';
import { SlaPolicy, SlaSummary } from '../core/api.models';
import { SlaApi } from '../core/wholesale-api';
import { MoneyPipe, ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [DatePipe, KeyValuePipe, RouterLink, MoneyPipe, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Service levels</h1>
    <icw-problem [problem]="problem()" />
    @if (summary(); as s) {
      <div class="tiles">
        <div class="card"><div class="muted">Orders in flight</div><strong>{{ s.openOrders }}</strong>
          <div>{{ s.ordersAtRisk }} at risk &middot; {{ s.ordersBreached }} breached</div></div>
        <div class="card"><div class="muted">Open faults</div><strong>{{ s.openFaults }}</strong>
          <div>{{ s.faultsAtRisk }} at risk &middot; {{ s.faultsBreached }} breached</div></div>
        <div class="card"><div class="muted">Credits since {{ s.periodStart | date: 'd MMM' }}</div>
          <strong>{{ s.faultCreditsMinor + s.lateDeliveryCreditsMinor | money: s.currency }}</strong>
          <div>faults {{ s.faultCreditsMinor | money: s.currency }} &middot; late delivery {{ s.lateDeliveryCreditsMinor | money: s.currency }}</div></div>
      </div>
      <h2>Needs attention</h2>
      <table>
        <thead><tr><th>Item</th><th>Status</th><th>SLA</th><th>Due</th><th class="num">Working hours left</th></tr></thead>
        <tbody>
          @for (i of s.attention; track i.id) {
            <tr><td><a [routerLink]="[i.kind === 'ORDER' ? '/orders' : '/faults', i.id]">{{ i.reference }}</a></td>
              <td>{{ i.status | statusLabel }}</td><td><span class="badge {{ i.slaStatus }}">{{ i.slaStatus | statusLabel }}</span></td>
              <td>{{ i.dueAt | date: 'd MMM, HH:mm' }}</td><td class="num">{{ i.remainingWorkingHours }}</td></tr>
          } @empty { <tr><td colspan="5" class="muted">Everything is on track.</td></tr> }
        </tbody>
      </table>
    }
    @if (policy(); as p) {
      <h2>Fault repair targets (hours)</h2>
      <table>
        <thead><tr><th>Care level</th><th>Calendar</th><th class="num">P1</th><th class="num">P2</th><th class="num">P3</th><th class="num">P4</th></tr></thead>
        <tbody>
          @for (care of careLevels(p); track care) {
            <tr><td>{{ care }}</td><td>{{ target(p, care, 'P1')?.calendar | statusLabel }}</td>
              @for (pr of priorities; track pr) { <td class="num">{{ target(p, care, pr)?.targetHours }}</td> }</tr>
          }
        </tbody>
      </table>
      <h2>Order lead times</h2>
      <ul>@for (lt of p.orderLeadTimeWorkingDays | keyvalue; track lt.key) { <li>{{ lt.key | statusLabel }}: {{ lt.value }} working days</li> }</ul>
      <h2>Service credits</h2>
      <table>
        <thead><tr><th>Care level</th><th>Fault credit per breach day</th><th>Cap</th><th>Late delivery per day</th><th>Missed appointment</th></tr></thead>
        <tbody>
          @for (t of p.creditTerms; track t.careLevel) {
            <tr><td>{{ t.careLevel }}</td><td>{{ t.faultCreditBpsPerBreachDay / 100 }}% of rental</td><td>{{ t.faultCreditCapBps / 100 }}%</td>
              <td>{{ t.lateDeliveryPerDayMinor | money }} (max {{ t.lateDeliveryMaxDays }} days)</td><td>{{ t.missedAppointmentMinor | money }}</td></tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: ['.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; } .tiles strong { font-size: 1.8rem; }'],
})
export class SlaPage {
  private readonly api = inject(SlaApi);
  readonly priorities = ['P1', 'P2', 'P3', 'P4'];
  readonly problem = signal<ApiProblem | null>(null);
  readonly summary = toSignal<SlaSummary | null>(
    this.api.summary().pipe(
      catchError((p: ApiProblem) => {
        this.problem.set(p);
        return of(null);
      }),
    ),
    { initialValue: null },
  );

  readonly policy = toSignal<SlaPolicy | null>(this.api.policy().pipe(catchError(() => of(null))), { initialValue: null });

  careLevels(p: SlaPolicy): string[] {
    return [...new Set(p.repairTargets.map((t) => t.careLevel))];
  }

  target(p: SlaPolicy, care: string, priority: string) {
    return p.repairTargets.find((t) => t.careLevel === care && t.priority === priority);
  }
}
