import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiProblem } from '../core/api-problem';
import { AppointmentSlot, OrderDetail } from '../core/api.models';
import { OrdersApi } from '../core/wholesale-api';
import { MoneyPipe, ProblemComponent, StatusLabelPipe } from '../shared/shared';

/** The happy-path lifecycle, rendered as a progress tracker. */
export const ORDER_STAGES = ['SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE'];

/** Index of the furthest stage reached; terminal side exits keep the last stage reached before them. */
export function stageReached(order: Pick<OrderDetail, 'status' | 'history'>): number {
  let best = ORDER_STAGES.indexOf(order.status);
  for (const h of order.history) {
    best = Math.max(best, ORDER_STAGES.indexOf(h.to));
  }
  return Math.max(-1, best);
}

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MoneyPipe, ProblemComponent, StatusLabelPipe],
  template: `
    <icw-problem [problem]="problem()" />
    @if (order(); as o) {
      <h1>{{ o.reference }} <span class="badge {{ o.status }}">{{ o.status | statusLabel }}</span></h1>
      <ol class="tracker">
        @for (stage of stages; track stage; let i = $index) {
          <li [class.done]="i <= reached()">{{ stage | statusLabel }}</li>
        }
      </ol>
      <div class="card">
        <p>{{ o.type | statusLabel }} at UPRN {{ o.uprn }} &middot; {{ o.productCode ?? 'no product' }} ({{ o.careLevel }}) &middot; your ref {{ o.partnerReference }}</p>
        <p>Requested {{ o.requestedDate | date: 'd MMM y' }} &middot; committed {{ (o.committedDate | date: 'd MMM y') ?? '\u2014' }}
          @if (o.completedDate) { &middot; completed {{ o.completedDate | date: 'd MMM y' }} }</p>
        <p>Monthly {{ o.monthlyRentalMinor | money: o.currency }} &middot; one-off {{ o.oneOffChargeMinor | money: o.currency }}
          @if (o.cancellationChargeMinor) { &middot; cancellation charge {{ o.cancellationChargeMinor | money: o.currency }} }</p>
        @if (o.failureReason) { <p class="badge FAILED">{{ o.failureReason }}</p> }
        @if (o.holdReason) { <p class="badge AtRisk">On hold: {{ o.holdReason }}</p> }
        @if (o.sla; as sla) {
          <p>Delivery SLA <span class="badge {{ sla.status }}">{{ sla.status | statusLabel }}</span>
            {{ sla.elapsedWorkingHours }} of {{ sla.targetWorkingHours }} working hours
            @if (sla.dueAt) { &middot; due {{ sla.dueAt | date: 'd MMM y, HH:mm' }} }
            @if (sla.workingDaysLate > 0) { &middot; {{ sla.workingDaysLate }} working days late }</p>
        }
      </div>

      @if (can('amend')) {
        <div class="card row">
          <label>New requested date <input type="date" [(ngModel)]="newDate" name="newDate" /></label>
          <button class="secondary" [disabled]="!newDate" (click)="run(api.act(o.id, 'amend', { requestedDate: newDate }))">Amend date</button>
        </div>
      }
      @if (can('book-appointment') && needsVisit(o)) {
        <div class="card">
          <button class="secondary" (click)="loadSlots(o.id)">Show engineer appointments</button>
          @if (slots().length) {
            <table>
              <thead><tr><th>Date</th><th>Band</th><th class="num">Remaining</th><th></th></tr></thead>
              <tbody>
                @for (s of slots(); track s.id) {
                  <tr [class.current]="s.id === o.appointmentSlotId">
                    <td>{{ s.date | date: 'EEE d MMM y' }} @if (!s.meetsCommittedDate) { <span class="muted">(moves committed date)</span> }</td>
                    <td>{{ s.band }}</td><td class="num">{{ s.remaining }}</td>
                    <td><button (click)="book(o.id, s)" [disabled]="s.id === o.appointmentSlotId">Book</button></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      }
      @if (can('cancel')) {
        <div class="card row">
          <label>Cancellation reason <input [(ngModel)]="cancelReason" name="cancelReason" /></label>
          <button class="danger" [disabled]="cancelReason.trim().length < 5" (click)="cancel(o)">Cancel order</button>
        </div>
      }

      <h2>History</h2>
      <table>
        <thead><tr><th>When</th><th>Status</th><th>Note</th><th>By</th></tr></thead>
        <tbody>
          @for (h of o.history; track $index) {
            <tr><td>{{ h.at | date: 'd MMM y, HH:mm' }}</td><td>{{ h.to | statusLabel }}</td><td>{{ h.note }}</td><td>{{ h.actor ?? 'system' }}</td></tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    .tracker { display: flex; list-style: none; padding: 0; gap: 0.5rem; }
    .tracker li { flex: 1; padding: 0.4rem; text-align: center; border-bottom: 4px solid var(--icw-border); }
    .tracker li.done { border-color: var(--icw-primary); font-weight: 600; }
    tr.current { background: #f1ecfa; }
  `],
})
export class OrderDetailPage implements OnInit {
  readonly api = inject(OrdersApi);
  readonly stages = ORDER_STAGES;
  readonly order = signal<OrderDetail | null>(null);
  readonly slots = signal<AppointmentSlot[]>([]);
  readonly problem = signal<ApiProblem | null>(null);
  readonly reached = signal(-1);
  newDate = '';
  cancelReason = '';

  @Input({ required: true }) id!: string;

  ngOnInit(): void {
    this.run(this.api.get(this.id));
  }

  can(action: string): boolean {
    return this.order()?.allowedActions.includes(action) ?? false;
  }

  needsVisit(o: OrderDetail): boolean {
    return o.type === 'PROVIDE' || o.type === 'MIGRATE';
  }

  loadSlots(id: string): void {
    this.api.appointmentSlots(id).subscribe({ next: (s) => this.slots.set(s), error: (p: ApiProblem) => this.problem.set(p) });
  }

  book(id: string, slot: AppointmentSlot): void {
    this.api.bookAppointment(id, slot.id).subscribe({
      next: () => this.run(this.api.get(id)),
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  cancel(o: OrderDetail): void {
    const warning = o.status === 'PROVISIONING' && o.appointmentSlotId
      ? 'An engineer has been dispatched; a cancellation charge applies. Cancel anyway?'
      : 'Cancel this order?';
    if (confirm(warning)) {
      this.run(this.api.act(o.id, 'cancel', { reason: this.cancelReason.trim() }));
    }
  }

  run(request: Observable<OrderDetail>): void {
    this.problem.set(null);
    request.subscribe({
      next: (o) => {
        this.order.set(o);
        this.reached.set(stageReached(o));
        this.slots.set([]);
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }
}
