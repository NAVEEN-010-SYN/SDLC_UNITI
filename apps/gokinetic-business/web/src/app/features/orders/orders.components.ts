import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, startWith, switchMap } from 'rxjs';
import { OrderFilter, OrdersApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Order, OrderDetail, OrderStatus, OrderType } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { MoneyPipe } from '../../shared/money.pipe';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const STATUSES: OrderStatus[] = ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'];
const TYPES: OrderType[] = ['PROVIDE', 'ADD', 'CHANGE', 'MOVE', 'CEASE'];

export type OrderAction = 'submit' | 'approve' | 'reject' | 'cancel';

/**
 * Actions the current user may take, following the API's state machine and separation of
 * duties (no self-approval; only the creator or an admin may submit or cancel).
 */
export function availableActions(order: Order, userId: string, isAdmin: boolean, canApprove: boolean): OrderAction[] {
  const owner = order.createdBy === userId || isAdmin;
  const actions: OrderAction[] = [];
  if (order.status === 'DRAFT' && owner) actions.push('submit');
  if (order.status === 'SUBMITTED' && order.requiresApproval && canApprove && order.createdBy !== userId) {
    actions.push('approve', 'reject');
  }
  if (['DRAFT', 'SUBMITTED', 'VALIDATED'].includes(order.status) && owner) actions.push('cancel');
  return actions;
}

@Component({
  selector: 'gkb-orders-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Orders</h1>
      @if (canCreate()) { <a class="button primary" routerLink="/orders/new">New order</a> }
    </header>
    <form class="filters">
      <label>Status
        <select (change)="orders.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
      <label>Type
        <select (change)="orders.setFilter({ orderType: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="orders.error()" />
    <gkb-data-table caption="Orders" [columns]="columns" [rows]="orders.items()" [total]="orders.total()" [page]="orders.page()"
      [pageSize]="orders.pageSize()" [loading]="orders.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="orders.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row>
        <gkb-status-badge [status]="row.status" />
        @if (row.requiresApproval && row.status === 'SUBMITTED') { <small>Awaiting approval</small> }
      </ng-template>
      <ng-template gkbCell="monthly" let-row>{{ row.monthlyDeltaMinor | money: row.currency : true }}</ng-template>
      <ng-template gkbCell="created" let-row>{{ row.createdAt | date: 'd MMM y' }}</ng-template>
    </gkb-data-table>
  `
})
export class OrdersListComponent {
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly canCreate = computed(() => this.auth.can('orders:create'));
  readonly statuses = STATUSES;
  readonly types = TYPES;
  readonly orders = pagedQuery<OrderFilter, Order>((f, p) => this.api.list(f, p), {});
  readonly columns: Column<Order>[] = [
    { key: 'reference', header: 'Reference', value: (o) => o.reference },
    { key: 'type', header: 'Type', value: (o) => o.orderType },
    { key: 'product', header: 'Product', value: (o) => o.productCode },
    { key: 'status', header: 'Status' },
    { key: 'monthly', header: 'Monthly change', align: 'end' },
    { key: 'created', header: 'Created' }
  ];

  open(order: Order): void {
    void this.router.navigate(['/orders', order.id]);
  }
}

@Component({
  selector: 'gkb-order-detail',
  standalone: true,
  imports: [StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/orders">\u2190 Orders</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (order(); as o) {
      <header class="page-header">
        <h1>{{ o.reference }}</h1>
        <gkb-status-badge [status]="o.status" />
      </header>
      <dl class="summary">
        <dt>Type</dt><dd>{{ o.orderType }}</dd>
        @if (o.productCode) { <dt>Product</dt><dd>{{ o.productCode }}</dd> }
        <dt>Monthly change</dt><dd>{{ o.monthlyDeltaMinor | money: o.currency : true }}</dd>
        <dt>One-off charge</dt><dd>{{ o.oneOffChargeMinor | money: o.currency }}</dd>
        <dt>Requested date</dt><dd>{{ o.requestedDate ?? 'As soon as possible' }}</dd>
        @if (o.failureReason) { <dt>Reason</dt><dd>{{ o.failureReason }}</dd> }
        @if (o.notes) { <dt>Notes</dt><dd>{{ o.notes }}</dd> }
      </dl>

      @if (actions().length) {
        <div class="actions">
          @if (actions().includes('submit')) { <button class="primary" (click)="run('submit')" [disabled]="busy()">Submit</button> }
          @if (actions().includes('approve')) { <button class="primary" (click)="run('approve')" [disabled]="busy()">Approve</button> }
          @if (actions().includes('reject') || actions().includes('cancel')) {
            <label>Reason <input [formControl]="reason" maxlength="500" /></label>
            @if (actions().includes('reject')) { <button class="danger" (click)="run('reject')" [disabled]="busy() || reason.invalid">Reject</button> }
            @if (actions().includes('cancel')) { <button class="secondary" (click)="run('cancel')" [disabled]="busy() || reason.invalid">Cancel order</button> }
          }
        </div>
      }

      <h2>History</h2>
      <ol class="timeline">
        @for (h of o.history; track h.changedAt + h.toStatus) {
          <li><time>{{ h.changedAt | date: 'd MMM y, HH:mm' }}</time> <gkb-status-badge [status]="h.toStatus" /> @if (h.reason) { \u2013 {{ h.reason }} }</li>
        }
      </ol>
    }
  `
})
export class OrderDetailComponent {
  private readonly api = inject(OrdersApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] });

  private readonly refresh = new Subject<void>();
  // Reload when the route id changes or after an action.
  private readonly orderIds$ = merge(toObservable(this.id), this.refresh.pipe(map(() => this.id())));
  private readonly order$ = this.orderIds$.pipe(
    switchMap((id) => this.loadOrder(id)),
    startWith(null)
  );
  readonly order = toSignal(this.order$);

  readonly actions = computed(() => {
    const o = this.order();
    const me = this.auth.session();
    if (!o || !me) return [];
    return availableActions(o, me.userId, this.auth.isAdmin(), this.auth.can('orders:approve'));
  });

  run(action: OrderAction): void {
    const o = this.order() as OrderDetail;
    this.busy.set(true);
    this.problem.set(null);
    this.callFor(action, o.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.reason.reset();
        this.refresh.next();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
      }
    });
  }

  private callFor(action: OrderAction, orderId: string): Observable<Order> {
    if (action === 'submit') return this.api.submit(orderId);
    if (action === 'approve') return this.api.approve(orderId);
    if (action === 'reject') return this.api.reject(orderId, this.reason.value);
    return this.api.cancel(orderId, this.reason.value);
  }

  private loadOrder(id: string): Observable<OrderDetail | null> {
    return this.api.get(id).pipe(
      catchError((p: ApiProblem) => {
        this.problem.set(p);
        return of(null);
      })
    );
  }
}
