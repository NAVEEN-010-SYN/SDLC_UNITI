import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AccountApi, AuditFilter } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { AuditEntry } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { saveBlob } from '../../shared/download';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';

export const AUDIT_ENTITIES = ['user', 'site', 'order', 'order_batch', 'invoice', 'cost_centre', 'ticket', 'payment_method', 'account'];

@Component({
  selector: 'gkb-audit-log',
  standalone: true,
  imports: [DataTableComponent, CellDirective, DatePipe, ProblemAlertComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-header">
      <h1>Audit log</h1>
      <button type="button" class="secondary" (click)="export()" [disabled]="exporting()">Export CSV</button>
    </header>
    <form class="filters">
      <label>Area
        <select (change)="log.setFilter({ entity: $any($event.target).value || undefined })">
          <option value="">All</option>
          @for (e of entities; track e) { <option [value]="e">{{ e.replace('_', ' ') }}</option> }
        </select>
      </label>
    </form>
    <gkb-problem-alert [problem]="exportProblem() ?? log.error()" />
    <gkb-data-table caption="Audit log" [columns]="columns" [rows]="log.items()" [total]="log.total()" [page]="log.page()"
      [pageSize]="log.pageSize()" [loading]="log.loading()" (pageChange)="log.setPage($event.page, $event.pageSize)">
      <ng-template gkbCell="when" let-row>{{ row.createdAt | date: 'd MMM y, HH:mm:ss' }}</ng-template>
      <ng-template gkbCell="ref" let-row><code [title]="'Correlation id ' + row.correlationId">{{ row.correlationId?.slice(0, 8) }}</code></ng-template>
    </gkb-data-table>
  `
})
export class AuditLogComponent {
  private readonly api = inject(AccountApi);
  readonly entities = AUDIT_ENTITIES;
  readonly exporting = signal(false);
  readonly exportProblem = signal<ApiProblem | null>(null);
  readonly log = pagedQuery<AuditFilter, AuditEntry>((f, p) => this.api.auditLog(f, p), {}, 50);
  readonly columns: Column<AuditEntry>[] = [
    { key: 'when', header: 'When' },
    { key: 'summary', header: 'Activity', value: (e) => e.summary },
    { key: 'entity', header: 'Area', value: (e) => e.entity },
    { key: 'actor', header: 'By', value: (e) => e.actorId?.slice(0, 8) ?? 'System' },
    { key: 'ref', header: 'Ref' }
  ];

  export(): void {
    this.exporting.set(true);
    this.exportProblem.set(null);
    this.api.auditCsv(this.log.filter()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        saveBlob(blob, `audit-${new Date().toISOString().slice(0, 10)}.csv`);
      },
      error: (p: ApiProblem) => {
        this.exporting.set(false);
        this.exportProblem.set(p);
      }
    });
  }
}
