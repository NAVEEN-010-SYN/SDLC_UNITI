import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { InventoryApi, TicketsApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { Service, TicketCategory, TicketPriority } from '../../core/models/api.models';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { humanise } from '../../shared/status-badge.component';
import { errorMessage, phoneNumber } from '../../shared/validators';
import { CATEGORIES, allowedPriorities } from './ticket-helpers';

@Component({
  selector: 'gkb-new-ticket',
  standalone: true,
  imports: [ReactiveFormsModule, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/tickets">\u2190 Tickets</a>
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
          @for (s of sites(); track s.id) { <option [value]="s.id">{{ s.code }} \u2013 {{ s.name }}</option> }
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

  private readonly activeSites$ = this.inventory.sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(
    map((p) => p.items),
    catchError(() => of([]))
  );
  readonly sites = toSignal(this.activeSites$, { initialValue: [] });
  private readonly category = toSignal(this.form.controls.category.valueChanges, { initialValue: this.form.controls.category.value });
  private readonly serviceId = toSignal(this.form.controls.serviceId.valueChanges, { initialValue: '' });
  readonly priorities = computed(() => allowedPriorities(this.category(), this.findService(this.serviceId())));

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
    const request = {
      category: v.category,
      priority: v.priority,
      siteId: v.siteId || null,
      serviceId: v.serviceId || null,
      subject: v.subject.trim(),
      description: v.description.trim(),
      contactPhone: v.contactPhone.trim() || null
    };
    this.api.create(request).subscribe({
      next: (t) => void this.router.navigate(['/tickets', t.id]),
      error: (p: ApiProblem) => this.onCreateFailed(p)
    });
  }

  /** A conflict means a fault is already open for the service; show a link to it. */
  private onCreateFailed(p: ApiProblem): void {
    this.busy.set(false);
    if (p.isConflict && typeof p.extensions['ticketId'] === 'string') {
      this.duplicate.set({ id: p.extensions['ticketId'] as string, reference: String(p.extensions['reference'] ?? '') });
      return;
    }
    this.problem.set(p);
    this.unmatched.set(applyProblemToForm(this.form, p));
  }

  private findService(id: string): Service | undefined {
    return this.services().find((s) => s.id === id);
  }

  /** Faults need a service; the selected priority must stay within what the category allows. */
  private syncRules(): void {
    const { category, serviceId, priority } = this.form.controls;
    serviceId.setValidators(category.value === 'FAULT' ? Validators.required : null);
    serviceId.updateValueAndValidity({ emitEvent: false });
    const allowed = allowedPriorities(category.value, this.findService(serviceId.value));
    if (allowed.includes(priority.value)) return;
    priority.setValue(allowed.includes('P3') ? 'P3' : allowed[0]);
  }

  private loadServices(siteId: string): void {
    this.form.controls.serviceId.setValue('');
    if (!siteId) {
      this.services.set([]);
      return;
    }
    this.inventory
      .servicesForSite(siteId)
      .pipe(catchError(() => of([] as Service[])))
      .subscribe((list) => this.services.set(list));
  }
}
