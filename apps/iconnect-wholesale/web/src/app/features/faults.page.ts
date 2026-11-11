import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { FaultSummary, Paged } from '../core/api.models';
import { FaultsApi } from '../core/wholesale-api';
import { PaginatorComponent, ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, RouterLink, DatePipe, PaginatorComponent, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Faults</h1>
    <details class="card">
      <summary>Raise a fault</summary>
      <form [formGroup]="form" (ngSubmit)="raise()" class="row">
        <label>Service id <input formControlName="serviceId" /></label>
        <label>Priority <select formControlName="priority">
          @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
        </select></label>
        <label>Category <select formControlName="category">
          @for (c of categories; track c) { <option [value]="c">{{ c | statusLabel }}</option> }
        </select></label>
        <label style="flex:1">Description <textarea formControlName="description" rows="2"></textarea></label>
        <button type="submit" [disabled]="form.invalid">Raise</button>
      </form>
    </details>
    <div class="row">
      <label>Status <select [(ngModel)]="status" (ngModelChange)="load(1)" name="status">
        <option value="">Any</option>
        @for (s of statuses; track s) { <option [value]="s">{{ s | statusLabel }}</option> }
      </select></label>
    </div>
    <icw-problem [problem]="problem()" />
    @if (result(); as r) {
      <table>
        <thead><tr><th>Reference</th><th>UPRN</th><th>Priority</th><th>Category</th><th>Status</th><th>SLA</th><th>Due</th></tr></thead>
        <tbody>
          @for (f of r.items; track f.id) {
            <tr><td><a [routerLink]="['/faults', f.id]">{{ f.reference }}</a></td><td>{{ f.serviceUprn }}</td><td>{{ f.priority }}</td>
              <td>{{ f.category | statusLabel }}</td><td>{{ f.status | statusLabel }}</td>
              <td><span class="badge {{ f.slaStatus }}">{{ f.slaStatus | statusLabel }}</span></td>
              <td>{{ f.dueAt | date: 'd MMM, HH:mm' }}</td></tr>
          } @empty { <tr><td colspan="7" class="muted">No faults.</td></tr> }
        </tbody>
      </table>
      <icw-paginator [page]="r.page" [pageSize]="r.pageSize" [total]="r.total" (pageChange)="load($event)" />
    }
  `,
})
export class FaultsPage implements OnInit {
  private readonly api = inject(FaultsApi);
  private readonly router = inject(Router);
  readonly priorities = ['P1', 'P2', 'P3', 'P4'];
  readonly categories = ['TOTAL_LOSS_OF_SERVICE', 'INTERMITTENT_SERVICE', 'SPEED_DEGRADATION', 'ONT', 'OTHER'];
  readonly statuses = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'];
  status = '';
  readonly result = signal<Paged<FaultSummary> | null>(null);
  readonly problem = signal<ApiProblem | null>(null);

  readonly form = inject(FormBuilder).nonNullable.group({
    serviceId: ['', [Validators.required, Validators.pattern(/^[0-9a-fA-F-]{36}$/)]],
    priority: ['P3', Validators.required],
    category: ['INTERMITTENT_SERVICE', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
  });

  ngOnInit(): void {
    this.load(1);
  }

  load(page: number): void {
    this.api.list({ status: this.status, page, pageSize: 25 })
      .subscribe({ next: (r) => this.result.set(r), error: (p: ApiProblem) => this.problem.set(p) });
  }

  raise(): void {
    this.problem.set(null);
    this.api.raise(this.form.getRawValue()).subscribe({
      next: (f) => void this.router.navigate(['/faults', f.id]),
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }
}
