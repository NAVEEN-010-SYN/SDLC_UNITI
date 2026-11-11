import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { catchError, map, of, startWith } from 'rxjs';
import { InventoryApi, OrdersApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { CatalogueProduct, OrderQuote, OrderRequest, OrderType, Service } from '../../core/models/api.models';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { MoneyPipe } from '../../shared/money.pipe';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { errorMessage, leadTimeDate } from '../../shared/validators';

export const ORDER_TYPES: Array<{ value: OrderType; label: string; hint: string }> = [
  { value: 'PROVIDE', label: 'New connection', hint: 'Install fibre connectivity at a site' },
  { value: 'ADD', label: 'Add a service', hint: 'Voice, SD-WAN or hosted services on an existing site' },
  { value: 'CHANGE', label: 'Change speed', hint: 'Upgrade or downgrade an existing service' },
  { value: 'MOVE', label: 'Move a service', hint: 'Relocate a service to another of your sites' },
  { value: 'CEASE', label: 'Cease a service', hint: 'Stop a service at the end of its notice period' }
];

export interface OrderFields {
  service: boolean;
  product: boolean;
  targetSite: boolean;
  minLeadDays: number;
}

/** Which inputs each order type needs, mirroring the API's order-planner rules. */
export function fieldsFor(type: OrderType): OrderFields {
  switch (type) {
    case 'PROVIDE':
      return { service: false, product: true, targetSite: false, minLeadDays: 10 };
    case 'ADD':
      return { service: false, product: true, targetSite: false, minLeadDays: 1 };
    case 'CHANGE':
      return { service: true, product: true, targetSite: false, minLeadDays: 1 };
    case 'MOVE':
      return { service: true, product: false, targetSite: true, minLeadDays: 10 };
    case 'CEASE':
      return { service: true, product: false, targetSite: false, minLeadDays: 30 };
  }
}

/** Products offered for an order type: PROVIDE/CHANGE are connectivity, ADD is add-ons. */
export function productsFor(type: OrderType, products: CatalogueProduct[], current?: Service): CatalogueProduct[] {
  if (type === 'PROVIDE') return products.filter((p) => p.category === 'BROADBAND');
  if (type === 'ADD') return products.filter((p) => p.category !== 'BROADBAND');
  if (type === 'CHANGE' && current) {
    return products.filter((p) => p.category === current.category && p.code !== current.productCode);
  }
  return [];
}

type WizardField = 'orderType' | 'siteId' | 'serviceId' | 'productCode' | 'targetSiteId' | 'requestedDate' | 'notes';

const MAX_LEAD_DAYS = 180;
const STEPS = ['Order type', 'Service details', 'Schedule', 'Review'] as const;

@Component({
  selector: 'gkb-order-wizard',
  standalone: true,
  imports: [ReactiveFormsModule, MoneyPipe, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/orders">← Orders</a>
    <h1>New order</h1>
    <ol class="stepper">
      @for (label of steps; track label; let i = $index) {
        <li [class.current]="i === step()" [class.done]="i < step()" [attr.aria-current]="i === step() ? 'step' : null">{{ label }}</li>
      }
    </ol>
    <gkb-problem-alert [problem]="problem()" [extra]="unmatched()" />

    <form [formGroup]="form" (ngSubmit)="next()" novalidate>
      @switch (step()) {
        @case (0) {
          <fieldset>
            <legend>What would you like to do?</legend>
            @for (t of orderTypes; track t.value) {
              <label class="radio-card">
                <input type="radio" formControlName="orderType" [value]="t.value" />
                <strong>{{ t.label }}</strong><span>{{ t.hint }}</span>
              </label>
            }
          </fieldset>
          <label>Site
            <select formControlName="siteId">
              <option value="">Choose a site</option>
              @for (s of sites(); track s.id) { <option [value]="s.id">{{ s.code }} – {{ s.name }}</option> }
            </select>
          </label>
          @if (err('siteId'); as e) { <p class="field-error">{{ e }}</p> }
        }
        @case (1) {
          @if (fields().service) {
            <label>Service
              <select formControlName="serviceId">
                <option value="">Choose a service</option>
                @for (svc of services(); track svc.id) { <option [value]="svc.id">{{ svc.productName }} ({{ svc.status }})</option> }
              </select>
            </label>
            @if (err('serviceId'); as e) { <p class="field-error">{{ e }}</p> }
          }
          @if (fields().product) {
            <label>Product
              <select formControlName="productCode">
                <option value="">Choose a product</option>
                @for (p of availableProducts(); track p.code) {
                  <option [value]="p.code">{{ p.name }} – {{ p.monthlyPriceMinor | money }}/month</option>
                }
              </select>
            </label>
            @if (err('productCode'); as e) { <p class="field-error">{{ e }}</p> }
          }
          @if (fields().targetSite) {
            <label>Move to site
              <select formControlName="targetSiteId">
                <option value="">Choose the destination</option>
                @for (s of targetSites(); track s.id) { <option [value]="s.id">{{ s.code }} – {{ s.name }}</option> }
              </select>
            </label>
            @if (err('targetSiteId'); as e) { <p class="field-error">{{ e }}</p> }
          }
        }
        @case (2) {
          <label>Requested date
            <input type="date" formControlName="requestedDate" />
          </label>
          <p class="hint">At least {{ fields().minLeadDays }} days from today, on a weekday.</p>
          @if (err('requestedDate'); as e) { <p class="field-error">{{ e }}</p> }
          <label>Notes for the installation team
            <textarea formControlName="notes" rows="4" maxlength="1000"></textarea>
          </label>
        }
        @case (3) {
          @if (quote(); as q) {
            <dl class="summary">
              <dt>Order</dt><dd>{{ typeLabel() }}</dd>
              @if (q.productCode) { <dt>Product</dt><dd>{{ q.productCode }}</dd> }
              <dt>Monthly change</dt><dd>{{ q.monthlyDeltaMinor | money: 'GBP' : true }}</dd>
              <dt>One-off charge</dt><dd>{{ q.oneOffChargeMinor | money }}</dd>
            </dl>
            @if (q.requiresApproval) {
              <p class="alert alert--info">This order exceeds your account's approval threshold and will be sent to a business admin for approval.</p>
            }
          } @else if (quoting()) { <p>Calculating charges…</p> }
        }
      }

      <div class="actions">
        @if (step() > 0) { <button type="button" class="secondary" (click)="back()">Back</button> }
        @if (step() < 3) {
          <button type="submit" class="primary">Continue</button>
        } @else {
          <button type="button" class="secondary" (click)="place(false)" [disabled]="busy() || !quote()">Save as draft</button>
          <button type="button" class="primary" (click)="place(true)" [disabled]="busy() || !quote()">Submit order</button>
        }
      </div>
    </form>
  `
})
export class OrderWizardComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly ordersApi = inject(OrdersApi);
  private readonly inventoryApi = inject(InventoryApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** Optional pre-selected site from `?siteId=`. */
  readonly siteId = input<string | undefined>(undefined);

  readonly steps = STEPS;
  readonly orderTypes = ORDER_TYPES;
  readonly step = signal(0);
  readonly quote = signal<OrderQuote | null>(null);
  readonly quoting = signal(false);
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly services = signal<Service[]>([]);

  readonly form = this.fb.nonNullable.group({
    orderType: this.fb.nonNullable.control<OrderType>('PROVIDE', Validators.required),
    siteId: ['', Validators.required],
    serviceId: [''],
    productCode: [''],
    targetSiteId: [''],
    requestedDate: [''],
    notes: ['', Validators.maxLength(1000)]
  });

  private readonly orderType = toSignal(this.form.controls.orderType.valueChanges.pipe(startWith(this.form.controls.orderType.value)), {
    requireSync: true
  });
  private readonly selectedSite = toSignal(this.form.controls.siteId.valueChanges, { initialValue: '' });
  private readonly selectedService = toSignal(this.form.controls.serviceId.valueChanges, { initialValue: '' });

  readonly fields = computed(() => fieldsFor(this.orderType()));
  readonly typeLabel = computed(() => ORDER_TYPES.find((t) => t.value === this.orderType())?.label ?? '');

  private readonly products = toSignal(this.ordersApi.products().pipe(catchError(() => of([] as CatalogueProduct[]))), { initialValue: [] });
  readonly sites = toSignal(
    this.inventoryApi.sites({ status: 'ACTIVE' }, { page: 1, pageSize: 100 }).pipe(
      map((p) => p.items),
      catchError(() => of([]))
    ),
    { initialValue: [] }
  );
  readonly targetSites = computed(() => this.sites().filter((s) => s.id !== this.selectedSite()));
  readonly availableProducts = computed(() =>
    productsFor(this.orderType(), this.products(), this.services().find((s) => s.id === this.selectedService()))
  );

  ngOnInit(): void {
    const preselected = this.siteId();
    if (preselected) this.form.controls.siteId.setValue(preselected);
    this.form.controls.orderType.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.applyTypeRules());
    this.form.controls.siteId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((siteId) => this.loadServices(siteId));
    this.applyTypeRules();
    if (preselected) this.loadServices(preselected);
  }

  err(name: WizardField): string | null {
    const control = this.form.controls[name];
    return control.touched ? errorMessage(control.errors) : null;
  }

  next(): void {
    const controls = this.controlsForStep(this.step());
    controls.forEach((c) => revealErrors(c));
    if (controls.some((c) => c.invalid)) return;
    this.step.update((s) => s + 1);
    if (this.step() === 3) this.requestQuote();
  }

  back(): void {
    this.problem.set(null);
    this.step.update((s) => Math.max(0, s - 1));
  }

  /** Builds the API request, omitting fields the chosen order type does not use. */
  toRequest(): OrderRequest {
    const v = this.form.getRawValue();
    const f = fieldsFor(v.orderType);
    return {
      orderType: v.orderType,
      siteId: v.siteId,
      serviceId: f.service ? v.serviceId : null,
      productCode: f.product ? v.productCode : null,
      targetSiteId: f.targetSite ? v.targetSiteId : null,
      requestedDate: v.requestedDate || null,
      notes: v.notes.trim() || null
    };
  }

  place(submit: boolean): void {
    this.busy.set(true);
    this.problem.set(null);
    this.ordersApi.create(this.toRequest(), submit).subscribe({
      next: (order) => void this.router.navigate(['/orders', order.id]),
      error: (problem: ApiProblem) => this.fail(problem)
    });
  }

  private requestQuote(): void {
    this.quote.set(null);
    this.quoting.set(true);
    this.ordersApi.quote(this.toRequest()).subscribe({
      next: (q) => {
        this.quote.set(q);
        this.quoting.set(false);
      },
      error: (problem: ApiProblem) => {
        this.quoting.set(false);
        this.fail(problem);
      }
    });
  }

  /** Server-side field errors send the user back to the step that owns the field. */
  private fail(problem: ApiProblem): void {
    this.busy.set(false);
    this.problem.set(problem);
    this.unmatched.set(applyProblemToForm(this.form, problem));
    const fieldStep: Record<string, number> = { orderType: 0, siteId: 0, serviceId: 1, productCode: 1, targetSiteId: 1, requestedDate: 2, notes: 2 };
    const steps = problem.fieldErrors.map((e) => fieldStep[e.field.replace(/^body\./, '')]).filter((s): s is number => s !== undefined);
    if (steps.length) this.step.set(Math.min(...steps));
  }

  private applyTypeRules(): void {
    const f = fieldsFor(this.form.controls.orderType.value);
    const { serviceId, productCode, targetSiteId, requestedDate } = this.form.controls;
    const set = (control: typeof serviceId, required: boolean, extra: ValidatorFn[] = []) => {
      control.setValidators(required ? [Validators.required, ...extra] : extra);
      if (!required) control.setValue('');
      control.updateValueAndValidity({ emitEvent: false });
    };
    set(serviceId, f.service);
    set(productCode, f.product);
    set(targetSiteId, f.targetSite);
    requestedDate.setValidators(leadTimeDate({ minLeadDays: f.minLeadDays, maxLeadDays: MAX_LEAD_DAYS, weekdaysOnly: true }));
    requestedDate.updateValueAndValidity({ emitEvent: false });
    this.quote.set(null);
  }

  private loadServices(siteId: string): void {
    this.form.controls.serviceId.setValue('');
    if (!siteId) {
      this.services.set([]);
      return;
    }
    this.inventoryApi
      .servicesForSite(siteId)
      .pipe(catchError(() => of([] as Service[])), takeUntilDestroyed(this.destroyRef))
      .subscribe((list) => this.services.set(list));
  }

  private controlsForStep(step: number) {
    const c = this.form.controls;
    return [[c.orderType, c.siteId], [c.serviceId, c.productCode, c.targetSiteId], [c.requestedDate, c.notes], []][step] ?? [];
  }
}
