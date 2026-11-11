import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';
import { BillingApi, InvoiceFilter } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Invoice, InvoiceDetail, InvoiceLine, InvoiceStatus } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { saveBlob } from '../../shared/download';
import { MoneyPipe } from '../../shared/money.pipe';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';

const STATUSES: InvoiceStatus[] = ['ISSUED', 'OVERDUE', 'PAID', 'DISPUTED', 'VOID'];
/** Must match the API's DISPUTE_WINDOW_DAYS; the server remains the authority. */
export const DISPUTE_WINDOW_DAYS = 60;

export function canDispute(invoice: Invoice, now: Date): boolean {
  if (invoice.status !== 'ISSUED' && invoice.status !== 'OVERDUE') return false;
  return now.getTime() - new Date(invoice.issueDate).getTime() <= DISPUTE_WINDOW_DAYS * 86_400_000;
}

/** Invoice lines grouped by category with subtotals, largest first. */
export function groupLines(lines: InvoiceLine[]): Array<{ category: string; lines: InvoiceLine[]; subtotalMinor: number }> {
  const groups = new Map<string, InvoiceLine[]>();
  for (const line of lines) groups.set(line.category, [...(groups.get(line.category) ?? []), line]);
  return [...groups.entries()]
    .map(([category, ls]) => ({ category, lines: ls, subtotalMinor: ls.reduce((acc, l) => acc + l.amountMinor, 0) }))
    .sort((a, b) => b.subtotalMinor - a.subtotalMinor);
}

@Component({
  selector: 'gkb-invoices-list',
  standalone: true,
  imports: [DataTableComponent, CellDirective, StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Invoices</h1>
      <a routerLink="/billing/payment-methods">Payment methods</a>
    </header>
    <form class="filters">
      <label>Status
        <select (change)="invoices.setFilter({ status: $any($event.target).value || undefined })">
          <option value="">Any</option>
          @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
        </select>
      </label>
      <label>From <input type="month" (change)="invoices.setFilter({ fromPeriod: $any($event.target).value || undefined })" /></label>
      <label>To <input type="month" (change)="invoices.setFilter({ toPeriod: $any($event.target).value || undefined })" /></label>
    </form>
    <gkb-problem-alert [problem]="invoices.error()" />
    <gkb-data-table caption="Invoices" [columns]="columns" [rows]="invoices.items()" [total]="invoices.total()"
      [page]="invoices.page()" [pageSize]="invoices.pageSize()" [loading]="invoices.loading()" [rowClickable]="true"
      (rowClick)="open($event)" (pageChange)="invoices.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="status" let-row><gkb-status-badge [status]="row.status" /></ng-template>
      <ng-template gkbCell="due" let-row>{{ row.dueDate | date: 'd MMM y' }}</ng-template>
      <ng-template gkbCell="total" let-row>{{ row.totalMinor | money: row.currency }}</ng-template>
    </gkb-data-table>
  `
})
export class InvoicesListComponent {
  private readonly api = inject(BillingApi);
  private readonly router = inject(Router);
  readonly statuses = STATUSES;
  readonly invoices = pagedQuery<InvoiceFilter, Invoice>((f, p) => this.api.invoices(f, p), {});
  readonly columns: Column<Invoice>[] = [
    { key: 'number', header: 'Number', value: (i) => i.number },
    { key: 'period', header: 'Period', value: (i) => i.period },
    { key: 'due', header: 'Due' },
    { key: 'status', header: 'Status' },
    { key: 'total', header: 'Total', align: 'end' }
  ];

  open(invoice: Invoice): void {
    void this.router.navigate(['/billing/invoices', invoice.id]);
  }
}

@Component({
  selector: 'gkb-invoice-detail',
  standalone: true,
  imports: [StatusBadgeComponent, MoneyPipe, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/billing">← Invoices</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (invoice(); as inv) {
      <header class="page-header">
        <h1>Invoice {{ inv.number }}</h1>
        <gkb-status-badge [status]="inv.status" />
      </header>
      <p>Period {{ inv.period }} · issued {{ inv.issueDate | date: 'd MMM y' }} · due {{ inv.dueDate | date: 'd MMM y' }}
        @if (inv.daysOverdue > 0) { <strong class="text-danger">({{ inv.daysOverdue }} days overdue)</strong> }</p>

      @for (group of groups(); track group.category) {
        <h2>{{ group.category }} <small>{{ group.subtotalMinor | money: inv.currency }}</small></h2>
        <table class="table">
          <tbody>
            @for (line of group.lines; track line.id) {
              <tr><td>{{ line.description }}</td><td class="num">{{ line.amountMinor | money: inv.currency }}</td></tr>
            }
          </tbody>
        </table>
      }
      <dl class="summary totals">
        <dt>Subtotal</dt><dd>{{ inv.subtotalMinor | money: inv.currency }}</dd>
        <dt>VAT</dt><dd>{{ inv.taxMinor | money: inv.currency }}</dd>
        <dt>Total</dt><dd><strong>{{ inv.totalMinor | money: inv.currency }}</strong></dd>
      </dl>
      <div class="actions">
        <button type="button" class="secondary" (click)="downloadAllocation(inv)">Cost-centre allocation (CSV)</button>
      </div>
      @if (disputable()) {
        <form class="card" (ngSubmit)="dispute(inv)">
          <h2>Dispute this invoice</h2>
          <label>What is wrong? <textarea [formControl]="reason" rows="4" maxlength="2000"></textarea></label>
          @if (reason.touched && reason.invalid) { <p class="field-error">Please describe the problem in at least 10 characters.</p> }
          <button type="submit" class="danger" [disabled]="busy()">Raise dispute</button>
        </form>
      }
    }
  `
})
export class InvoiceDetailComponent {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly problem = signal<ApiProblem | null>(null);
  readonly busy = signal(false);
  readonly reason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10), Validators.maxLength(2000)] });

  private readonly refresh = new Subject<void>();
  readonly invoice = toSignal(
    merge(toObservable(this.id), this.refresh.pipe(map(() => this.id()))).pipe(
      switchMap((id) => this.api.invoice(id).pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null)))))
    ),
    { initialValue: null as InvoiceDetail | null }
  );
  readonly groups = computed(() => groupLines(this.invoice()?.lines ?? []));
  readonly disputable = computed(() => {
    const inv = this.invoice();
    return !!inv && this.auth.can('billing:manage') && canDispute(inv, new Date());
  });

  dispute(inv: InvoiceDetail): void {
    this.reason.markAsTouched();
    if (this.reason.invalid) return;
    this.busy.set(true);
    this.api.dispute(inv.id, this.reason.value.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.refresh.next();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
      }
    });
  }

  downloadAllocation(inv: InvoiceDetail): void {
    this.api.allocationCsv(inv.id).subscribe({
      next: (blob) => saveBlob(blob, `cost-allocation-${inv.number}.csv`),
      error: (p: ApiProblem) => this.problem.set(p)
    });
  }
}
