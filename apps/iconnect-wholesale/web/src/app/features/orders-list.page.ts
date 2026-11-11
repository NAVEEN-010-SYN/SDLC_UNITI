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
