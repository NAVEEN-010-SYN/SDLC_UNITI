import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiProblem } from '../core/api-problem';
import { Paged, StatementDetail, StatementSummary } from '../core/api.models';
import { BillingApi, saveBlob } from '../core/wholesale-api';
import { MoneyPipe, PaginatorComponent, ProblemComponent, StatusLabelPipe, parseMajorToMinor } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MoneyPipe, PaginatorComponent, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Invoices</h1>
    <icw-problem [problem]="problem()" />
    @if (list(); as l) {
      <table>
        <thead><tr><th>Statement</th><th>Period</th><th>Status</th><th class="num">Total</th><th>Due</th><th></th></tr></thead>
        <tbody>
          @for (s of l.items; track s.id) {
            <tr><td>{{ s.reference }}</td><td>{{ s.periodStart | date: 'MMM y' }}</td>
              <td><span class="badge {{ s.status }}">{{ s.status | statusLabel }}</span></td>
              <td class="num">{{ s.totalMinor | money: s.currency }}</td><td>{{ s.dueDate | date: 'd MMM y' }}</td>
              <td><button class="secondary" (click)="open(s.id)">View</button>
                <button class="secondary" (click)="exportCsv(s)">CSV</button></td></tr>
          } @empty { <tr><td colspan="6" class="muted">No statements yet.</td></tr> }
        </tbody>
      </table>
      <icw-paginator [page]="l.page" [pageSize]="l.pageSize" [total]="l.total" (pageChange)="load($event)" />
    }

    @if (detail(); as d) {
      <h2>{{ d.reference }}: {{ d.periodStart | date: 'd MMM' }} to {{ d.periodEnd | date: 'd MMM y' }}</h2>
      <table>
        <thead><tr><th></th><th>#</th><th>Type</th><th>Description</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>
          @for (line of d.lines; track line.id) {
            <tr><td>@if (line.amountMinor > 0) { <input type="checkbox" [checked]="selected().has(line.id)" (change)="toggle(line.id)" /> }</td>
              <td>{{ line.lineNumber }}</td><td>{{ line.type | statusLabel }}</td><td>{{ line.description }}</td>
              <td class="num">{{ line.quantity }}</td><td class="num">{{ line.amountMinor | money: d.currency }}</td></tr>
          }
        </tbody>
        <tfoot>
          <tr><td colspan="5">Charges</td><td class="num">{{ d.chargesMinor | money: d.currency }}</td></tr>
          <tr><td colspan="5">Credits</td><td class="num">{{ d.creditsMinor | money: d.currency }}</td></tr>
          <tr><th colspan="5">Total</th><th class="num">{{ d.totalMinor | money: d.currency }}</th></tr>
        </tfoot>
      </table>

      @if (selected().size) {
        <div class="card row">
          <span>Disputing {{ selected().size }} line(s), up to {{ selectedTotal() | money: d.currency }}</span>
          <label>Amount claimed <input [(ngModel)]="claim" name="claim" placeholder="0.00" /></label>
          <label style="flex:1">Reason (min. 20 characters) <input [(ngModel)]="reason" name="reason" /></label>
          <button [disabled]="!canDispute()" (click)="dispute(d)">Raise dispute</button>
        </div>
      }
      @for (x of d.disputes; track x.id) {
        <p>{{ x.reference }} <span class="badge">{{ x.status | statusLabel }}</span> claimed {{ x.claimedMinor | money: d.currency }}
          @if (x.awardedMinor !== null) { &middot; awarded {{ x.awardedMinor | money: d.currency }}: {{ x.outcome }} }</p>
      }
    }
  `,
})
export class InvoicesPage implements OnInit {
  private readonly api = inject(BillingApi);
  readonly list = signal<Paged<StatementSummary> | null>(null);
  readonly detail = signal<StatementDetail | null>(null);
  readonly selected = signal(new Set<string>());
  readonly problem = signal<ApiProblem | null>(null);
  claim = '';
  reason = '';

  readonly selectedTotal = computed(() => {
    const lines = this.detail()?.lines ?? [];
    const selected = this.selected();
    let sum = 0;
    for (const l of lines) {
      if (selected.has(l.id)) {
        sum += l.amountMinor;
      }
    }
    return sum;
  });

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.api.statements(page, 12).subscribe({ next: (l) => this.list.set(l), error: (p: ApiProblem) => this.problem.set(p) });
  }

  open(id: string): void {
    this.selected.set(new Set());
    this.api.statement(id).subscribe({ next: (d) => this.detail.set(d), error: (p: ApiProblem) => this.problem.set(p) });
  }

  toggle(lineId: string): void {
    const next = new Set(this.selected());
    if (!next.delete(lineId)) {
      next.add(lineId);
    }
    this.selected.set(next);
  }

  canDispute(): boolean {
    const claimed = parseMajorToMinor(this.claim);
    return claimed !== null && claimed > 0 && claimed <= this.selectedTotal() && this.reason.trim().length >= 20;
  }

  dispute(d: StatementDetail): void {
    const claimedMinor = parseMajorToMinor(this.claim);
    if (claimedMinor === null) {
      return;
    }
    this.api.raiseDispute(d.id, { lineIds: [...this.selected()], reason: this.reason.trim(), claimedMinor }).subscribe({
      next: () => {
        this.claim = '';
        this.reason = '';
        this.open(d.id);
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  exportCsv(s: StatementSummary): void {
    this.api.exportCsv(s.id).subscribe({ next: (blob) => saveBlob(blob, `${s.reference}.csv`), error: (p: ApiProblem) => this.problem.set(p) });
  }
}
