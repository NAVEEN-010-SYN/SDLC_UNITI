import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiProblem } from '../core/api-problem';
import { OrderType, PlaceOrderRequest } from '../core/api.models';
import { OrdersApi } from '../core/wholesale-api';
import { ProblemComponent, isoDate } from '../shared/shared';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ProblemComponent],
  template: `
    <h1>Place an order</h1>
    <form class="card" [formGroup]="form" (ngSubmit)="submit()">
      <div class="row">
        <label>Order type <select formControlName="orderType">
          @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
        </select></label>
        <label>Your reference <input formControlName="partnerReference" maxlength="40" />
          <small class="error">{{ problem()?.fieldError('partnerReference') }}</small></label>
        <label>UPRN <input formControlName="uprn" inputmode="numeric" /><small class="error">{{ problem()?.fieldError('uprn') }}</small></label>
        <label>Requested date <input type="date" formControlName="requestedDate" [min]="minDate" />
          <small class="error">{{ problem()?.fieldError('requestedDate') }}</small></label>
      </div>
      <div class="row">
        @if (type !== 'CEASE') {
          <label>Product <input formControlName="productCode" placeholder="FTTP500" /><small class="error">{{ problem()?.fieldError('productCode') }}</small></label>
          <label>Care level <select formControlName="careLevel">
            <option value="Standard">Standard</option><option value="Enhanced">Enhanced</option><option value="Premium">Premium</option>
          </select></label>
        }
        @if (type === 'CEASE' || type === 'MODIFY') {
          <label>Existing service id <input formControlName="existingServiceId" /><small class="error">{{ problem()?.fieldError('existingServiceId') }}</small></label>
        }
        @if (type === 'MIGRATE') {
          <label>Switching code <input formControlName="migrationAuthCode" placeholder="ABC123456" />
            <small class="error">{{ problem()?.fieldError('migrationAuthCode') }}</small></label>
        }
      </div>
      <p><button type="submit" [disabled]="form.invalid || busy()">Place order</button></p>
    </form>
    <icw-problem [problem]="problem()" />
  `,
  styles: ['.error { color: var(--icw-danger); font-weight: 400; min-height: 1em; }'],
})
export class OrderNewPage implements OnInit {
  private readonly api = inject(OrdersApi);
  private readonly router = inject(Router);
  readonly types: OrderType[] = ['PROVIDE', 'MIGRATE', 'MODIFY', 'CEASE'];
  readonly minDate = isoDate(1);
  readonly problem = signal<ApiProblem | null>(null);
  readonly busy = signal(false);

  @Input() uprn?: string;
  @Input() productCode?: string;
  @Input() orderType?: OrderType;

  readonly form = inject(FormBuilder).nonNullable.group({
    orderType: ['PROVIDE' as OrderType, Validators.required],
    partnerReference: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_/-]{1,40}$/)]],
    uprn: ['', [Validators.required, Validators.pattern(/^\d{1,12}$/)]],
    requestedDate: [isoDate(14), Validators.required],
    productCode: [''],
    careLevel: ['Standard'],
    existingServiceId: [''],
    migrationAuthCode: [''],
  });

  get type(): OrderType {
    return this.form.controls.orderType.value;
  }

  ngOnInit(): void {
    this.form.patchValue({ uprn: this.uprn ?? '', productCode: this.productCode ?? '', orderType: this.orderType ?? 'PROVIDE' });
  }

  submit(): void {
    const v = this.form.getRawValue();
    const request: PlaceOrderRequest = {
      partnerReference: v.partnerReference.trim(),
      orderType: v.orderType,
      uprn: v.uprn.trim(),
      productCode: v.orderType === 'CEASE' ? null : v.productCode.trim() || null,
      careLevel: v.orderType === 'CEASE' ? null : v.careLevel,
      existingServiceId: v.orderType === 'CEASE' || v.orderType === 'MODIFY' ? v.existingServiceId.trim() || null : null,
      migrationAuthCode: v.orderType === 'MIGRATE' ? v.migrationAuthCode.trim() || null : null,
      requestedDate: v.requestedDate,
    };
    this.busy.set(true);
    this.problem.set(null);
    this.api.place(request).subscribe({
      next: ({ order }) => void this.router.navigate(['/orders', order.id]),
      error: (p: ApiProblem) => {
        this.problem.set(p);
        this.busy.set(false);
      },
    });
  }
}
