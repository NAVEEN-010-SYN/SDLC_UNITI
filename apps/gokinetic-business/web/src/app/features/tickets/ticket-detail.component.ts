import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, switchMap } from 'rxjs';
import { TicketsApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Ticket, TicketDetail } from '../../core/models/api.models';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { transitionLabel } from './ticket-helpers';

@Component({
  selector: 'gkb-ticket-detail',
  standalone: true,
  imports: [StatusBadgeComponent, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/tickets">\u2190 Tickets</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (ticket(); as t) {
      <header class="page-header">
        <h1>{{ t.reference }} \u2013 {{ t.subject }}</h1>
        <gkb-status-badge [status]="t.priority" /> <gkb-status-badge [status]="t.status" />
        @if (t.escalationLevel > 0) { <span class="badge badge--danger">Escalation level {{ t.escalationLevel }}</span> }
      </header>
      <dl class="summary">
        <dt>First response</dt><dd><gkb-status-badge [status]="t.sla.response.state" /> due {{ t.sla.response.dueAt | date: 'd MMM y, HH:mm' }}</dd>
        <dt>Resolution</dt><dd><gkb-status-badge [status]="t.sla.resolution.state" /> due {{ t.sla.resolution.dueAt | date: 'd MMM y, HH:mm' }}</dd>
      </dl>
      <p class="description">{{ t.description }}</p>

      <div class="actions">
        @for (s of t.allowedStatuses; track s) {
          <button type="button" class="secondary" (click)="act(api.changeStatus(t, s))" [disabled]="busy()">{{ transition(t.status, s) }}</button>
        }
        @if (canEscalate()) {
          <button type="button" class="danger" (click)="escalating.set(!escalating())">Escalate</button>
        }
      </div>
      @if (escalating()) {
        <form class="card" (ngSubmit)="escalate(t)">
          <label>Why does this need escalating? <textarea [formControl]="escalationReason" rows="3"></textarea></label>
          <button type="submit" class="danger" [disabled]="busy() || escalationReason.invalid">Confirm escalation</button>
        </form>
      }

      <h2>Updates</h2>
      <ol class="timeline">
        @for (e of t.events; track e.id) {
          <li>
            <time>{{ e.createdAt | date: 'd MMM y, HH:mm' }}</time>
            @switch (e.kind) {
              @case ('COMMENT') { <p>{{ e.body }}</p> }
              @case ('STATUS_CHANGE') { <p>Status changed to <gkb-status-badge [status]="e.toValue ?? ''" /> @if (e.body) { \u2013 {{ e.body }} }</p> }
              @case ('ESCALATION') { <p>Escalated to level {{ e.toValue }}: {{ e.body }}</p> }
              @case ('PRIORITY_CHANGE') { <p>Priority changed from {{ e.fromValue }} to {{ e.toValue }}</p> }
            }
          </li>
        } @empty { <li>No updates yet.</li> }
      </ol>
      @if (t.status !== 'CLOSED') {
        <form (ngSubmit)="reply(t)">
          <label>Add an update <textarea [formControl]="comment" rows="4" maxlength="5000"></textarea></label>
          <button type="submit" class="primary" [disabled]="busy() || comment.invalid">Send</button>
        </form>
      }
    }
  `
})
export class TicketDetailComponent {
  readonly api = inject(TicketsApi);
  private readonly auth = inject(AuthService);
  readonly id = input.required<string>();
  readonly busy = signal(false);
  readonly escalating = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly transition = transitionLabel;
  readonly comment = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(5000)] });
  readonly escalationReason = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(10)] });

  private readonly refresh = new Subject<void>();
  // Reload when the route id changes or after a mutation.
  private readonly ticketIds$ = merge(toObservable(this.id), this.refresh.pipe(map(() => this.id())));
  private readonly ticket$ = this.ticketIds$.pipe(switchMap((id) => this.loadTicket(id)));
  readonly ticket = toSignal(this.ticket$, { initialValue: null as TicketDetail | null });

  readonly canEscalate = computed(() => {
    const t = this.ticket();
    if (!t) return false;
    if (!this.auth.can('tickets:escalate')) return false;
    if (t.escalationLevel >= 3) return false;
    return t.status !== 'RESOLVED' && t.status !== 'CLOSED';
  });

  reply(t: Ticket): void {
    this.act(this.api.comment(t, this.comment.value.trim()), () => this.comment.reset());
  }

  escalate(t: Ticket): void {
    this.act(this.api.escalate(t, this.escalationReason.value.trim()), () => {
      this.escalationReason.reset();
      this.escalating.set(false);
    });
  }

  /** All mutations carry the ticket version; a 409 means someone else updated it, so reload. */
  act(call: Observable<Ticket>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.problem.set(null);
    call.subscribe({
      next: () => {
        this.busy.set(false);
        onSuccess?.();
        this.refresh.next();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
        if (p.isConflict) this.refresh.next();
      }
    });
  }

  private loadTicket(id: string): Observable<TicketDetail | null> {
    return this.api.get(id).pipe(
      catchError((p: ApiProblem) => {
        this.problem.set(p);
        return of(null);
      })
    );
  }
}
