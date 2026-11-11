import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { AddressMatch, Availability } from '../core/api.models';
import { AvailabilityApi } from '../core/wholesale-api';
import { ProblemComponent, StatusLabelPipe } from '../shared/shared';

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, ProblemComponent, StatusLabelPipe],
  template: `
    <h1>Check availability</h1>
    <div class="card row">
      <label>Postcode <input [(ngModel)]="postcode" name="postcode" placeholder="SW1A 1AA" (keyup.enter)="search()" /></label>
      <button (click)="search()" [disabled]="!postcode.trim()">Find addresses</button>
      <span class="muted">or</span>
      <label>UPRN <input [(ngModel)]="uprn" name="uprn" inputmode="numeric" (keyup.enter)="check(uprn)" /></label>
      <button class="secondary" (click)="check(uprn)" [disabled]="!uprn.trim()">Check UPRN</button>
    </div>
    <icw-problem [problem]="problem()" />

    @if (addresses().length) {
      <table>
        <thead><tr><th>Address</th><th>UPRN</th><th>Build status</th><th></th></tr></thead>
        <tbody>
          @for (a of addresses(); track a.uprn) {
            <tr><td>{{ a.address }}</td><td>{{ a.uprn }}</td><td>{{ a.buildStatus | statusLabel }}</td>
              <td><button class="secondary" (click)="check(a.uprn)">Check</button></td></tr>
          }
        </tbody>
      </table>
    }

    @if (result(); as r) {
      <div class="card">
        <h2>{{ r.address }}</h2>
        <p>UPRN {{ r.uprn }} · Exchange {{ r.exchangeCode }} · {{ r.buildStatus | statusLabel }} · up to {{ r.maxDownstreamMbps }} Mbps</p>
        @if (r.readyForServiceDate) { <p>Ready for service from {{ r.readyForServiceDate | date: 'd MMM y' }}</p> }
        <p>Recommended order: <strong>{{ r.recommendedOrderType | statusLabel }}</strong>,
          earliest completion <strong>{{ r.earliestCompletionDate | date: 'd MMM y' }}</strong></p>
        @if (r.hasOpenOrder) { <p class="badge AtRisk">An order is already in flight for this premise</p> }
        <table>
          <thead><tr><th>Product</th><th class="num">Down/Up Mbps</th><th>Care levels</th><th></th></tr></thead>
          <tbody>
            @for (p of r.products; track p.product.code) {
              <tr>
                <td>{{ p.product.name }} <span class="muted">{{ p.product.code }}</span></td>
                <td class="num">{{ p.product.downstreamMbps }}/{{ p.product.upstreamMbps }}</td>
                <td>{{ p.product.careLevels.join(', ') }}</td>
                <td>
                  @if (p.orderable) {
                    <a [routerLink]="['/orders/new']" [queryParams]="{ uprn: r.uprn, productCode: p.product.code, orderType: r.recommendedOrderType.toUpperCase() }">Order</a>
                  } @else { <span class="muted">{{ p.reason }}</span> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class AvailabilityPage {
  private readonly api = inject(AvailabilityApi);
  postcode = '';
  uprn = '';
  readonly addresses = signal<AddressMatch[]>([]);
  readonly result = signal<Availability | null>(null);
  readonly problem = signal<ApiProblem | null>(null);

  search(): void {
    this.reset();
    this.api.searchAddresses(this.postcode).subscribe({
      next: (list) => {
        this.addresses.set(list);
        if (list.length === 0) {
          this.problem.set(new ApiProblem(404, 'address.none', 'No network premises found at this postcode', null, {}, null));
        }
      },
      error: (p: ApiProblem) => this.problem.set(p),
    });
  }

  check(uprn: string): void {
    this.problem.set(null);
    this.api.check(uprn.trim()).subscribe({ next: (r) => this.result.set(r), error: (p: ApiProblem) => this.problem.set(p) });
  }

  private reset(): void {
    this.problem.set(null);
    this.result.set(null);
    this.addresses.set([]);
  }
}
