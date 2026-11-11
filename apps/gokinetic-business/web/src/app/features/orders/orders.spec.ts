import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InventoryApi, OrdersApi } from '../../core/api/portal-api';
import { ApiProblem } from '../../core/http/api-problem';
import { CatalogueProduct, Order, Service, SiteSummary } from '../../core/models/api.models';
import { OrderWizardComponent, fieldsFor, productsFor } from './order-wizard.component';
import { availableActions } from './orders.components';

const PRODUCTS: CatalogueProduct[] = [
  { code: 'FTTP-500', name: 'Business Fibre 500 Mbps', category: 'BROADBAND', bandwidthMbps: 500, monthlyPriceMinor: 5500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'FTTP-1000', name: 'Business Fibre 1 Gbps', category: 'BROADBAND', bandwidthMbps: 1000, monthlyPriceMinor: 7500, installChargeMinor: 9900, requiresConnectivity: false },
  { code: 'VOICE-SIP-4', name: 'SIP Voice (4 channels)', category: 'VOICE', bandwidthMbps: null, monthlyPriceMinor: 2400, installChargeMinor: 0, requiresConnectivity: true }
];

const SERVICE = { id: 'svc-1', siteId: 'site-1', productCode: 'FTTP-500', productName: 'Business Fibre 500 Mbps', category: 'BROADBAND', status: 'ACTIVE' } as Service;
const SITE = { id: 'site-1', code: 'LDN-01', name: 'London HQ', status: 'ACTIVE' } as SiteSummary;

function order(overrides: Partial<Order> = {}): Order {
  return { id: 'o1', status: 'DRAFT', createdBy: 'me', requiresApproval: false, ...overrides } as Order;
}

describe('order rules', () => {
  it('requires the right fields per order type', () => {
    expect(fieldsFor('PROVIDE')).toEqual({ service: false, product: true, targetSite: false, minLeadDays: 10 });
    expect(fieldsFor('MOVE').targetSite).toBeTrue();
    expect(fieldsFor('CEASE')).toEqual(jasmine.objectContaining({ service: true, product: false }));
  });

  it('offers connectivity for PROVIDE, add-ons for ADD and alternatives for CHANGE', () => {
    expect(productsFor('PROVIDE', PRODUCTS).map((p) => p.code)).toEqual(['FTTP-500', 'FTTP-1000']);
    expect(productsFor('ADD', PRODUCTS).map((p) => p.code)).toEqual(['VOICE-SIP-4']);
    expect(productsFor('CHANGE', PRODUCTS, SERVICE).map((p) => p.code)).toEqual(['FTTP-1000']);
    expect(productsFor('CHANGE', PRODUCTS)).toEqual([]);
  });

  it('enforces separation of duties for approvals', () => {
    const submitted = order({ status: 'SUBMITTED', requiresApproval: true, createdBy: 'someone' });
    expect(availableActions(submitted, 'admin', true, true)).toEqual(['approve', 'reject', 'cancel']);
    expect(availableActions({ ...submitted, createdBy: 'admin' }, 'admin', true, true)).toEqual(['cancel']);
  });

  it('limits submit and cancel to the creator or an admin', () => {
    expect(availableActions(order(), 'me', false, false)).toEqual(['submit', 'cancel']);
    expect(availableActions(order(), 'other', false, false)).toEqual([]);
    expect(availableActions(order({ status: 'PROVISIONING' }), 'me', true, true)).toEqual([]);
  });
});

describe('OrderWizardComponent', () => {
  let fixture: ComponentFixture<OrderWizardComponent>;
  let wizard: OrderWizardComponent;
  let ordersApi: jasmine.SpyObj<OrdersApi>;

  beforeEach(() => {
    ordersApi = jasmine.createSpyObj<OrdersApi>('OrdersApi', ['products', 'quote', 'create']);
    ordersApi.products.and.returnValue(of(PRODUCTS));
    ordersApi.quote.and.returnValue(of({ productCode: 'FTTP-1000', bandwidthMbps: 1000, monthlyDeltaMinor: 2000, oneOffChargeMinor: 0, requiresApproval: true }));
    const inventoryApi = jasmine.createSpyObj<InventoryApi>('InventoryApi', ['sites', 'servicesForSite']);
    inventoryApi.sites.and.returnValue(of({ items: [SITE], page: 1, pageSize: 100, total: 1 }));
    inventoryApi.servicesForSite.and.returnValue(of([SERVICE]));

    TestBed.configureTestingModule({
      imports: [OrderWizardComponent],
      providers: [provideRouter([]), { provide: OrdersApi, useValue: ordersApi }, { provide: InventoryApi, useValue: inventoryApi }]
    });
    fixture = TestBed.createComponent(OrderWizardComponent);
    wizard = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not advance until the site is chosen', () => {
    wizard.next();
    expect(wizard.step()).toBe(0);
    expect(wizard.err('siteId')).toBe('This field is required');
  });

  it('switches required fields when the order type changes', () => {
    const { serviceId, productCode, targetSiteId } = wizard.form.controls;
    wizard.form.controls.orderType.setValue('MOVE');
    serviceId.setValue('');
    targetSiteId.setValue('');
    expect(serviceId.invalid).toBeTrue();
    expect(targetSiteId.invalid).toBeTrue();
    expect(productCode.valid).toBeTrue();
  });

  it('quotes on reaching review and submits a request without unused fields', () => {
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    ordersApi.create.and.returnValue(of({ id: 'new-order' } as Order));
    wizard.form.patchValue({ orderType: 'CHANGE', siteId: 'site-1' });
    wizard.next();
    wizard.form.patchValue({ serviceId: 'svc-1', productCode: 'FTTP-1000', targetSiteId: 'ignored' });
    wizard.next();
    wizard.next();
    expect(wizard.step()).toBe(3);
    expect(wizard.quote()?.requiresApproval).toBeTrue();

    wizard.place(true);
    const [request, submit] = ordersApi.create.calls.mostRecent().args;
    expect(submit).toBeTrue();
    expect(request).toEqual(jasmine.objectContaining({ orderType: 'CHANGE', serviceId: 'svc-1', productCode: 'FTTP-1000', targetSiteId: null }));
    expect(navigate).toHaveBeenCalledWith(['/orders', 'new-order']);
  });

  it('returns to the step owning a server-side field error', () => {
    ordersApi.quote.and.returnValue(
      throwError(() => new ApiProblem(400, 'Invalid request', '', 'validation-error', [{ field: 'body.productCode', message: 'Unknown product' }]))
    );
    wizard.form.patchValue({ orderType: 'PROVIDE', siteId: 'site-1' });
    wizard.next();
    wizard.form.patchValue({ productCode: 'FTTP-500' });
    wizard.next();
    wizard.next();
    expect(wizard.step()).toBe(1);
    expect(wizard.form.controls.productCode.errors).toEqual({ server: { message: 'Unknown product' } });
  });
});
