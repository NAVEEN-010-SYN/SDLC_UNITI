import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TicketFilter, TicketsApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { Ticket } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { CATEGORIES, PRIORITIES } from './ticket-helpers';

// The new-ticket and detail pages live in their own files; re-exported for the router.
export { allowedPriorities, transitionLabel } from './ticket-helpers';
export { NewTicketComponent } from './new-ticket.component';
export { TicketDetailComponent } from './ticket-detail.component';

@Component({
  selector: 'gkb-tickets-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, DatePipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Support tickets</h1>
      @if (canCreate()) { <a class="button primary" routerLink="/tickets/new">Raise a ticket</a> }
    </header>
    <form class="filters">
      <label class="checkbox"><input type="checkbox" checked (change)="tickets.setFilter({ activeOnly: $any($event.target).checked || undefined })" /> Open only</label>
      <label>Priority
        <select (change)="tickets.setFilter({ priority: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </label>
      <label>Category
        <select (change)="tickets.setFilter({ category: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="tickets.error()" />
    <gkb-data-table caption="Tickets" [columns]="columns" [rows]="tickets.items()" [total]="tickets.total()"
      [page]="tickets.page()" [pageSize]="tickets.pageSize()" [loading]="tickets.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="tickets.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="priority" let-row><gkb-status-badge [status]="row.priority" /></ng-template>
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="sla" let-row>
        <gkb-status-badge [status]="row.sla.resolution.state" />
        <small>due {{ row.sla.resolution.dueAt | date: 'd MMM HH:mm' }}</small>
      </ng-template>
    </gkb-data-table>
  `
})
export class TicketsListComponent {
  private readonly api = inject(TicketsApi);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly canCreate = computed(() => this.auth.can('tickets:create'));
  readonly categories = CATEGORIES;
  readonly priorities = PRIORITIES;
  readonly tickets = pagedQuery<TicketFilter, Ticket>((f, p) => this.api.list(f, p), { activeOnly: true });
  readonly columns: Column<Ticket>[] = [
    { key: 'reference', header: 'Reference', value: (t) => t.reference },
    { key: 'subject', header: 'Subject', value: (t) => t.subject },
    { key: 'priority', header: 'Priority' },
    { key: 'status', header: 'Status' },
    { key: 'sla', header: 'Resolution SLA' }
  ];

  open(t: Ticket): void {
    void this.router.navigate(['/tickets', t.id]);
  }
}
