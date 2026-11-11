# Go Kinetic Business self-care (B2B): apps/gokinetic-business/web (part 8 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `apps/gokinetic-business/web/src/app/shared/paged-query.ts` (84 lines)
- `apps/gokinetic-business/web/src/app/shared/problem-alert.component.ts` (38 lines)
- `apps/gokinetic-business/web/src/app/shared/shared.spec.ts` (122 lines)
- `apps/gokinetic-business/web/src/app/shared/status-badge.component.ts` (61 lines)
- `apps/gokinetic-business/web/src/app/shared/validators.ts` (106 lines)
- `apps/gokinetic-business/web/src/environments/environment.development.ts` (13 lines)
- `apps/gokinetic-business/web/src/environments/environment.ts` (17 lines)
- `apps/gokinetic-business/web/src/index.html` (15 lines)
- `apps/gokinetic-business/web/src/main.ts` (15 lines)
- `apps/gokinetic-business/web/src/styles.scss` (111 lines)
- `apps/gokinetic-business/web/tsconfig.app.json` (10 lines)
- `apps/gokinetic-business/web/tsconfig.json` (30 lines)
- `apps/gokinetic-business/web/tsconfig.spec.json` (9 lines)

## apps/gokinetic-business/web/src/app/shared/paged-query.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/paged-query.ts`.

```typescript
import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, of, switchMap, tap } from 'rxjs';
import { ApiProblem } from '../core/http/api-problem';
import { Page, PageRequest } from '../core/models/api.models';

export interface PagedQuery<F, T> {
  readonly filter: Signal<F>;
  readonly page: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly items: Signal<T[]>;
  readonly total: Signal<number>;
  readonly loading: Signal<boolean>;
  readonly error: Signal<ApiProblem | null>;
  setFilter(patch: Partial<F>): void;
  setPage(page: number, pageSize?: number): void;
  reload(): void;
}

/**
 * Signal-backed list state for paginated endpoints. A new filter resets to page 1, and
 * switchMap discards responses to superseded requests so fast typing never shows stale rows.
 * Must be created in an injection context (component field initialiser).
 */
export function pagedQuery<F extends object, T>(
  fetch: (filter: F, page: PageRequest) => Observable<Page<T>>,
  initialFilter: F,
  initialPageSize = 20
): PagedQuery<F, T> {
  const destroyRef = inject(DestroyRef);
  const filter = signal(initialFilter);
  const page = signal(1);
  const pageSize = signal(initialPageSize);
  const result = signal<Page<T> | null>(null);
  const loading = signal(false);
  const error = signal<ApiProblem | null>(null);
  const requests = new Subject<{ filter: F; page: PageRequest }>();

  requests
    .pipe(
      tap(() => {
        loading.set(true);
        error.set(null);
      }),
      switchMap((req) =>
        fetch(req.filter, req.page).pipe(
          catchError((err: unknown) => {
            error.set(err instanceof ApiProblem ? err : new ApiProblem(0, 'Request failed', String(err), 'unknown'));
            return of(null);
          })
        )
      ),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe((res) => {
      if (res) result.set(res);
      loading.set(false);
    });

  const load = () => requests.next({ filter: filter(), page: { page: page(), pageSize: pageSize() } });
  load();

  return {
    filter: filter.asReadonly(),
    page: page.asReadonly(),
    pageSize: pageSize.asReadonly(),
    items: computed(() => result()?.items ?? []),
    total: computed(() => result()?.total ?? 0),
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    setFilter(patch) {
      filter.update((f) => ({ ...f, ...patch }));
      page.set(1);
      load();
    },
    setPage(next, size) {
      page.set(next);
      if (size !== undefined) pageSize.set(size);
      load();
    },
    reload: load
  };
}
```

## apps/gokinetic-business/web/src/app/shared/problem-alert.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/problem-alert.component.ts`.

```typescript
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ApiProblem } from '../core/http/api-problem';

/** Renders an API problem with the correlation id customers quote to support. */
@Component({
  selector: 'gkb-problem-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (problem(); as p) {
      <div class="alert alert--danger" role="alert">
        <strong>{{ p.title }}</strong>
        @if (p.detail && p.detail !== p.title) { <p>{{ p.detail }}</p> }
        @if (rowErrors().length) {
          <ul>
            @for (e of rowErrors(); track $index) { <li>{{ e }}</li> }
          </ul>
        }
        @if (p.correlationId) { <small>Reference: <code>{{ p.correlationId }}</code></small> }
      </div>
    }
  `
})
export class ProblemAlertComponent {
  readonly problem = input<ApiProblem | null>(null);
  /** Extra messages, e.g. field errors that matched no form control or per-row bulk errors. */
  readonly extra = input<string[]>([]);

  readonly rowErrors = computed(() => {
    const p = this.problem();
    const nested = p?.extensions['rowErrors'];
    const fromRules = Array.isArray(nested)
      ? nested.map((e: { row?: number; field?: string; message?: string }) => (e.row ? `Row ${e.row}: ` : '') + `${e.message ?? ''}`)
      : [];
    return [...fromRules, ...this.extra()];
  });
}
```

## apps/gokinetic-business/web/src/app/shared/shared.spec.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/shared.spec.ts`.

```typescript
import { FormControl, FormGroup } from '@angular/forms';
import { ApiProblem } from '../core/http/api-problem';
import { applyProblemToForm } from './form-errors';
import { MoneyPipe, PercentPipe, formatMinor } from './money.pipe';
import { humanise, toneFor } from './status-badge.component';
import { cardNotExpired, errorMessage, leadTimeDate, moneyAmount, parseMoneyToMinor, sortCode, ukPostcode } from './validators';

describe('MoneyPipe', () => {
  const pipe = new MoneyPipe();

  it('formats minor units as GBP', () => {
    expect(pipe.transform(123456)).toBe('£1,234.56');
    expect(pipe.transform(5)).toBe('£0.05');
  });

  it('respects currencies without minor units', () => {
    expect(formatMinor(1500, 'JPY')).toBe('JP¥1,500');
  });

  it('shows signs for deltas when requested', () => {
    expect(pipe.transform(2000, 'GBP', true)).toBe('+£20.00');
    expect(pipe.transform(-2000, 'GBP', true)).toBe('-£20.00');
    expect(pipe.transform(0, 'GBP', true)).toBe('£0.00');
  });

  it('renders a dash for missing amounts', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform(undefined)).toBe('—');
  });
});

describe('PercentPipe', () => {
  const pipe = new PercentPipe();
  it('formats milli-percent and basis points', () => {
    expect(pipe.transform(99_950)).toBe('99.950%');
    expect(pipe.transform(7_500, 'bps')).toBe('75.00%');
    expect(pipe.transform(null)).toBe('—');
  });
});

describe('status badge helpers', () => {
  it('maps statuses to tones', () => {
    expect(toneFor('ACTIVE')).toBe('success');
    expect(toneFor('OVERDUE')).toBe('danger');
    expect(toneFor('PENDING_CUSTOMER')).toBe('warning');
    expect(toneFor('SOMETHING_NEW')).toBe('neutral');
  });

  it('humanises enum values', () => {
    expect(humanise('PENDING_CUSTOMER')).toBe('Pending customer');
  });
});

describe('validators', () => {
  it('validates UK postcodes', () => {
    expect(ukPostcode()(new FormControl('EC1A 1BB'))).toBeNull();
    expect(ukPostcode()(new FormControl('ec1a1bb'))).toBeNull();
    expect(ukPostcode()(new FormControl('12345'))).toEqual({ postcode: true });
    expect(ukPostcode()(new FormControl(''))).toBeNull();
  });

  it('accepts formatted sort codes', () => {
    expect(sortCode()(new FormControl('12-34-56'))).toBeNull();
    expect(sortCode()(new FormControl('12-34-5'))).toEqual({ sortCode: true });
  });

  it('parses money without floating point error', () => {
    expect(parseMoneyToMinor('1,234.5')).toBe(123450);
    expect(parseMoneyToMinor('£0.07')).toBe(7);
    expect(parseMoneyToMinor('19.999')).toBeNull();
    expect(parseMoneyToMinor('-5')).toBeNull();
    expect(moneyAmount(1000)(new FormControl('10.01'))).toEqual({ moneyMax: { max: 1000 } });
  });

  describe('leadTimeDate', () => {
    const today = () => new Date('2024-06-03T10:00:00Z'); // Monday
    const validator = leadTimeDate({ minLeadDays: 10, maxLeadDays: 180, weekdaysOnly: true, today });

    it('enforces the minimum lead time', () => {
      expect(validator(new FormControl('2024-06-12'))).toEqual({ leadTooShort: { min: 10 } });
      expect(validator(new FormControl('2024-06-13'))).toBeNull();
    });

    it('rejects weekends and dates too far ahead', () => {
      expect(validator(new FormControl('2024-06-15'))).toEqual({ weekend: true });
      expect(validator(new FormControl('2025-01-31'))).toEqual({ leadTooLong: { max: 180 } });
    });

    it('rejects malformed dates', () => {
      expect(validator(new FormControl('13/06/2024'))).toEqual({ date: true });
    });
  });

  it('treats a card as valid through its expiry month', () => {
    const today = () => new Date('2024-06-15T00:00:00Z');
    const group = (m: number, y: number) => new FormGroup({ expiryMonth: new FormControl(m), expiryYear: new FormControl(y) });
    expect(cardNotExpired('expiryMonth', 'expiryYear', today)(group(6, 2024))).toBeNull();
    expect(cardNotExpired('expiryMonth', 'expiryYear', today)(group(5, 2024))).toEqual({ cardExpired: true });
  });

  it('produces readable messages', () => {
    expect(errorMessage({ required: true })).toBe('This field is required');
    expect(errorMessage({ leadTooShort: { min: 10 } })).toBe('Choose a date at least 10 days from today');
    expect(errorMessage({ server: { message: 'Already taken' } })).toBe('Already taken');
    expect(errorMessage(null)).toBeNull();
  });
});

describe('applyProblemToForm', () => {
  it('maps body.* field errors onto controls and returns the rest', () => {
    const form = new FormGroup({ email: new FormControl('x') });
    const problem = new ApiProblem(400, 'Invalid request', '', 'validation-error', [
      { field: 'body.email', message: 'Invalid email' },
      { field: 'body.unknown', message: 'Nope' }
    ]);
    const unmatched = applyProblemToForm(form, problem);
    expect(form.controls.email.errors).toEqual({ server: { message: 'Invalid email' } });
    expect(form.controls.email.touched).toBeTrue();
    expect(unmatched).toEqual(['unknown: Nope']);
  });
});
```

## apps/gokinetic-business/web/src/app/shared/status-badge.component.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/status-badge.component.ts`.

```typescript
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** One vocabulary of tones across orders, services, invoices, tickets, users and SLA states. */
const TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  PAID: 'success',
  MET: 'success',
  ON_TRACK: 'success',
  RESOLVED: 'success',
  VALIDATED: 'info',
  SUBMITTED: 'info',
  PROVISIONING: 'info',
  IN_PROGRESS: 'info',
  OPEN: 'info',
  ISSUED: 'info',
  INVITED: 'info',
  PENDING: 'warning',
  PENDING_CUSTOMER: 'warning',
  AT_RISK: 'warning',
  PAUSED: 'warning',
  SUSPENDED: 'warning',
  DISPUTED: 'warning',
  DRAFT: 'neutral',
  CLOSED: 'neutral',
  CEASED: 'neutral',
  VOID: 'neutral',
  DECOMMISSIONED: 'neutral',
  DEACTIVATED: 'neutral',
  CANCELLED: 'neutral',
  FAILED: 'danger',
  OVERDUE: 'danger',
  BREACHED: 'danger',
  P1: 'danger',
  P2: 'warning',
  P3: 'info',
  P4: 'neutral'
};

export function toneFor(status: string): BadgeTone {
  return TONES[status] ?? 'neutral';
}

export function humanise(status: string): string {
  const words = status.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

@Component({
  selector: 'gkb-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'badge badge--' + tone()" [attr.title]="status()">{{ label() }}</span>`
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly tone = computed(() => toneFor(this.status()));
  readonly label = computed(() => (/^P[1-4]$/.test(this.status()) ? this.status() : humanise(this.status())));
}
```

## apps/gokinetic-business/web/src/app/shared/validators.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/app/shared/validators.ts`.

```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const UK_POSTCODE = /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]|[A-HK-Y][0-9][0-9]|[0-9][A-HJKS-UW]|[A-HK-Y][0-9][ABEHMNPRV-Y]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;

const isEmpty = (v: unknown): boolean => v === null || v === undefined || v === '';

export function ukPostcode(): ValidatorFn {
  return (c) => (isEmpty(c.value) || UK_POSTCODE.test(String(c.value).trim()) ? null : { postcode: true });
}

export function sortCode(): ValidatorFn {
  return (c) => (isEmpty(c.value) || /^\d{6}$/.test(String(c.value).replace(/[\s-]/g, '')) ? null : { sortCode: true });
}

export function bankAccountNumber(): ValidatorFn {
  return (c) => (isEmpty(c.value) || /^\d{8}$/.test(String(c.value).replace(/\s/g, '')) ? null : { accountNumber: true });
}

export function phoneNumber(): ValidatorFn {
  return (c) => (isEmpty(c.value) || /^\+?[0-9 ()-]{7,20}$/.test(String(c.value).trim()) ? null : { phone: true });
}

/**
 * Parses a user-entered amount ("1,234.5", "£12") into integer minor units without floating
 * point. Returns null for anything that is not a non-negative amount with at most `digits` decimals.
 */
export function parseMoneyToMinor(input: string, digits = 2): number | null {
  const cleaned = input.trim().replace(/^£/, '').replace(/,/g, '');
  const match = new RegExp(`^(\\d+)(?:\\.(\\d{0,${digits}}))?$`).exec(cleaned);
  if (!match) return null;
  const minor = Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0') || 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

export function moneyAmount(max?: number): ValidatorFn {
  return (c) => {
    if (isEmpty(c.value)) return null;
    const minor = parseMoneyToMinor(String(c.value));
    if (minor === null) return { money: true };
    return max !== undefined && minor > max ? { moneyMax: { max } } : null;
  };
}

function utcDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A YYYY-MM-DD date at least `minLeadDays` and at most `maxLeadDays` ahead of today, optionally on
 * a weekday. Mirrors the API's order-planner rules so users see problems before submitting.
 */
export function leadTimeDate(opts: { minLeadDays: number; maxLeadDays: number; weekdaysOnly?: boolean; today?: () => Date }): ValidatorFn {
  return (c) => {
    if (isEmpty(c.value)) return null;
    const date = utcDate(String(c.value));
    if (!date) return { date: true };
    const now = (opts.today ?? (() => new Date()))();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const lead = Math.round((date.getTime() - today) / 86_400_000);
    if (lead < opts.minLeadDays) return { leadTooShort: { min: opts.minLeadDays } };
    if (lead > opts.maxLeadDays) return { leadTooLong: { max: opts.maxLeadDays } };
    const day = date.getUTCDay();
    if (opts.weekdaysOnly && (day === 0 || day === 6)) return { weekend: true };
    return null;
  };
}

/** Group validator for card expiry fields: the card is valid through the end of its expiry month. */
export function cardNotExpired(monthKey = 'expiryMonth', yearKey = 'expiryYear', today: () => Date = () => new Date()): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const month = Number(group.get(monthKey)?.value);
    const year = Number(group.get(yearKey)?.value);
    if (!month || !year) return null;
    return Date.UTC(year, month, 1) <= today().getTime() ? { cardExpired: true } : null;
  };
}

const MESSAGES: Record<string, (arg: Record<string, unknown>) => string> = {
  required: () => 'This field is required',
  email: () => 'Enter a valid email address',
  minlength: (e) => `Must be at least ${e['requiredLength']} characters`,
  maxlength: (e) => `Must be at most ${e['requiredLength']} characters`,
  postcode: () => 'Enter a valid UK postcode',
  sortCode: () => 'Sort code must be 6 digits',
  accountNumber: () => 'Account number must be 8 digits',
  phone: () => 'Enter a valid phone number',
  money: () => 'Enter an amount such as 1250.00',
  moneyMax: () => 'Amount is too large',
  date: () => 'Enter a valid date',
  leadTooShort: (e) => `Choose a date at least ${e['min']} days from today`,
  leadTooLong: (e) => `Choose a date within ${e['max']} days`,
  weekend: () => 'Choose a weekday',
  cardExpired: () => 'This card has expired',
  server: (e) => String(e['message'] ?? 'Invalid value')
};

/** First human-readable error for a control, for templates. */
export function errorMessage(errors: ValidationErrors | null | undefined): string | null {
  if (!errors) return null;
  const [key, value] = Object.entries(errors)[0];
  const describe = MESSAGES[key];
  return describe ? describe(typeof value === 'object' && value ? (value as Record<string, unknown>) : {}) : 'Invalid value';
}
```

## apps/gokinetic-business/web/src/environments/environment.development.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/environments/environment.development.ts`.

```typescript
export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
  oidc: {
    authorizationEndpoint: 'http://localhost:8180/realms/business/protocol/openid-connect/auth',
    tokenEndpoint: 'http://localhost:8180/realms/business/protocol/openid-connect/token',
    endSessionEndpoint: 'http://localhost:8180/realms/business/protocol/openid-connect/logout',
    clientId: 'gokinetic-business-portal',
    scope: 'openid profile email',
    audience: 'gokinetic-business-api'
  }
};
```

## apps/gokinetic-business/web/src/environments/environment.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/environments/environment.ts`.

```typescript
/**
 * Production settings. These are public client identifiers only; no secrets belong in the SPA.
 * The deployment pipeline substitutes the identity-provider URLs per environment.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
  oidc: {
    authorizationEndpoint: 'https://id.example-uniti.net/realms/business/protocol/openid-connect/auth',
    tokenEndpoint: 'https://id.example-uniti.net/realms/business/protocol/openid-connect/token',
    endSessionEndpoint: 'https://id.example-uniti.net/realms/business/protocol/openid-connect/logout',
    clientId: 'gokinetic-business-portal',
    scope: 'openid profile email',
    audience: 'gokinetic-business-api'
  }
};
```

## apps/gokinetic-business/web/src/index.html

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: html. Path: `apps/gokinetic-business/web/src/index.html`.

```html
<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <title>Go Kinetic Business</title>
    <base href="/" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
  </head>
  <body>
    <gkb-root></gkb-root>
    <noscript>Go Kinetic Business requires JavaScript to be enabled.</noscript>
  </body>
</html>
```

## apps/gokinetic-business/web/src/main.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/web/src/main.ts`.

```typescript
import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { appConfig } from './app/app.config';

@Component({
  selector: 'gkb-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />'
})
class AppComponent {}

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
```

## apps/gokinetic-business/web/src/styles.scss

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: scss. Path: `apps/gokinetic-business/web/src/styles.scss`.

```scss
:root {
  --gkb-brand: #5b2a86;
  --gkb-ink: #1d1d27;
  --gkb-muted: #5f6270;
  --gkb-line: #dcdde3;
  --gkb-bg: #f6f6f9;
  --gkb-surface: #ffffff;
  --gkb-success: #1e7a46;
  --gkb-warning: #9a6200;
  --gkb-danger: #b3261e;
  --gkb-info: #1f5fa8;
  --gkb-radius: 6px;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  color: var(--gkb-ink);
  background: var(--gkb-bg);
}

body { margin: 0; }
h1 { font-size: 1.6rem; margin: 0.5rem 0 1rem; }
h2 { font-size: 1.15rem; margin: 1.5rem 0 0.5rem; }
a { color: var(--gkb-brand); }
code { font-size: 0.85em; }

.skip-link { position: absolute; left: -999px; }
.skip-link:focus { left: 1rem; top: 1rem; background: var(--gkb-surface); padding: 0.5rem; z-index: 10; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.topbar { display: flex; gap: 1rem; align-items: center; padding: 0.75rem 1.5rem; background: var(--gkb-brand); color: #fff; }
.topbar .brand { margin-right: auto; }
.topbar .link { color: #fff; }
.layout { display: grid; grid-template-columns: 220px 1fr; min-height: calc(100vh - 50px); }
.sidenav { display: flex; flex-direction: column; padding: 1rem 0; background: var(--gkb-surface); border-right: 1px solid var(--gkb-line); }
.sidenav a { padding: 0.6rem 1.5rem; text-decoration: none; color: var(--gkb-ink); }
.sidenav a.active { background: var(--gkb-bg); border-left: 3px solid var(--gkb-brand); font-weight: 600; }
main { padding: 1.5rem 2rem; max-width: 1200px; }
@media (max-width: 800px) {
  .layout { grid-template-columns: 1fr; }
  .sidenav { flex-direction: row; overflow-x: auto; padding: 0; }
}

.page-header { display: flex; gap: 1rem; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.filters { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; align-items: end; }
.actions { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin: 1rem 0; }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }

label { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; font-weight: 500; }
label.checkbox, label.radio { flex-direction: row; align-items: center; font-weight: 400; }
input, select, textarea { font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--gkb-line); border-radius: var(--gkb-radius); background: var(--gkb-surface); }
input.ng-invalid.ng-touched, select.ng-invalid.ng-touched, textarea.ng-invalid.ng-touched { border-color: var(--gkb-danger); }
fieldset { border: 1px solid var(--gkb-line); border-radius: var(--gkb-radius); margin-bottom: 1rem; }
.field-error { color: var(--gkb-danger); margin: -0.5rem 0 0.75rem; font-size: 0.875rem; }
.hint { color: var(--gkb-muted); font-size: 0.875rem; }

button, .button { font: inherit; padding: 0.5rem 1rem; border-radius: var(--gkb-radius); border: 1px solid var(--gkb-line); background: var(--gkb-surface); cursor: pointer; text-decoration: none; color: var(--gkb-ink); }
button.primary, .button.primary { background: var(--gkb-brand); border-color: var(--gkb-brand); color: #fff; }
button.danger { background: var(--gkb-danger); border-color: var(--gkb-danger); color: #fff; }
button.link { border: none; background: none; color: var(--gkb-brand); padding: 0.25rem; text-transform: capitalize; }
button.link.danger { color: var(--gkb-danger); background: none; }
button:disabled { opacity: 0.55; cursor: not-allowed; }

.table-wrap { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; background: var(--gkb-surface); }
.table th, .table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--gkb-line); text-align: left; }
.table .num { text-align: right; font-variant-numeric: tabular-nums; }
.table tr.clickable { cursor: pointer; }
.table tr.clickable:hover, .table tr.clickable:focus { background: var(--gkb-bg); outline: none; }
.table .empty { text-align: center; color: var(--gkb-muted); padding: 2rem; }
.row--alert { background: #fdf0ef; }
.pager { display: flex; gap: 1rem; align-items: center; justify-content: flex-end; padding: 0.75rem 0; }
.pager label { flex-direction: row; align-items: center; margin: 0; }

.badge { display: inline-block; padding: 0.1rem 0.5rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
.badge--success { background: #e3f4ea; color: var(--gkb-success); }
.badge--warning { background: #fdf1dc; color: var(--gkb-warning); }
.badge--danger { background: #fbe4e2; color: var(--gkb-danger); }
.badge--info { background: #e2edf9; color: var(--gkb-info); }
.badge--neutral { background: #ececf0; color: var(--gkb-muted); }

.alert { padding: 0.75rem 1rem; border-radius: var(--gkb-radius); margin-bottom: 1rem; }
.alert--danger { background: #fbe4e2; color: var(--gkb-danger); }
.alert--warning { background: #fdf1dc; color: var(--gkb-warning); }
.alert--info { background: #e2edf9; color: var(--gkb-info); }
.text-danger { color: var(--gkb-danger); }

.card { background: var(--gkb-surface); border: 1px solid var(--gkb-line); border-radius: var(--gkb-radius); padding: 1rem 1.25rem; margin-bottom: 1rem; }
.cards { list-style: none; padding: 0; }
.cards .card { display: flex; gap: 0.75rem; align-items: center; }
.cards .actions { margin: 0 0 0 auto; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.tile { background: var(--gkb-surface); border: 1px solid var(--gkb-line); border-radius: var(--gkb-radius); padding: 1rem; display: flex; flex-direction: column; }
.tile--alert { border-color: var(--gkb-danger); }
.tile__label { color: var(--gkb-muted); font-size: 0.875rem; }
.tile__value { font-size: 1.5rem; font-weight: 600; }
.summary { display: grid; grid-template-columns: max-content 1fr; gap: 0.4rem 1.5rem; }
.summary dt { color: var(--gkb-muted); }
.summary dd { margin: 0; }
.timeline { list-style: none; padding: 0; border-left: 2px solid var(--gkb-line); }
.timeline li { padding: 0.5rem 0 0.5rem 1rem; }
.timeline time { color: var(--gkb-muted); font-size: 0.85rem; }
.list-row { display: flex; gap: 0.5rem; align-items: center; padding: 0.5rem 0; border-bottom: 1px solid var(--gkb-line); text-decoration: none; color: inherit; }
.stepper { display: flex; gap: 1rem; list-style: none; padding: 0; counter-reset: step; }
.stepper li { counter-increment: step; color: var(--gkb-muted); }
.stepper li::before { content: counter(step) '. '; }
.stepper li.current { color: var(--gkb-brand); font-weight: 600; }
.stepper li.done { color: var(--gkb-success); }
.radio-card { flex-direction: row; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--gkb-line); border-radius: var(--gkb-radius); }
.radio-card span { color: var(--gkb-muted); font-weight: 400; }
.segmented { display: inline-flex; margin-bottom: 1rem; }
.segmented button.active { background: var(--gkb-brand); color: #fff; }
.auth-card { max-width: 420px; margin: 10vh auto; background: var(--gkb-surface); padding: 2rem; border-radius: var(--gkb-radius); border: 1px solid var(--gkb-line); }
```

## apps/gokinetic-business/web/tsconfig.app.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/web/tsconfig.app.json`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/app",
    "types": []
  },
  "files": ["src/main.ts"],
  "include": ["src/**/*.d.ts"]
}
```

## apps/gokinetic-business/web/tsconfig.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/web/tsconfig.json`.

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "outDir": "./dist/out-tsc",
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "declaration": false,
    "experimentalDecorators": true,
    "moduleResolution": "node",
    "importHelpers": true,
    "target": "ES2022",
    "module": "ES2022",
    "useDefineForClassFields": false,
    "lib": ["ES2022", "dom"]
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

## apps/gokinetic-business/web/tsconfig.spec.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/web/tsconfig.spec.json`.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./out-tsc/spec",
    "types": ["jasmine"]
  },
  "include": ["src/**/*.spec.ts", "src/**/*.d.ts"]
}
```
