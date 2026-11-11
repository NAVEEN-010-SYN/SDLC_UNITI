import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { BulkRowError, BulkUploadResult } from '../core/api.models';
import { BulkOrdersApi, saveBlob } from '../core/wholesale-api';
import { ProblemComponent, StatusLabelPipe } from '../shared/shared';
import { groupByRow, precheckCsv } from './csv-precheck';

@Component({
  standalone: true,
  imports: [RouterLink, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Bulk order upload</h1>
    <div class="card">
      <p>Upload a UTF-8 CSV of up to 2,000 orders. Validate first: the file is only accepted when every row is valid.
        <button class="secondary" (click)="downloadTemplate()">Download template</button></p>
      <div class="row">
        <input type="file" accept=".csv,text/csv" (change)="pick($event)" />
        <button class="secondary" [disabled]="!file() || busy()" (click)="send(true)">Validate</button>
        <button [disabled]="!canSubmit() || busy()" (click)="send(false)">Submit orders</button>
      </div>
    </div>
    <icw-problem [problem]="problem()" />

    @if (result(); as r) {
      <div class="card">
        <p><span class="badge {{ r.status }}">{{ r.status | statusLabel }}</span>
          {{ r.rowCount }} rows · {{ r.validRows }} valid
          @if (r.uploadId) { · {{ r.ordersCreated }} accepted, {{ r.ordersRejected }} rejected by inventory checks }</p>
      </div>
      @if (r.orders.length) {
        <table>
          <thead><tr><th>Line</th><th>Your ref</th><th>Order</th><th>Status</th><th>Reason</th></tr></thead>
          <tbody>
            @for (o of r.orders; track o.line) {
              <tr><td>{{ o.line }}</td><td>{{ o.partnerReference }}</td><td>{{ o.orderReference }}</td>
                <td><span class="badge {{ o.status }}">{{ o.status | statusLabel }}</span></td><td>{{ o.reason }}</td></tr>
            }
          </tbody>
        </table>
        <p><a routerLink="/orders">Go to orders</a></p>
      }
    }

    @if (grouped().length) {
      <h2>{{ errors().length }} problem(s) to fix</h2>
      <table>
        <thead><tr><th>Line</th><th>Column</th><th>Problem</th></tr></thead>
        <tbody>
          @for (g of grouped(); track g.row) {
            @for (e of g.errors; track $index; let first = $first) {
              <tr><td>{{ first ? (g.row || 'File') : '' }}</td><td>{{ e.column }}</td><td>{{ e.message }}</td></tr>
            }
          }
        </tbody>
      </table>
    }
  `,
})
export class BulkUploadPage {
  private readonly api = inject(BulkOrdersApi);
  readonly file = signal<File | null>(null);
  readonly result = signal<BulkUploadResult | null>(null);
  readonly errors = signal<BulkRowError[]>([]);
  readonly problem = signal<ApiProblem | null>(null);
  readonly busy = signal(false);
  private readonly validatedName = signal<string | null>(null);

  readonly grouped = computed(() => groupByRow(this.errors()));
  /** Submission is offered only after a clean dry run of the currently selected file. */
  readonly canSubmit = computed(() => !!this.file() && this.validatedName() === this.file()?.name);

  async pick(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(null);
    this.result.set(null);
    this.validatedName.set(null);
    this.problem.set(null);
    if (!file) {
      this.errors.set([]);
      return;
    }
    const local = precheckCsv(file.name, file.size, await file.text());
    this.errors.set(local);
    if (local.length === 0) {
      this.file.set(file);
    }
  }

  send(dryRun: boolean): void {
    const file = this.file();
    if (!file) {
      return;
    }
    this.busy.set(true);
    this.problem.set(null);
    this.api.upload(file, dryRun).subscribe({
      next: (r) => {
        this.result.set(r);
        this.errors.set(r.errors);
        this.validatedName.set(dryRun && r.status === 'VALID' ? file.name : null);
        this.busy.set(false);
      },
      error: (p: ApiProblem) => {
        this.problem.set(p);
        this.busy.set(false);
      },
    });
  }

  downloadTemplate(): void {
    this.api.template().subscribe((blob) => saveBlob(blob, 'bulk-order-template.csv'));
  }
}
