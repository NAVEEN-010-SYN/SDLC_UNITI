import { randomBytes } from 'crypto';
import { DealStage, Money, OrderLine, ServiceAddress, TicketPriority } from '@api/domain';

/**
 * Fluent builders for test data. Defaults are valid for the happy path; specs
 * override only what the scenario cares about. Every generated identifier is
 * prefixed with "QA-" so nightly cleanup jobs can find and purge it.
 */

export function runTag(): string {
  return `QA-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`.toUpperCase();
}

export function money(amountMinor: number, currency = 'USD'): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be integer minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function formatMoney(value: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency }).format(value.amountMinor / 100);
}

export class AddressBuilder {
  private address: ServiceAddress = {
    line1: '1200 Fibre Way',
    city: 'Little Rock',
    state: 'AR',
    postalCode: '72201',
    country: 'US',
  };

  static serviceable(): AddressBuilder {
    return new AddressBuilder();
  }

  static outOfFootprint(): AddressBuilder {
    return new AddressBuilder().withLine1('9 Nowhere Rd').withCity('Barrow').withState('AK').withPostalCode('99723');
  }

  withLine1(line1: string): this {
    this.address.line1 = line1;
    return this;
  }

  withUnit(unit: string): this {
    this.address.line2 = unit;
    return this;
  }

  withCity(city: string): this {
    this.address.city = city;
    return this;
  }

  withState(state: string): this {
    this.address.state = state;
    return this;
  }

  withPostalCode(postalCode: string): this {
    this.address.postalCode = postalCode;
    return this;
  }

  build(): ServiceAddress {
    return { ...this.address };
  }
}

export interface OrderDraft {
  accountId: string;
  lines: OrderLine[];
  serviceAddress: ServiceAddress;
  requestedInstallDate?: string;
  externalReference: string;
}

export class OrderBuilder {
  private draft: OrderDraft;

  constructor(accountId: string) {
    this.draft = {
      accountId,
      lines: [{ sku: 'FIB-500', quantity: 1 }],
      serviceAddress: AddressBuilder.serviceable().build(),
      externalReference: runTag(),
    };
  }

  static forAccount(accountId: string): OrderBuilder {
    return new OrderBuilder(accountId);
  }

  withPlan(sku: string): this {
    this.draft.lines = [{ sku, quantity: 1 }, ...this.draft.lines.filter((l) => !l.sku.startsWith('FIB-'))];
    return this;
  }

  withAddOn(sku: string, quantity = 1): this {
    this.draft.lines.push({ sku, quantity });
    return this;
  }

  at(address: ServiceAddress): this {
    this.draft.serviceAddress = address;
    return this;
  }

  installOn(date: Date): this {
    this.draft.requestedInstallDate = date.toISOString().slice(0, 10);
    return this;
  }

  build(): OrderDraft {
    return structuredClone(this.draft);
  }
}

export interface TicketDraft {
  subject: string;
  description: string;
  priority: TicketPriority;
  category: 'BILLING' | 'CONNECTIVITY' | 'INSTALLATION' | 'SDWAN' | 'GENERAL';
  serviceId?: string;
}

export class TicketBuilder {
  private draft: TicketDraft = {
    subject: '',
    description: 'Intermittent loss of sync on the ONT between 18:00 and 20:00 local time.',
    priority: 'P3',
    category: 'CONNECTIVITY',
  };

  constructor() {
    this.draft.subject = `${runTag()} Intermittent connectivity`;
  }

  static connectivity(): TicketBuilder {
    return new TicketBuilder();
  }

  static billingDispute(): TicketBuilder {
    return new TicketBuilder()
      .withCategory('BILLING')
      .withSubject('Duplicate charge on latest invoice')
      .withDescription('The installation fee appears twice on the most recent invoice.');
  }

  withSubject(subject: string): this {
    this.draft.subject = `${runTag()} ${subject}`;
    return this;
  }

  withDescription(description: string): this {
    this.draft.description = description;
    return this;
  }

  withPriority(priority: TicketPriority): this {
    this.draft.priority = priority;
    return this;
  }

  withCategory(category: TicketDraft['category']): this {
    this.draft.category = category;
    return this;
  }

  forService(serviceId: string): this {
    this.draft.serviceId = serviceId;
    return this;
  }

  build(): TicketDraft {
    return { ...this.draft };
  }
}

export interface DealDraft {
  customerName: string;
  customerDomain: string;
  contactEmail: string;
  products: string[];
  estimatedMonthlyValue: Money;
  siteCount: number;
  stage: DealStage;
  notes?: string;
}

export class DealBuilder {
  private draft: DealDraft;

  constructor() {
    const tag = runTag().toLowerCase();
    this.draft = {
      customerName: `QA Logistics ${tag}`,
      customerDomain: `${tag}.qa.example.net`,
      contactEmail: `it-lead@${tag}.qa.example.net`,
      products: ['FIB-BIZ-1G', 'SDWAN-VC-STD'],
      estimatedMonthlyValue: money(249_900),
      siteCount: 3,
      stage: 'REGISTERED',
    };
  }

  static enterprise(): DealBuilder {
    return new DealBuilder();
  }

  withCustomer(name: string, domain: string): this {
    this.draft.customerName = name;
    this.draft.customerDomain = domain;
    this.draft.contactEmail = `it-lead@${domain}`;
    return this;
  }

  withProducts(...skus: string[]): this {
    this.draft.products = skus;
    return this;
  }

  withMonthlyValue(amountMinor: number): this {
    this.draft.estimatedMonthlyValue = money(amountMinor);
    return this;
  }

  withSites(count: number): this {
    this.draft.siteCount = count;
    return this;
  }

  withNotes(notes: string): this {
    this.draft.notes = notes;
    return this;
  }

  build(): DealDraft {
    return structuredClone(this.draft);
  }
}

export interface ChangeRequestDraft {
  siteName: string;
  type: 'BANDWIDTH' | 'FIREWALL_RULE' | 'BUSINESS_POLICY' | 'EDGE_REPLACEMENT';
  newBandwidthMbps?: number;
  justification: string;
  scheduledFor: Date;
}

export function bandwidthChange(siteName: string, newBandwidthMbps: number): ChangeRequestDraft {
  const scheduledFor = new Date();
  scheduledFor.setUTCDate(scheduledFor.getUTCDate() + 3);
  scheduledFor.setUTCHours(2, 0, 0, 0);
  return {
    siteName,
    type: 'BANDWIDTH',
    newBandwidthMbps,
    justification: `${runTag()} Seasonal traffic growth at branch`,
    scheduledFor,
  };
}
