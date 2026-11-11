import { ChangeDetectionStrategy, Component, ElementRef, InjectionToken, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { BillingApi } from '../../core/api/portal-api';
import { AuthService } from '../../core/auth/auth.service';
import { ApiProblem } from '../../core/http/api-problem';
import { CardBrand, PaymentMethod } from '../../core/models/api.models';
import { applyProblemToForm, revealErrors } from '../../shared/form-errors';
import { ProblemAlertComponent } from '../../shared/problem-alert.component';
import { bankAccountNumber, errorMessage, sortCode } from '../../shared/validators';

export interface TokenisedCard {
  token: string;
  brand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
}

/**
 * Card numbers never touch this application: the payment provider's hosted fields are mounted
 * into a container and return a single-use token. Deployments provide an implementation that
 * wraps the provider SDK; without one, only Direct Debit can be added.
 */
export interface CardTokenizer {
  mount(container: HTMLElement): Promise<void>;
  tokenize(): Promise<TokenisedCard>;
  unmount(): void;
}

export const CARD_TOKENIZER = new InjectionToken<CardTokenizer>('CARD_TOKENIZER');

export function describeMethod(m: PaymentMethod): string {
  if (m.kind === 'DIRECT_DEBIT') return `Direct Debit ${m.sortCodeMasked} ••••${m.last4}`;
  const expiry = `${String(m.expiryMonth).padStart(2, '0')}/${String(m.expiryYear).slice(-2)}`;
  return `${m.cardBrand} ••••${m.last4} (expires ${expiry})`;
}

@Component({
  selector: 'gkb-payment-methods',
  standalone: true,
  imports: [ReactiveFormsModule, ProblemAlertComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/billing">← Invoices</a>
    <h1>Payment methods</h1>
    <gkb-problem-alert [problem]="problem()" [extra]="unmatched()" />
    <ul class="cards">
      @for (m of methods(); track m.id) {
        <li class="card">
          <span>{{ describe(m) }}</span>
          @if (m.isDefault) { <span class="badge badge--success">Default</span> }
          @if (m.expired) { <span class="badge badge--danger">Expired</span> } @else if (m.expiresSoon) { <span class="badge badge--warning">Expires soon</span> }
          @if (canManage()) {
            <span class="actions">
              @if (!m.isDefault && !m.expired) { <button type="button" class="link" (click)="makeDefault(m)" [disabled]="busy()">Make default</button> }
              <button type="button" class="link danger" (click)="remove(m)" [disabled]="busy()">Remove</button>
            </span>
          }
        </li>
      } @empty { <li>No payment methods on file.</li> }
    </ul>

    @if (canManage()) {
      <section class="card">
        <h2>Add a payment method</h2>
        <div role="radiogroup" class="segmented">
          <button type="button" [class.active]="mode() === 'DIRECT_DEBIT'" (click)="setMode('DIRECT_DEBIT')">Direct Debit</button>
          <button type="button" [class.active]="mode() === 'CARD'" (click)="setMode('CARD')" [disabled]="!tokenizer">Card</button>
        </div>
        @if (mode() === 'DIRECT_DEBIT') {
          <form [formGroup]="ddForm" (ngSubmit)="addDirectDebit()" novalidate>
            <label>Account holder <input formControlName="holderName" autocomplete="name" /></label>
            @if (err(ddForm.controls.holderName); as e) { <p class="field-error">{{ e }}</p> }
            <label>Sort code <input formControlName="sortCode" inputmode="numeric" placeholder="12-34-56" /></label>
            @if (err(ddForm.controls.sortCode); as e) { <p class="field-error">{{ e }}</p> }
            <label>Account number <input formControlName="accountNumber" inputmode="numeric" autocomplete="off" /></label>
            @if (err(ddForm.controls.accountNumber); as e) { <p class="field-error">{{ e }}</p> }
            <label class="checkbox"><input type="checkbox" formControlName="makeDefault" /> Make this the default</label>
            <label class="checkbox"><input type="checkbox" formControlName="authorised" /> I am authorised to set up Direct Debits on this account</label>
            @if (err(ddForm.controls.authorised); as e) { <p class="field-error">Please confirm you are authorised.</p> }
            <button type="submit" class="primary" [disabled]="busy()">Set up Direct Debit</button>
          </form>
        } @else {
          <div #cardHost class="card-host"></div>
          <label class="checkbox"><input type="checkbox" #cardDefault /> Make this the default</label>
          <button type="button" class="primary" (click)="addCard(cardDefault.checked)" [disabled]="busy()">Save card</button>
        }
      </section>
    }
  `
})
export class PaymentMethodsComponent {
  private readonly api = inject(BillingApi);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  readonly tokenizer = inject(CARD_TOKENIZER, { optional: true });
  private readonly cardHost = viewChild<ElementRef<HTMLElement>>('cardHost');

  readonly methods = signal<PaymentMethod[]>([]);
  readonly mode = signal<'DIRECT_DEBIT' | 'CARD'>('DIRECT_DEBIT');
  readonly busy = signal(false);
  readonly problem = signal<ApiProblem | null>(null);
  readonly unmatched = signal<string[]>([]);
  readonly canManage = computed(() => this.auth.can('billing:manage'));
  readonly describe = describeMethod;
  readonly err = (c: { touched: boolean; errors: Record<string, unknown> | null }) => (c.touched ? errorMessage(c.errors) : null);

  readonly ddForm = this.fb.nonNullable.group({
    holderName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(70)]],
    sortCode: ['', [Validators.required, sortCode()]],
    accountNumber: ['', [Validators.required, bankAccountNumber()]],
    makeDefault: [false],
    authorised: [false, Validators.requiredTrue]
  });

  constructor() {
    this.load();
  }

  setMode(mode: 'DIRECT_DEBIT' | 'CARD'): void {
    this.mode.set(mode);
    if (mode === 'CARD' && this.tokenizer) {
      // The host element renders on the next change-detection pass.
      queueMicrotask(() => {
        const host = this.cardHost()?.nativeElement;
        if (host) void this.tokenizer!.mount(host);
      });
    } else {
      this.tokenizer?.unmount();
    }
  }

  addDirectDebit(): void {
    revealErrors(this.ddForm);
    if (this.ddForm.invalid) return;
    const { holderName, sortCode: sc, accountNumber, makeDefault } = this.ddForm.getRawValue();
    this.mutate(this.api.addPaymentMethod({ kind: 'DIRECT_DEBIT', holderName: holderName.trim(), sortCode: sc, accountNumber, makeDefault }), () =>
      this.ddForm.reset()
    );
  }

  async addCard(makeDefault: boolean): Promise<void> {
    if (!this.tokenizer) return;
    this.busy.set(true);
    try {
      const card = await this.tokenizer.tokenize();
      const holderName = this.auth.session()?.account.name ?? 'Account holder';
      this.mutate(
        this.api.addPaymentMethod({
          kind: 'CARD',
          providerToken: card.token,
          holderName,
          cardBrand: card.brand,
          last4: card.last4,
          expiryMonth: card.expiryMonth,
          expiryYear: card.expiryYear,
          makeDefault
        })
      );
    } catch {
      this.busy.set(false);
      this.problem.set(new ApiProblem(422, 'Card not accepted', 'Please check the card details and try again.', 'card-tokenize'));
    }
  }

  makeDefault(m: PaymentMethod): void {
    this.mutate(this.api.makeDefault(m.id));
  }

  remove(m: PaymentMethod): void {
    if (!confirm(`Remove ${describeMethod(m)}?`)) return;
    this.mutate(this.api.removePaymentMethod(m.id));
  }

  private mutate(call: Observable<unknown>, onSuccess?: () => void): void {
    this.busy.set(true);
    this.problem.set(null);
    this.unmatched.set([]);
    call.subscribe({
      next: () => {
        onSuccess?.();
        this.load();
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
        this.unmatched.set(applyProblemToForm(this.ddForm, p));
      }
    });
  }

  private load(): void {
    this.api.paymentMethods().subscribe({
      next: (items) => {
        this.methods.set(items);
        this.busy.set(false);
      },
      error: (p: ApiProblem) => {
        this.busy.set(false);
        this.problem.set(p);
      }
    });
  }
}
