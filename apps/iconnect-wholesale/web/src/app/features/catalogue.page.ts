import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiProblem } from '../core/api-problem';
import { PriceBook } from '../core/api.models';
import { CatalogueApi } from '../core/wholesale-api';
import { MoneyPipe, ProblemComponent } from '../shared/shared';

@Component({
  standalone: true,
  imports: [DatePipe, MoneyPipe, ProblemComponent],
  template: `
    <h1>Catalogue and prices</h1>
    <icw-problem [problem]="problem()" />
    @if (book(); as b) {
      <p class="muted">Price book {{ b.version }}, effective {{ b.effectiveFrom | date: 'd MMM y' }}
        @if (b.effectiveTo) { to {{ b.effectiveTo | date: 'd MMM y' }} }. Prices exclude VAT.</p>
      <table>
        <thead><tr><th>Product</th><th>Care</th><th class="num">Monthly</th><th class="num">Connection</th><th class="num">Migration</th><th class="num">Modify</th></tr></thead>
        <tbody>
          @for (e of b.entries; track e.productCode + e.careLevel) {
            <tr><td>{{ productName(e.productCode) }}</td><td>{{ e.careLevel }}</td>
              <td class="num">{{ e.monthlyRentalMinor | money: b.currency }}</td>
              <td class="num">{{ e.connectionChargeMinor | money: b.currency }}</td>
              <td class="num">{{ e.migrationChargeMinor | money: b.currency }}</td>
              <td class="num">{{ e.modifyChargeMinor | money: b.currency }}</td></tr>
          }
        </tbody>
      </table>
      @if (b.tiers.length) {
        <h2>Volume discounts on monthly rental</h2>
        <ul>@for (t of b.tiers; track t.minimumActiveLines) { <li>{{ t.minimumActiveLines }}+ active lines: {{ t.discountBps / 100 }}%</li> }</ul>
      }
    }
  `,
})
export class CataloguePage {
  private readonly api = inject(CatalogueApi);
  readonly problem = signal<ApiProblem | null>(null);
  private readonly products = toSignal(
    this.api.products().pipe(
      catchError((p: ApiProblem) => {
        this.problem.set(p);
        return of([]);
      }),
    ),
    { initialValue: [] },
  );

  readonly book = toSignal<PriceBook | null>(
    this.api.priceBook().pipe(
      catchError((p: ApiProblem) => {
        this.problem.set(p);
        return of(null);
      }),
    ),
    { initialValue: null },
  );

  private readonly names = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.products()) {
      map.set(p.code, p.name);
    }
    return map;
  });

  productName(code: string): string {
    return this.names().get(code) ?? code;
  }
}
