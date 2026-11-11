import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiProblem } from '../core/api-problem';
import { ApiKey } from '../core/api.models';
import { ApiKeysApi } from '../core/wholesale-api';
import { ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>API keys</h1>
    <p class="muted">Keys let your systems call the wholesale API with the <code>X-Api-Key</code> header. Up to 5 active keys.</p>
    <div class="card">
      <div class="row">
        <label>Name <input [(ngModel)]="name" name="name" maxlength="60" /></label>
        <label>Valid for (days) <input type="number" [(ngModel)]="days" name="days" min="1" max="365" /></label>
      </div>
      <div class="row scopes">
        @for (s of scopes(); track s) {
          <label class="scope"><input type="checkbox" [checked]="chosen.has(s)" (change)="toggle(s)" /> {{ s }}</label>
        }
      </div>
      <button [disabled]="!name.trim() || chosen.size === 0 || days < 1 || days > 365" (click)="create()">Create key</button>
    </div>
    @if (secret()) {
      <div class="card secret" role="status">
        <strong>Copy this key now. It will not be shown again.</strong>
        <code>{{ secret() }}</code>
        <button class="secondary" (click)="copy()">Copy</button>
      </div>
    }
    <icw-problem [problem]="problem()" />
    <table>
      <thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Status</th><th>Expires</th><th>Last used</th><th></th></tr></thead>
      <tbody>
        @for (k of keys(); track k.id) {
          <tr><td>{{ k.name }}</td><td><code>{{ k.prefix }}</code></td><td>{{ k.scopes.join(', ') }}</td>
            <td><span class="badge {{ k.status }}">{{ k.status | statusLabel }}</span></td>
            <td>{{ k.expiresAt | date: 'd MMM y' }}</td><td>{{ (k.lastUsedAt | date: 'd MMM y, HH:mm') ?? 'never' }}</td>
            <td>@if (k.status === 'ACTIVE' || k.status === 'EXPIRING') { <button class="danger" (click)="revoke(k)">Revoke</button> }</td></tr>
        } @empty { <tr><td colspan="7" class="muted">No keys yet.</td></tr> }
      </tbody>
    </table>
  `,
  styles: ['.scope { flex-direction: row; font-weight: 400; } .secret { border-color: var(--icw-warn); display: flex; gap: 1rem; align-items: center; } .secret code { word-break: break-all; }'],
})
export class ApiKeysPage implements OnInit {
  private readonly api = inject(ApiKeysApi);
  readonly keys = signal<ApiKey[]>([]);
  readonly scopes = signal<string[]>([]);
  readonly secret = signal<string | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  readonly chosen = new Set<string>();
  name = '';
  days = 180;

  ngOnInit(): void {
    this.api.scopes().subscribe((s) => this.scopes.set(s));
    this.refresh();
  }

  toggle(scope: string): void {
    if (!this.chosen.delete(scope)) {
      this.chosen.add(scope);
    }
  }

  create(): void {
    this.problem.set(null);
    this.api.create({ name: this.name.trim(), scopes: [...this.chosen], validForDays: this.days }).subscribe({
      next: (created) => {
        this.secret.set(created.secret);
        this.name = '';
        this.chosen.clear();
        this.refresh();
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  revoke(key: ApiKey): void {
    if (confirm(`Revoke "${key.name}"? Integrations using it will stop working immediately.`)) {
      this.api.revoke(key.id).subscribe({ next: () => this.refresh(), error: (p: ApiProblem) => this.problem.set(p) });
    }
  }

  copy(): void {
    const secret = this.secret();
    if (secret) {
      void navigator.clipboard.writeText(secret);
    }
  }

  private refresh(): void {
    this.api.list().subscribe({ next: (k) => this.keys.set(k), error: (p: ApiProblem) => this.problem.set(p) });
  }
}
