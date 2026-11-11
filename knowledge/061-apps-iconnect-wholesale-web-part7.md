# iConnect Wholesale ordering: apps/iconnect-wholesale/web (part 7 of 7)

- **Application:** iConnect Wholesale ordering
- **Tech stack:** .NET 8 Web API + Angular
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/iconnect-wholesale/web/src/app/features/order-detail.page.ts` (153 lines)
- `apps/iconnect-wholesale/web/src/app/features/order-new.page.ts` (100 lines)
- `apps/iconnect-wholesale/web/src/app/features/orders-list.page.ts` (69 lines)
- `apps/iconnect-wholesale/web/src/app/features/sla.page.ts` (81 lines)
- `apps/iconnect-wholesale/web/src/app/shared/shared.spec.ts` (63 lines)
- `apps/iconnect-wholesale/web/src/app/shared/shared.ts` (95 lines)
- `apps/iconnect-wholesale/web/src/environments/environment.development.ts` (10 lines)
- `apps/iconnect-wholesale/web/src/environments/environment.ts` (10 lines)
- `apps/iconnect-wholesale/web/src/index.html` (13 lines)
- `apps/iconnect-wholesale/web/src/main.ts` (6 lines)
- `apps/iconnect-wholesale/web/src/styles.scss` (37 lines)
- `apps/iconnect-wholesale/web/tsconfig.app.json` (7 lines)
- `apps/iconnect-wholesale/web/tsconfig.json` (28 lines)
- `apps/iconnect-wholesale/web/tsconfig.spec.json` (6 lines)

## apps/iconnect-wholesale/web/src/app/features/order-detail.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/order-detail.page.ts`.

```typescript
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
  const reached = [order.status, ...order.history.map((h) => h.to)].map((s) => ORDER_STAGES.indexOf(s));
  return Math.max(-1, ...reached);
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
        <p>{{ o.type | statusLabel }} at UPRN {{ o.uprn }} · {{ o.productCode ?? 'no product' }} ({{ o.careLevel }}) · your ref {{ o.partnerReference }}</p>
        <p>Requested {{ o.requestedDate | date: 'd MMM y' }} · committed {{ (o.committedDate | date: 'd MMM y') ?? '—' }}
          @if (o.completedDate) { · completed {{ o.completedDate | date: 'd MMM y' }} }</p>
        <p>Monthly {{ o.monthlyRentalMinor | money: o.currency }} · one-off {{ o.oneOffChargeMinor | money: o.currency }}
          @if (o.cancellationChargeMinor) { · cancellation charge {{ o.cancellationChargeMinor | money: o.currency }} }</p>
        @if (o.failureReason) { <p class="badge FAILED">{{ o.failureReason }}</p> }
        @if (o.holdReason) { <p class="badge AtRisk">On hold: {{ o.holdReason }}</p> }
        @if (o.sla; as sla) {
          <p>Delivery SLA <span class="badge {{ sla.status }}">{{ sla.status | statusLabel }}</span>
            {{ sla.elapsedWorkingHours }} of {{ sla.targetWorkingHours }} working hours
            @if (sla.dueAt) { · due {{ sla.dueAt | date: 'd MMM y, HH:mm' }} }
            @if (sla.workingDaysLate > 0) { · {{ sla.workingDaysLate }} working days late }</p>
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
```

## apps/iconnect-wholesale/web/src/app/features/order-new.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/order-new.page.ts`.

```typescript
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { OrderType, PlaceOrderRequest } from '../core/api.models';
import { OrdersApi } from '../core/wholesale-api';
import { ProblemComponent, isoDate } from '../shared/shared';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ProblemComponent],
  template: `
    <h1>Place an order</h1>
    <form class="card" [formGroup]="form" (ngSubmit)="submit()">
      <div class="row">
        <label>Order type <select formControlName="orderType">
          @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
        </select></label>
        <label>Your reference <input formControlName="partnerReference" maxlength="40" />
          <small class="error">{{ problem()?.fieldError('partnerReference') }}</small></label>
        <label>UPRN <input formControlName="uprn" inputmode="numeric" /><small class="error">{{ problem()?.fieldError('uprn') }}</small></label>
        <label>Requested date <input type="date" formControlName="requestedDate" [min]="minDate" />
          <small class="error">{{ problem()?.fieldError('requestedDate') }}</small></label>
      </div>
      <div class="row">
        @if (type !== 'CEASE') {
          <label>Product <input formControlName="productCode" placeholder="FTTP500" /><small class="error">{{ problem()?.fieldError('productCode') }}</small></label>
          <label>Care level <select formControlName="careLevel">
            <option value="Standard">Standard</option><option value="Enhanced">Enhanced</option><option value="Premium">Premium</option>
          </select></label>
        }
        @if (type === 'CEASE' || type === 'MODIFY') {
          <label>Existing service id <input formControlName="existingServiceId" /><small class="error">{{ problem()?.fieldError('existingServiceId') }}</small></label>
        }
        @if (type === 'MIGRATE') {
          <label>Switching code <input formControlName="migrationAuthCode" placeholder="ABC123456" />
            <small class="error">{{ problem()?.fieldError('migrationAuthCode') }}</small></label>
        }
      </div>
      <p><button type="submit" [disabled]="form.invalid || busy()">Place order</button></p>
    </form>
    <icw-problem [problem]="problem()" />
  `,
  styles: ['.error { color: var(--icw-danger); font-weight: 400; min-height: 1em; }'],
})
export class OrderNewPage implements OnInit {
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  readonly types: OrderType[] = ['PROVIDE', 'MIGRATE', 'MODIFY', 'CEASE'];
  readonly minDate = isoDate(1);
  readonly problem = signal<ApiProblem | null>(null);
  readonly busy = signal(false);

  @Input() uprn?: string;
  @Input() productCode?: string;
  @Input() orderType?: OrderType;

  readonly form = inject(FormBuilder).nonNullable.group({
    orderType: ['PROVIDE' as OrderType, Validators.required],
    partnerReference: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_/-]{1,40}$/)]],
    uprn: ['', [Validators.required, Validators.pattern(/^\d{1,12}$/)]],
    requestedDate: [isoDate(14), Validators.required],
    productCode: [''],
    careLevel: ['Standard'],
    existingServiceId: [''],
    migrationAuthCode: [''],
  });

  get type(): OrderType {
    return this.form.controls.orderType.value;
  }

  ngOnInit(): void {
    this.form.patchValue({ uprn: this.uprn ?? '', productCode: this.productCode ?? '', orderType: this.orderType ?? 'PROVIDE' });
  }

  submit(): void {
    const v = this.form.getRawValue();
    const request: PlaceOrderRequest = {
      partnerReference: v.partnerReference.trim(),
      orderType: v.orderType,
      uprn: v.uprn.trim(),
      productCode: v.orderType === 'CEASE' ? null : v.productCode.trim() || null,
      careLevel: v.orderType === 'CEASE' ? null : v.careLevel,
      existingServiceId: v.orderType === 'CEASE' || v.orderType === 'MODIFY' ? v.existingServiceId.trim() || null : null,
      migrationAuthCode: v.orderType === 'MIGRATE' ? v.migrationAuthCode.trim() || null : null,
      requestedDate: v.requestedDate,
    };
    this.busy.set(true);
    this.problem.set(null);
    this.api.place(request).subscribe({
      next: ({ order }) => void this.router.navigate(['/orders', order.id]),
      error: (p: ApiProblem) => {
        this.problem.set(p);
        this.busy.set(false);
      },
    });
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/orders-list.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/orders-list.page.ts`.

```typescript
import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { OrderSummary, Paged } from '../core/api.models';
import { OrderFilter, OrdersApi } from '../core/wholesale-api';
import { PaginatorComponent, ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, PaginatorComponent, ProblemComponent, StatusLabelPipe],
  template: `
    <div class="row"><h1>Orders</h1><span style="flex:1"></span>
      <a routerLink="/orders/new"><button>Place order</button></a>
      <a routerLink="/orders/bulk"><button class="secondary">Bulk upload</button></a></div>
    <div class="card row">
      <label>Status <select [(ngModel)]="filter.status" name="status">
        <option value="">Any</option>
        @for (s of statuses; track s) { <option [value]="s">{{ s | statusLabel }}</option> }
      </select></label>
      <label>Type <select [(ngModel)]="filter.type" name="type">
        <option value="">Any</option>
        @for (t of types; track t) { <option [value]="t">{{ t | statusLabel }}</option> }
      </select></label>
      <label>Reference / UPRN <input [(ngModel)]="filter.search" name="search" /></label>
      <label>Created from <input type="date" [(ngModel)]="filter.from" name="from" /></label>
      <label>to <input type="date" [(ngModel)]="filter.to" name="to" /></label>
      <button (click)="load(1)">Search</button>
    </div>
    <icw-problem [problem]="problem()" />
    @if (result(); as r) {
      <table>
        <thead><tr><th>Reference</th><th>Your ref</th><th>Type</th><th>UPRN</th><th>Status</th><th>Committed</th><th>SLA</th><th>Created</th></tr></thead>
        <tbody>
          @for (o of r.items; track o.id) {
            <tr>
              <td><a [routerLink]="['/orders', o.id]">{{ o.reference }}</a></td>
              <td>{{ o.partnerReference }}</td><td>{{ o.type | statusLabel }}</td><td>{{ o.uprn }}</td>
              <td><span class="badge {{ o.status }}">{{ o.status | statusLabel }}</span> @if (o.onHold) { <span class="badge AtRisk">On hold</span> }</td>
              <td>{{ o.committedDate | date: 'd MMM y' }}</td>
              <td>@if (o.slaStatus) { <span class="badge {{ o.slaStatus }}">{{ o.slaStatus | statusLabel }}</span> }</td>
              <td>{{ o.createdAt | date: 'd MMM y, HH:mm' }}</td>
            </tr>
          } @empty { <tr><td colspan="8" class="muted">No orders match these filters.</td></tr> }
        </tbody>
      </table>
      <icw-paginator [page]="r.page" [pageSize]="r.pageSize" [total]="r.total" (pageChange)="load($event)" />
    }
  `,
})
export class OrdersListPage implements OnInit {
  private readonly api = inject(OrdersApi);
  readonly statuses = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'];
  readonly types = ['PROVIDE', 'CEASE', 'MODIFY', 'MIGRATE'];
  filter: OrderFilter = { status: '', type: '', search: '', from: '', to: '', page: 1, pageSize: 25 };
  readonly result = signal<Paged<OrderSummary> | null>(null);
  readonly problem = signal<ApiProblem | null>(null);

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.problem.set(null);
    this.api.list({ ...this.filter, page }).subscribe({ next: (r) => this.result.set(r), error: (p: ApiProblem) => this.problem.set(p) });
  }
}
```

## apps/iconnect-wholesale/web/src/app/features/sla.page.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/features/sla.page.ts`.

```typescript
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
          <div>{{ s.ordersAtRisk }} at risk · {{ s.ordersBreached }} breached</div></div>
        <div class="card"><div class="muted">Open faults</div><strong>{{ s.openFaults }}</strong>
          <div>{{ s.faultsAtRisk }} at risk · {{ s.faultsBreached }} breached</div></div>
        <div class="card"><div class="muted">Credits since {{ s.periodStart | date: 'd MMM' }}</div>
          <strong>{{ s.faultCreditsMinor + s.lateDeliveryCreditsMinor | money: s.currency }}</strong>
          <div>faults {{ s.faultCreditsMinor | money: s.currency }} · late delivery {{ s.lateDeliveryCreditsMinor | money: s.currency }}</div></div>
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
  readonly summary = toSignal<SlaSummary | null>(this.api.summary().pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null)))), { initialValue: null });
  readonly policy = toSignal<SlaPolicy | null>(this.api.policy().pipe(catchError(() => of(null))), { initialValue: null });

  careLevels(p: SlaPolicy): string[] {
    return [...new Set(p.repairTargets.map((t) => t.careLevel))];
  }

  target(p: SlaPolicy, care: string, priority: string) {
    return p.repairTargets.find((t) => t.careLevel === care && t.priority === priority);
  }
}
```

## apps/iconnect-wholesale/web/src/app/shared/shared.spec.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/shared/shared.spec.ts`.

```typescript
import { MoneyPipe, PaginatorComponent, StatusLabelPipe, isoDate, parseMajorToMinor } from './shared';

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats minor units with the currency symbol', () => {
    expect(pipe.transform(2499, 'GBP')).toBe('£24.99');
    expect(pipe.transform(123456789, 'GBP')).toBe('£1,234,567.89');
  });

  it('keeps the sign on credits and pads pence', () => {
    expect(pipe.transform(-505, 'GBP')).toBe('-£5.05');
    expect(pipe.transform(7, 'EUR')).toBe('€0.07');
  });

  it('falls back to the ISO code for unknown currencies and dashes for missing values', () => {
    expect(pipe.transform(1000, 'SEK')).toBe('10.00 SEK');
    expect(pipe.transform(null)).toBe('—');
  });
});

describe('StatusLabelPipe', () => {
  const pipe = new StatusLabelPipe();

  it('humanises screaming snake and pascal case', () => {
    expect(pipe.transform('PENDING_CUSTOMER')).toBe('Pending customer');
    expect(pipe.transform('AtRisk')).toBe('At risk');
    expect(pipe.transform('ACTIVE')).toBe('Active');
    expect(pipe.transform(null)).toBe('');
  });
});

describe('parseMajorToMinor', () => {
  it('converts typed amounts without floating point error', () => {
    expect(parseMajorToMinor('12.5')).toBe(1250);
    expect(parseMajorToMinor('0.29')).toBe(29);
    expect(parseMajorToMinor(' 100 ')).toBe(10000);
  });

  it('rejects malformed or over-precise amounts', () => {
    expect(parseMajorToMinor('1.234')).toBeNull();
    expect(parseMajorToMinor('-5')).toBeNull();
    expect(parseMajorToMinor('£5')).toBeNull();
  });
});

describe('isoDate', () => {
  it('offsets in UTC days across month ends', () => {
    expect(isoDate(1, new Date(Date.UTC(2024, 0, 31, 23, 30)))).toBe('2024-02-01');
  });
});

describe('PaginatorComponent', () => {
  it('always reports at least one page', () => {
    const p = new PaginatorComponent();
    p.total = 0;
    expect(p.pages).toBe(1);
    p.total = 51;
    p.pageSize = 25;
    expect(p.pages).toBe(3);
  });
});
```

## apps/iconnect-wholesale/web/src/app/shared/shared.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/app/shared/shared.ts`.

```typescript
import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { ApiProblem } from '../core/api-problem';

/** Formats integer minor units with their ISO currency, e.g. 2499 GBP -> "£24.99". Never goes through floating maths for totals. */
@Pipe({ name: 'money', standalone: true })
export class MoneyPipe implements PipeTransform {
  transform(minor: number | null | undefined, currency = 'GBP'): string {
    if (minor === null || minor === undefined) {
      return '—';
    }
    const sign = minor < 0 ? '-' : '';
    const abs = Math.abs(minor);
    const major = Math.trunc(abs / 100).toLocaleString('en-GB');
    const pence = String(abs % 100).padStart(2, '0');
    const symbol = ({ GBP: '£', EUR: '€', USD: '$' } as Record<string, string>)[currency];
    return symbol ? `${sign}${symbol}${major}.${pence}` : `${sign}${major}.${pence} ${currency}`;
  }
}

/** "PENDING_CUSTOMER" / "AtRisk" -> "Pending customer" / "At risk". */
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    const words = value.includes('_') ? value.split('_') : value.split(/(?=[A-Z])/);
    const sentence = words.map((w) => w.toLowerCase()).join(' ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }
}

@Component({
  selector: 'icw-problem',
  standalone: true,
  template: `
    @if (problem) {
      <div class="card problem" role="alert">
        <strong>{{ problem.title }}</strong>
        @if (problem.detail) { <p>{{ problem.detail }}</p> }
        @if (fieldMessages.length) {
          <ul>@for (m of fieldMessages; track m) { <li>{{ m }}</li> }</ul>
        }
        @if (problem.correlationId) { <p class="muted">Reference for support: {{ problem.correlationId }}</p> }
      </div>
    }
  `,
  styles: ['.problem { border-color: var(--icw-danger); background: #fff6f5; } ul { margin: 0.5rem 0 0; }'],
})
export class ProblemComponent {
  @Input() problem: ApiProblem | null = null;

  get fieldMessages(): string[] {
    return Object.entries(this.problem?.fieldErrors ?? {}).flatMap(([field, msgs]) => msgs.map((m) => `${field}: ${m}`));
  }
}

@Component({
  selector: 'icw-paginator',
  standalone: true,
  template: `
    <div class="row pager">
      <button class="secondary" [disabled]="page <= 1" (click)="pageChange.emit(page - 1)">Previous</button>
      <span class="muted">Page {{ page }} of {{ pages }} · {{ total }} items</span>
      <button class="secondary" [disabled]="page >= pages" (click)="pageChange.emit(page + 1)">Next</button>
    </div>
  `,
  styles: ['.pager { margin-top: 0.75rem; align-items: center; }'],
})
export class PaginatorComponent {
  @Input({ required: true }) page = 1;
  @Input({ required: true }) pageSize = 25;
  @Input({ required: true }) total = 0;
  @Output() readonly pageChange = new EventEmitter<number>();

  get pages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }
}

/** Converts a decimal major-unit string typed by a user ("12.5") into minor units without float rounding. */
export function parseMajorToMinor(input: string): number | null {
  const match = /^\s*(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
}

/** Today's date in UTC as YYYY-MM-DD, offset by whole days. */
export function isoDate(offsetDays = 0, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offsetDays));
  return d.toISOString().slice(0, 10);
}
```

## apps/iconnect-wholesale/web/src/environments/environment.development.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/environments/environment.development.ts`.

```typescript
export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  oidc: {
    authority: 'http://localhost:8080/realms/uniti',
    clientId: 'iconnect-wholesale-web',
    scope: 'openid profile iconnect-wholesale-api',
  },
};
```

## apps/iconnect-wholesale/web/src/environments/environment.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/environments/environment.ts`.

```typescript
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  oidc: {
    authority: '/auth/realms/uniti',
    clientId: 'iconnect-wholesale-web',
    scope: 'openid profile iconnect-wholesale-api',
  },
};
```

## apps/iconnect-wholesale/web/src/index.html

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: html. Path: `apps/iconnect-wholesale/web/src/index.html`.

```html
<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>iConnect Wholesale</title>
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <icw-root></icw-root>
</body>
</html>
```

## apps/iconnect-wholesale/web/src/main.ts

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: typescript. Path: `apps/iconnect-wholesale/web/src/main.ts`.

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
```

## apps/iconnect-wholesale/web/src/styles.scss

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: scss. Path: `apps/iconnect-wholesale/web/src/styles.scss`.

```scss
:root {
  --icw-primary: #4b2e83;
  --icw-danger: #b3261e;
  --icw-warn: #a15c00;
  --icw-ok: #1e6b34;
  --icw-border: #d9d6e0;
  --icw-muted: #5d5a66;
}

* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1b1f; background: #f7f6fa; }
a { color: var(--icw-primary); }
h1 { font-size: 1.5rem; margin: 0 0 1rem; }
h2 { font-size: 1.15rem; margin: 1.5rem 0 0.75rem; }

.card { background: #fff; border: 1px solid var(--icw-border); border-radius: 8px; padding: 1rem 1.25rem; margin-bottom: 1rem; }
.row { display: flex; gap: 0.75rem; flex-wrap: wrap; align-items: flex-end; }
.muted { color: var(--icw-muted); }

label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.85rem; font-weight: 600; }
input, select, textarea { font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--icw-border); border-radius: 4px; min-width: 10rem; }
input.ng-invalid.ng-touched, select.ng-invalid.ng-touched { border-color: var(--icw-danger); }

button { font: inherit; padding: 0.45rem 0.9rem; border-radius: 4px; border: 1px solid var(--icw-primary); background: var(--icw-primary); color: #fff; cursor: pointer; }
button.secondary { background: #fff; color: var(--icw-primary); }
button.danger { background: var(--icw-danger); border-color: var(--icw-danger); }
button:disabled { opacity: 0.5; cursor: not-allowed; }

table { width: 100%; border-collapse: collapse; background: #fff; }
th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--icw-border); font-size: 0.9rem; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

.badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: #ece9f3; }
.badge.Breached, .badge.FAILED, .badge.REJECTED, .badge.REVOKED, .badge.INVALID { background: #fbe4e2; color: var(--icw-danger); }
.badge.AtRisk, .badge.EXPIRING, .badge.DISPUTED { background: #fff1d6; color: var(--icw-warn); }
.badge.OnTrack, .badge.Met, .badge.ACTIVE, .badge.VALIDATED, .badge.VALID, .badge.SETTLED, .badge.SUBMITTED { background: #e1f3e6; color: var(--icw-ok); }
```

## apps/iconnect-wholesale/web/tsconfig.app.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/web/tsconfig.app.json`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "./out-tsc/app", "types": [] },
  "files": ["src/main.ts"],
  "include": ["src/**/*.d.ts"]
}
```

## apps/iconnect-wholesale/web/tsconfig.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/web/tsconfig.json`.

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "outDir": "./dist/out-tsc",
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "declaration": false,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "target": "ES2022",
    "module": "ES2022",
    "useDefineForClassFields": false,
    "lib": ["ES2022", "dom"]
  },
  "angularCompilerOptions": {
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

## apps/iconnect-wholesale/web/tsconfig.spec.json

Application: iConnect Wholesale ordering. Stack: .NET 8 Web API + Angular. Language: json. Path: `apps/iconnect-wholesale/web/tsconfig.spec.json`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "outDir": "./out-tsc/spec", "types": ["jasmine"] },
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```
