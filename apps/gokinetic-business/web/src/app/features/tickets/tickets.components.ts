import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subject, catchError, map, merge, of, switchMap } from 'rxjs';
import { InventoryApi, TicketFilter, TicketsApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { Service, Ticket, TicketCategory, TicketDetail, TicketPriority, TicketStatus } from '../../core/models/api.models';
import { CellDirective, Column, DataTableComponent } from '../../shared/data-table.component';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { pagedQuery } from '../../shared/paged-query';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { StatusBadgeComponent, humanise } from '../../shared/status-badge.component';
import { errorMessage, phoneNumber } from '../../shared/validators';

const CATEGORIES: TicketCategory[] = ['FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL'];
const PRIORITIES: TicketPriority[] = ['P1', 'P2', 'P3', 'P4'];

/** Priorities a customer may pick, mirroring the API's ticket-shape rules. */
export function allowedPriorities(category: TicketCategory, service: Service | undefined): TicketPriority[] {
  if (category === 'BILLING') return ['P3', 'P4'];
  if (category === 'FAULT' && service?.status === 'ACTIVE') return PRIORITIES;
  return ['P2', 'P3', 'P4'];
}

/** Customer-facing label for a status transition button. */
export function transitionLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'CLOSED') return from === 'RESOLVED' ? 'Confirm resolved' : 'Withdraw ticket';
  if (from === 'RESOLVED' && to === 'IN_PROGRESS') return 'Reopen';
  return `Mark ${humanise(to).toLowerCase()}`;
}

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

@Component({
  selector: 'gkb-new-ticket',
  standalone: true,
  imports: [ReactiveFormsModule, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/tickets">← Tickets</a>
    <h1>Raise a support ticket</h1>
    <gkb-problem-alert [problem]="problem()" [extra]="unmatched()" />
    @if (duplicate(); as d) {
      <p class="alert alert--info">A fault is already open for this service: <a [routerLink]="['/tickets', d.id]">{{ d.reference }}</a>. Please add details there instead.</p>
    }
    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      <label>Category
        <select formControlName="category">
          @for (c of categories; track c) { <option [value]="c">{{ label(c) }}</option> }
        </select>
      </label>
      <label>Site
        <select formControlName="siteId">
          <option value="">Not site specific</option>
          @for (s of sites(); track s.id) { <option [value]="s.id">{{ s.code }} – {{ s.name }}</option> }
        </select>
      </label>
      <label>Service
        <select formControlName="serviceId">
          <option value="">Not service specific</option>
          @for (svc of services(); track svc.id) { <option [value]="svc.id">{{ svc.productName }}</option> }
        </select>
      </label>
      @if (err('serviceId'); as e) { <p class="field-error">{{ e }}</p> }
      <label>Priority
        <select formControlName="priority">
          @for (p of priorities(); track p) { <option [value]="p">{{ p }}</option> }
        </select>
      </label>
      <p class="hint">P1 is for a complete loss of an active service.</p>
      <label>Subject <input formControlName="subject" maxlength="140" /></label>
      @if (err('subject'); as e) { <p class="field-error">{{ e }}</p> }
      <label>Description <textarea formControlName="description" rows="6" maxlength="5000"></textarea></label>
      @if (err('description'); as e) { <p class="field-error">{{ e }}</p> }
      <label>Contact phone <input formControlName="contactPhone" type="tel" autocomplete="tel" /></label>
      @if (err('contactPhone'); as e) { <p class="field-error">{{ e }}</p> }
      <button type="submit" class="primary" [disabled]="busy()">Submit ticket</button>
    </form>
  `
})
export class NewTicketComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TicketsApi);
  private readonly inventory = inject(InventoryApi);
  private readonly router = inject(Router);
  readonly siteId = input<string | undefined>(undefined);

  readonly categories = CATEGORIES;
  readonly label = humanise;
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly duplicate = signal<{ id: string; reference: string } | null>(null);
  readonly services = signal<Service[]>([]);

  readonly form = this.fb.nonNullable.group({
    category: this.fb.nonNullable.control<TicketCategory>('FAULT'),
    siteId: [''],
    serviceId: [''],
    priority: this.fb.nonNullable.control<TicketPriority>('P3'),
    subject: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(140)]],
    description: ['', [Validators.required, Validators.minLength(20), Validators.maxLength(5000)]],
    contactPhone: ['', phoneNumber()]
  });

  readonly sites = toSignal(
    this.inventory.sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(map((p) => p.items), catchError(() => of([]))),
    { initialValue: [] }
  );
  private readonly category = toSignal(this.form.controls.category.valueChanges, { initialValue: this.form.controls.category.value });
  private readonly serviceId = toSignal(this.form.controls.serviceId.valueChanges, { initialValue: '' });
  readonly priorities = computed(() => allowedPriorities(this.category(), this.services().find((s) => s.id === this.serviceId())));

  ngOnInit(): void {
    this.form.controls.siteId.valueChanges.subscribe((id) => this.loadServices(id));
    this.form.controls.category.valueChanges.subscribe(() => this.syncRules());
    this.form.controls.serviceId.valueChanges.subscribe(() => this.syncRules());
    const preselected = this.siteId();
    if (preselected) this.form.controls.siteId.setValue(preselected);
    this.syncRules();
  }

  err(name: 'serviceId' | 'subject' | 'description' | 'contactPhone'): string | null {
    const c = this.form.controls[name];
    return c.touched ? errorMessage(c.errors) : null;
  }

  submit(): void {
    revealErrors(this.form);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.problem.set(null);
    this.duplicate.set(null);
    this.api
      .create({
        category: v.category,
        priority: v.priority,
        siteId: v.siteId || null,
        serviceId: v.serviceId || null,
        subject: v.subject.trim(),
        description: v.description.trim(),
        contactPhone: v.contactPhone.trim() || null
      })
      .subscribe({
        next: (t) => void this.router.navigate(['/tickets', t.id]),
        error: (p: ApiProblem) => {
          this.busy.set(false);
          if (p.isConflict && typeof p.extensions['ticketId'] === 'string') {
            this.duplicate.set({ id: p.extensions['ticketId'] as string, reference: String(p.extensions['reference'] ?? '') });
            return;
          }
          this.problem.set(p);
          this.unmatched.set(applyProblemToForm(this.form, p));
        }
      });
  }

  /** Faults need a service; the selected priority must stay within what the category allows. */
  private syncRules(): void {
    const { category, serviceId, priority } = this.form.controls;
    serviceId.setValidators(category.value === 'FAULT' ? Validators.required : null);
    serviceId.updateValueAndValidity({ emitEvent: false });
    const allowed = allowedPriorities(category.value, this.services().find((s) => s.id === serviceId.value));
    if (!allowed.includes(priority.value)) priority.setValue(allowed.includes('P3') ? 'P3' : allowed[0]);
  }

  private loadServices(siteId: string): void {
    this.form.controls.serviceId.setValue('');
    if (!siteId) return this.services.set([]);
    this.inventory.servicesForSite(siteId).pipe(catchError(() => of([] as Service[]))).subscribe((list) => this.services.set(list));
  }
}

@Component({
  selector: 'gkb-ticket-detail',
  standalone: true,
  imports: [StatusBadgeComponent, DatePipe, ProblemAlertComponent, RouterLink, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/tickets">← Tickets</a>
    <gkb-problem-alert [problem]="problem()" />
    @if (ticket(); as t) {
      <header class="page-header">
        <h1>{{ t.reference }} – {{ t.subject }}</h1>
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
              @case ('STATUS_CHANGE') { <p>Status changed to <gkb-status-badge [status]="e.toValue ?? ''" /> @if (e.body) { – {{ e.body }} }</p> }
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
  readonly ticket = toSignal(
    merge(toObservable(this.id), this.refresh.pipe(map(() => this.id()))).pipe(
      switchMap((id) => this.api.get(id).pipe(catchError((p: ApiProblem) => (this.problem.set(p), of(null)))))
    ),
    { initialValue: null as TicketDetail | null }
  );
  readonly canEscalate = computed(() => {
    const t = this.ticket();
    return !!t && this.auth.can('tickets:escalate') && t.escalationLevel < 3 && !['RESOLVED', 'CLOSED'].includes(t.status);
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
}
