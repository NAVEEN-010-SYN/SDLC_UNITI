import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { ApiProblem } from '../core/api-problem';
import { FaultDetail } from '../core/api.models';
import { FaultsApi } from '../core/wholesale-api';
import { MoneyPipe, ProblemComponent, StatusLabelPipe } from '../shared/shared';

/** Partner-side actions; support-only actions are never offered here even if the API lists them. */
const PARTNER_ACTIONS: Record<string, { label: string; needsNote: boolean }> = {
  respond: { label: 'Send response', needsNote: true },
  reopen: { label: 'Reopen fault', needsNote: true },
  close: { label: 'Confirm fixed and close', needsNote: false },
};

@Component({
  standalone: true,
  imports: [FormsModule, DatePipe, MoneyPipe, ProblemComponent, StatusLabelPipe],
  template: `
    <icw-problem [problem]="problem()" />
    @if (fault(); as f) {
      <h1>{{ f.reference }} <span class="badge">{{ f.status | statusLabel }}</span></h1>
      <div class="card">
        <p>{{ f.priority }} &middot; {{ f.category | statusLabel }} &middot; {{ f.careLevel }} care &middot; UPRN {{ f.uprn }}</p>
        <p>{{ f.description }}</p>
        <p>Repair SLA <span class="badge {{ f.sla.status }}">{{ f.sla.status | statusLabel }}</span>
          {{ f.sla.elapsedWorkingHours }} of {{ f.sla.targetWorkingHours }} h ({{ f.sla.calendar }} calendar)
          @if (f.sla.dueAt) { &middot; due {{ f.sla.dueAt | date: 'd MMM y, HH:mm' }} }</p>
        @if (f.serviceCreditMinor) { <p>Service credit {{ f.serviceCreditMinor | money }}: {{ f.serviceCreditBasis }}</p> }
      </div>
      <div class="card row">
        <label style="flex:1">Note <textarea [(ngModel)]="note" name="note" rows="2"></textarea></label>
        <button class="secondary" [disabled]="note.trim().length === 0" (click)="run(api.addNote(f.id, note.trim()))">Add note</button>
        @for (a of actionsFor(f); track a.key) {
          <button [disabled]="a.needsNote && note.trim().length < 5" (click)="run(api.transition(f.id, a.key, note.trim()))">{{ a.label }}</button>
        }
      </div>
      <h2>Timeline</h2>
      <ul class="timeline">
        @for (n of f.notes; track $index) { <li><span class="muted">{{ n.at | date: 'd MMM y, HH:mm' }} &middot; {{ n.author }}</span><br />{{ n.text }}</li> }
      </ul>
    }
  `,
  styles: ['.timeline { list-style: none; padding: 0; } .timeline li { padding: 0.5rem 0; border-bottom: 1px solid var(--icw-border); }'],
})
export class FaultDetailPage implements OnInit {
  readonly api = inject(FaultsApi);
  readonly fault = signal<FaultDetail | null>(null);
  readonly problem = signal<ApiProblem | null>(null);
  note = '';

  @Input({ required: true }) id!: string;

  ngOnInit(): void {
    this.run(this.api.get(this.id));
  }

  actionsFor(f: FaultDetail): { key: string; label: string; needsNote: boolean }[] {
    return f.allowedActions.filter((a) => a in PARTNER_ACTIONS).map((key) => ({ key, ...PARTNER_ACTIONS[key] }));
  }

  run(request: Observable<FaultDetail>): void {
    this.problem.set(null);
    request.subscribe({
      next: (f) => {
        this.fault.set(f);
        this.note = '';
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }
}
