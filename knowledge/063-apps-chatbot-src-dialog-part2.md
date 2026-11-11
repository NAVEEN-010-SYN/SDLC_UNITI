# Customer support chatbot: apps/chatbot/src/dialog (part 2 of 4)

- **Application:** Customer support chatbot
- **Tech stack:** Node.js (Express, TypeScript)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 14

## Files

- `apps/chatbot/src/dialog/flows/billEnquiry.ts` (190 lines)
- `apps/chatbot/src/dialog/flows/checkOutage.test.ts` (105 lines)
- `apps/chatbot/src/dialog/flows/checkOutage.ts` (160 lines)
- `apps/chatbot/src/dialog/flows/common.ts` (124 lines)
- `apps/chatbot/src/dialog/flows/index.ts` (50 lines)
- `apps/chatbot/src/dialog/flows/planUpgrade.test.ts` (109 lines)
- `apps/chatbot/src/dialog/flows/planUpgrade.ts` (201 lines)
- `apps/chatbot/src/dialog/flows/raiseTicket.test.ts` (125 lines)
- `apps/chatbot/src/dialog/flows/raiseTicket.ts` (151 lines)
- `apps/chatbot/src/dialog/flows/resetRouter.test.ts` (98 lines)
- `apps/chatbot/src/dialog/flows/resetRouter.ts` (162 lines)
- `apps/chatbot/src/dialog/slots.test.ts` (82 lines)
- `apps/chatbot/src/dialog/slots.ts` (121 lines)
- `apps/chatbot/src/dialog/stateMachine.test.ts` (130 lines)

## apps/chatbot/src/dialog/flows/billEnquiry.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/billEnquiry.ts`.

```typescript
import { Invoice, InvoiceLine } from '../../clients/platformClients';
import { formatMoney, subtractMoney } from '../../domain/money';
import { BotReply } from '../../domain/types';
import { invoiceIdSlot } from '../slots';
import { END, FlowContext, FlowDefinition } from '../stateMachine';
import { downstreamFailure, formatDate, ticketQuickReply } from './common';

/**
 * Bill enquiry: fetches the latest (or a named) invoice, summarises it, explains
 * the change versus the previous invoice, and optionally lists line items or
 * raises a billing query ticket.
 */

const INVOICE_KEY = 'invoice';
const PREVIOUS_KEY = 'previousInvoice';

export interface BillChange {
  delta: number;
  oneOffLines: InvoiceLine[];
  newRecurring: InvoiceLine[];
}

/** Explains why a bill differs from the previous one, using integer minor units only. */
export function explainChange(current: Invoice, previous: Invoice | undefined): BillChange | undefined {
  if (!previous || previous.total.currency !== current.total.currency) return undefined;
  const delta = subtractMoney(current.total, previous.total).amountMinor;
  const previousRecurring = new Set(previous.lines.filter((l) => l.category === 'RECURRING').map((l) => l.description));
  return {
    delta,
    oneOffLines: current.lines.filter((l) => l.category === 'ONE_OFF' || l.category === 'USAGE'),
    newRecurring: current.lines.filter((l) => l.category === 'RECURRING' && !previousRecurring.has(l.description)),
  };
}

export function summariseInvoice(invoice: Invoice, previous?: Invoice): BotReply {
  const parts = [
    `Your invoice ${invoice.invoiceId} for ${formatDate(invoice.periodStart)} to ${formatDate(invoice.periodEnd)} is ${formatMoney(invoice.total)}.`,
  ];
  if (invoice.status === 'PAID') {
    parts.push("It's been paid in full - thank you.");
  } else if (invoice.status === 'OVERDUE') {
    parts.push(`It's overdue: ${formatMoney(invoice.balanceDue)} was due on ${formatDate(invoice.dueDate)}.`);
  } else {
    parts.push(`${formatMoney(invoice.balanceDue)} is due by ${formatDate(invoice.dueDate)}.`);
  }

  const change = explainChange(invoice, previous);
  if (change && change.delta !== 0) {
    const direction = change.delta > 0 ? 'higher' : 'lower';
    const amount = formatMoney({ amountMinor: Math.abs(change.delta), currency: invoice.total.currency });
    let reason = '';
    if (change.oneOffLines.length > 0) {
      reason = ` This includes one-off charges: ${change.oneOffLines.map((l) => `${l.description} (${formatMoney(l.amount)})`).join(', ')}.`;
    } else if (change.newRecurring.length > 0) {
      reason = ` New this month: ${change.newRecurring.map((l) => l.description).join(', ')}.`;
    }
    parts.push(`That's ${amount} ${direction} than your previous bill.${reason}`);
  }

  return {
    text: parts.join(' '),
    card: {
      kind: 'INVOICE',
      invoiceId: invoice.invoiceId,
      total: invoice.total,
      dueDate: invoice.dueDate,
      status: invoice.status,
    },
  };
}

export function formatLines(invoice: Invoice): string {
  const order: InvoiceLine['category'][] = ['RECURRING', 'USAGE', 'ONE_OFF', 'DISCOUNT', 'CREDIT'];
  const sorted = [...invoice.lines].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  return sorted.map((l) => `- ${l.description}: ${formatMoney(l.amount)}`).join('\n');
}

async function fetchInvoices(ctx: FlowContext): Promise<{ invoice?: Invoice; previous?: Invoice }> {
  const requested = String(ctx.slots.invoiceId);
  const accountId = ctx.principal.accountId;
  if (requested === 'LATEST') {
    const page = await ctx.clients.billing.listInvoices(accountId, ctx.request, 1, 2);
    return { invoice: page.items[0], previous: page.items[1] };
  }
  const invoice = await ctx.clients.billing.getInvoice(accountId, requested, ctx.request);
  return { invoice };
}

export const billEnquiryFlow: FlowDefinition = {
  id: 'bill_enquiry',
  intent: 'BILL_ENQUIRY',
  label: 'your bill',
  initial: 'invoiceId',
  allowedRoles: ['CONSUMER', 'BUSINESS_ADMIN', 'PARTNER_ADMIN', 'WHOLESALE_BUYER', 'SUPPORT_AGENT'],
  states: {
    invoiceId: {
      kind: 'slot',
      slot: 'invoiceId',
      validator: invoiceIdSlot,
      autofill: async () => 'LATEST',
      prompt: { text: 'Which invoice? Say "latest" or give the invoice number.', quickReplies: [{ label: 'Latest', payload: 'latest' }] },
      next: 'fetch',
    },
    fetch: {
      kind: 'action',
      async run(ctx) {
        let result: { invoice?: Invoice; previous?: Invoice };
        try {
          result = await fetchInvoices(ctx);
        } catch (error) {
          return downstreamFailure(ctx, error, 'fetch your bill');
        }
        if (!result.invoice) {
          return { replies: [{ text: "You don't have any invoices yet. Your first bill is issued a month after activation." }], next: END, outcome: 'no_invoices' };
        }
        ctx.scratch[INVOICE_KEY] = result.invoice;
        ctx.scratch[PREVIOUS_KEY] = result.previous;
        ctx.slots.resolvedInvoiceId = result.invoice.invoiceId;
        return { replies: [summariseInvoice(result.invoice, result.previous)], next: 'breakdownOffer', outcome: 'bill_explained' };
      },
    },
    breakdownOffer: {
      kind: 'confirm',
      prompt: { text: 'Would you like to see the full breakdown?', quickReplies: [{ label: 'Yes', payload: 'yes' }, { label: 'No', payload: 'no' }] },
      onYes: 'breakdown',
      onNo: 'disputeOffer',
    },
    breakdown: {
      kind: 'action',
      async run(ctx) {
        let invoice = ctx.scratch[INVOICE_KEY] as Invoice | undefined;
        if (!invoice) {
          try {
            invoice = await ctx.clients.billing.getInvoice(ctx.principal.accountId, String(ctx.slots.resolvedInvoiceId), ctx.request);
          } catch (error) {
            return downstreamFailure(ctx, error, 'load the breakdown');
          }
        }
        return { replies: [{ text: `Here's what's on invoice ${invoice.invoiceId}:\n${formatLines(invoice)}` }], next: 'disputeOffer' };
      },
    },
    disputeOffer: {
      kind: 'confirm',
      prompt: { text: 'Does anything on this bill look wrong?', quickReplies: [{ label: 'Yes, query it', payload: 'yes' }, { label: 'No, all good', payload: 'no' }] },
      onYes: 'raiseQuery',
      onNo: 'done',
    },
    raiseQuery: {
      kind: 'action',
      async run(ctx) {
        try {
          const ticket = await ctx.clients.tickets.createTicket(
            {
              accountId: ctx.principal.accountId,
              category: 'BILLING',
              priority: 'P3',
              subject: `Billing query on ${ctx.slots.resolvedInvoiceId}`,
              description: 'Customer queried charges on this invoice via the chatbot.',
              source: 'CHATBOT',
              conversationId: ctx.conversation.id,
            },
            ctx.request,
            ctx.idempotencyKey(`billing-query-${ctx.slots.resolvedInvoiceId}`),
          );
          return {
            replies: [
              {
                text: `I've raised billing query ${ticket.ticketId}. Our billing team will reply within 2 working days, and any agreed credit will appear on your next bill.`,
                card: { kind: 'TICKET', ticketId: ticket.ticketId, priority: ticket.priority, status: ticket.status },
              },
            ],
            next: END,
            outcome: 'ticket_created',
          };
        } catch (error) {
          return downstreamFailure(ctx, error, 'raise the billing query');
        }
      },
    },
    done: {
      kind: 'action',
      run: async () => ({
        replies: [{ text: 'Great. Anything else I can help with?', quickReplies: [ticketQuickReply()] }],
        next: END,
        outcome: 'resolved',
      }),
    },
  },
};
```

## apps/chatbot/src/dialog/flows/checkOutage.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/checkOutage.test.ts`.

```typescript
import { DownstreamError } from '../../domain/errors';
import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { account } from '../../testing/fakes';
import { describeOutage } from './checkOutage';

describe('check outage flow', () => {
  it('uses the postcode from the utterance and offers troubleshooting when there is no incident', async () => {
    const chat = new ChatHarness();
    const first = await chat.say('is there an outage at M1 1AE');
    expect(chat.clients.network.outageQueries).toEqual(['M1 1AE']);
    expect(first.text).toContain('no known issues at M1 1AE');
    expect(chat.awaiting).toBe('faultOffer');

    const second = await chat.say('yes');
    expect(second.replies[0].quickReplies?.map((q) => q.payload)).toEqual(
      expect.arrayContaining(['intent:RESET_ROUTER', 'intent:RAISE_TICKET', 'intent:TALK_TO_AGENT']),
    );
    expect(outcomeOf(second, 'check_outage')).toBe('troubleshoot_offered');
    expect(chat.activeFlowId).toBeUndefined();
  });

  it("autofills the postcode from the customer's only active service", async () => {
    const chat = new ChatHarness();
    await chat.say('my internet is down');
    expect(chat.clients.network.outageQueries).toEqual(['SW1A 1AA']);
  });

  it('asks for a postcode when services span several addresses, and re-asks on invalid input', async () => {
    const chat = new ChatHarness();
    const base = account().services[0];
    chat.clients.account.summary = account({
      services: [base, { ...base, serviceId: 'SVC-2', serviceAddress: { line1: '2 Mill Lane', town: 'Leeds', postcode: 'LS1 4AP' } }],
    });

    const prompt = await chat.say('no internet');
    expect(prompt.text).toContain('Which postcode should I check?');

    const invalid = await chat.say('somewhere near leeds');
    expect(invalid.text).toContain("doesn't look like a valid UK postcode");
    expect(chat.awaiting).toBe('postcode');

    await chat.say('ls14ap');
    expect(chat.clients.network.outageQueries).toEqual(['LS1 4AP']);
  });

  it('subscribes the customer to a restoration SMS during a live outage', async () => {
    const chat = new ChatHarness();
    chat.clients.network.outage = {
      postcode: 'SW1A 1AA',
      region: 'Westminster',
      status: 'OUTAGE',
      summary: 'Fibre cable damaged by roadworks',
      estimatedRestore: '2026-11-09T16:00:00Z',
    };

    const report = await chat.say('my internet is down');
    expect(report.text).toContain('known outage affecting Westminster');
    expect(report.text).toContain('Fibre cable damaged by roadworks');
    expect(report.replies[0].card).toMatchObject({ kind: 'OUTAGE', status: 'OUTAGE', region: 'Westminster' });

    await chat.say('yes');
    expect(chat.awaiting).toBe('phone');

    const done = await chat.say('07700 900123');
    expect(done.text).toContain("we'll text you");
    const [ticket] = chat.clients.tickets.created;
    expect(ticket.request).toMatchObject({ category: 'FAULT', priority: 'P4', contactPhone: '07700900123', source: 'CHATBOT' });
    expect(ticket.key).toMatch(/^chatbot:.+:outage-sms$/);
    expect(outcomeOf(done, 'check_outage')).toBe('outage_subscribed');
  });

  it('ends gracefully and offers an agent when the network API fails', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.network, 'getOutageStatus').mockRejectedValue(new DownstreamError('network-api', 503, 'unavailable'));

    const turn = await chat.say('is there an outage at M1 1AE');
    expect(turn.text).toContain("couldn't check the network status");
    expect(turn.replies[0].quickReplies?.[0].payload).toBe('intent:TALK_TO_AGENT');
    expect(outcomeOf(turn, 'check_outage')).toBe('downstream_error');
  });

  it('propagates unexpected (non-downstream) errors instead of masking them', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.network, 'getOutageStatus').mockRejectedValue(new TypeError('bug'));
    await expect(chat.say('is there an outage at M1 1AE')).rejects.toThrow(TypeError);
  });
});

describe('describeOutage', () => {
  const base = { postcode: 'SW1A 1AA', region: 'Westminster' };

  it.each([
    ['PLANNED_WORK', 'planned maintenance in Westminster'],
    ['INVESTIGATING', 'investigating reports of problems in Westminster'],
    ['RESTORED', 'has been fixed'],
    ['NO_KNOWN_ISSUES', 'no known issues at SW1A 1AA'],
  ] as const)('describes %s', (status, expected) => {
    expect(describeOutage({ ...base, status })).toContain(expected);
  });

  it('omits the restore estimate when none is known', () => {
    expect(describeOutage({ ...base, status: 'OUTAGE' })).not.toContain('restored by');
  });
});
```

## apps/chatbot/src/dialog/flows/checkOutage.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/checkOutage.ts`.

```typescript
import { OutageStatus } from '../../clients/platformClients';
import { quickReplyPayload } from '../../nlu/intentClassifier';
import { phoneSlot, postcodeSlot } from '../slots';
import { END, FlowContext, FlowDefinition } from '../stateMachine';
import { activeServices, agentQuickReply, downstreamFailure, formatDateTime, isBusinessUser, loadAccount } from './common';

/**
 * Check outage: resolves the postcode (from the utterance, the customer's
 * single active service, or by asking), queries the network status API and
 * either reports the incident or offers to raise a fault ticket.
 */

async function autofillPostcode(ctx: FlowContext): Promise<string | undefined> {
  try {
    const services = activeServices(await loadAccount(ctx));
    const postcodes = new Set(services.map((s) => s.serviceAddress.postcode));
    return postcodes.size === 1 ? [...postcodes][0] : undefined;
  } catch {
    // If the account lookup fails we simply ask for the postcode.
    return undefined;
  }
}

export function describeOutage(status: OutageStatus): string {
  switch (status.status) {
    case 'OUTAGE': {
      const eta = status.estimatedRestore ? ` We expect service to be restored by ${formatDateTime(status.estimatedRestore)}.` : '';
      return `Yes - there's a known outage affecting ${status.region} (${status.postcode}).${status.summary ? ` ${status.summary}.` : ''}${eta} Our engineers are working on it.`;
    }
    case 'PLANNED_WORK': {
      const until = status.estimatedRestore ? ` until around ${formatDateTime(status.estimatedRestore)}` : '';
      return `There's planned maintenance in ${status.region}${until}. You may see short interruptions.`;
    }
    case 'INVESTIGATING':
      return `We're investigating reports of problems in ${status.region}. We'll update the status as soon as we know more.`;
    case 'RESTORED':
      return `A recent issue in ${status.region} has been fixed. If you're still offline, restarting your router usually helps.`;
    default:
      return `There are no known issues at ${status.postcode} right now.`;
  }
}

export const checkOutageFlow: FlowDefinition = {
  id: 'check_outage',
  intent: 'CHECK_OUTAGE',
  label: 'checking for outages',
  initial: 'postcode',
  states: {
    postcode: {
      kind: 'slot',
      slot: 'postcode',
      validator: postcodeSlot,
      autofill: autofillPostcode,
      prompt: { text: "Which postcode should I check? (e.g. SW1A 1AA)" },
      next: 'lookup',
    },
    lookup: {
      kind: 'action',
      async run(ctx) {
        let status: OutageStatus;
        try {
          status = await ctx.clients.network.getOutageStatus(String(ctx.slots.postcode), ctx.request);
        } catch (error) {
          return downstreamFailure(ctx, error, 'check the network status');
        }
        ctx.slots.outageStatus = status.status;
        const reply = {
          text: describeOutage(status),
          card: {
            kind: 'OUTAGE' as const,
            region: status.region,
            status: status.status,
            estimatedRestore: status.estimatedRestore,
          },
        };
        if (status.status === 'OUTAGE' || status.status === 'PLANNED_WORK' || status.status === 'INVESTIGATING') {
          return { replies: [reply], next: 'notifyOffer', outcome: 'outage_reported' };
        }
        return { replies: [reply], next: 'faultOffer' };
      },
    },
    notifyOffer: {
      kind: 'confirm',
      prompt: { text: 'Would you like a text message when service is restored?', quickReplies: [{ label: 'Yes', payload: 'yes' }, { label: 'No', payload: 'no' }] },
      onYes: 'phone',
      onNo: 'closing',
    },
    phone: {
      kind: 'slot',
      slot: 'contactPhone',
      validator: phoneSlot,
      prompt: { text: 'What mobile number should we text?' },
      next: 'subscribe',
    },
    subscribe: {
      kind: 'action',
      async run(ctx) {
        try {
          await ctx.clients.tickets.createTicket(
            {
              accountId: ctx.principal.accountId,
              category: 'FAULT',
              priority: 'P4',
              subject: `Restoration SMS for outage at ${ctx.slots.postcode}`,
              description: 'Customer requested an SMS notification when the regional outage is resolved.',
              contactPhone: String(ctx.slots.contactPhone),
              source: 'CHATBOT',
              conversationId: ctx.conversation.id,
            },
            ctx.request,
            ctx.idempotencyKey('outage-sms'),
          );
        } catch (error) {
          return downstreamFailure(ctx, error, 'set up the notification');
        }
        return { replies: [{ text: "Done - we'll text you as soon as it's fixed." }], next: END, outcome: 'outage_subscribed' };
      },
    },
    closing: {
      kind: 'action',
      run: async () => ({ replies: [{ text: 'No problem. You can check back here any time for updates.' }], next: END }),
    },
    faultOffer: {
      kind: 'confirm',
      prompt: (ctx) => ({
        text: isBusinessUser(ctx.principal.roles)
          ? 'Are you still having problems? I can try a router reset or raise a priority fault for your business.'
          : 'Are you still having problems with your connection?',
        quickReplies: [
          { label: 'Yes, still down', payload: 'yes' },
          { label: "No, it's fine", payload: 'no' },
        ],
      }),
      onYes: 'troubleshootTips',
      onNo: 'resolved',
    },
    troubleshootTips: {
      kind: 'action',
      run: async () => ({
        replies: [
          {
            text: 'Let\'s get you back online. Restarting your router fixes most problems - I can do that remotely, or raise a fault for an engineer to look at.',
            quickReplies: [
              { label: 'Reset my router', payload: quickReplyPayload('RESET_ROUTER') },
              { label: 'Raise a fault', payload: quickReplyPayload('RAISE_TICKET') },
              agentQuickReply(),
            ],
          },
        ],
        next: END,
        outcome: 'troubleshoot_offered',
      }),
    },
    resolved: {
      kind: 'action',
      run: async () => ({ replies: [{ text: "Glad to hear it! Anything else I can help with?" }], next: END, outcome: 'resolved' }),
    },
  },
};
```

## apps/chatbot/src/dialog/flows/common.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/common.ts`.

```typescript
import { AccountSummary, ServiceSummary } from '../../clients/platformClients';
import { DownstreamError } from '../../domain/errors';
import { BotReply, QuickReply, Role } from '../../domain/types';
import { quickReplyPayload } from '../../nlu/intentClassifier';
import { ActionResult, END, FlowContext } from '../stateMachine';
import { choiceSlot, SlotValidator } from '../slots';

/** Shared helpers used by several dialog flows. */

const ACCOUNT_SCRATCH_KEY = 'account';

/** Loads the customer's account once per turn and caches it in scratch. */
export async function loadAccount(ctx: FlowContext): Promise<AccountSummary> {
  const cached = ctx.scratch[ACCOUNT_SCRATCH_KEY] as AccountSummary | undefined;
  if (cached) return cached;
  const account = await ctx.clients.account.getAccount(ctx.principal.accountId, ctx.request);
  ctx.scratch[ACCOUNT_SCRATCH_KEY] = account;
  return account;
}

export function activeServices(account: AccountSummary): ServiceSummary[] {
  return account.services.filter((s) => s.status === 'ACTIVE');
}

export function describeService(service: ServiceSummary): string {
  return `${service.productName} at ${service.serviceAddress.line1}, ${service.serviceAddress.postcode}`;
}

/** Autofill for a "serviceId" slot: chosen automatically when exactly one active service exists. */
export async function autofillSingleService(ctx: FlowContext): Promise<string | undefined> {
  const services = activeServices(await loadAccount(ctx));
  if (services.length === 1) return services[0].serviceId;
  ctx.slots.serviceOptions = services.map((s) => `${s.serviceId}|${describeService(s)}`).join(';;');
  return undefined;
}

/** Parses the `serviceOptions` slot written by autofillSingleService into choices. */
export function serviceOptions(ctx: FlowContext): Array<{ key: string; label: string }> {
  const raw = String(ctx.slots.serviceOptions ?? '');
  if (!raw) return [];
  return raw.split(';;').map((entry) => {
    const [key, label] = entry.split('|');
    return { key, label };
  });
}

export function serviceChoiceValidator(ctx: FlowContext): SlotValidator {
  return choiceSlot(() => serviceOptions(ctx));
}

export function serviceChoicePrompt(ctx: FlowContext): BotReply {
  const options = serviceOptions(ctx);
  if (options.length === 0) {
    return { text: "I couldn't find an active service on your account. Would you like to talk to an agent?", quickReplies: [agentQuickReply()] };
  }
  return {
    text: `Which service is this about?\n${options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`,
    quickReplies: options.map((o, i) => ({ label: String(i + 1), payload: o.key })),
  };
}

export function agentQuickReply(): QuickReply {
  return { label: 'Talk to an agent', payload: quickReplyPayload('TALK_TO_AGENT') };
}

export function ticketQuickReply(): QuickReply {
  return { label: 'Raise a ticket', payload: quickReplyPayload('RAISE_TICKET') };
}

/**
 * Converts a downstream failure inside an action into a graceful reply that
 * ends the flow and offers human help, instead of surfacing a 502 to the user.
 */
export function downstreamFailure(ctx: FlowContext, error: unknown, what: string): ActionResult {
  if (!(error instanceof DownstreamError)) throw error;
  ctx.logger.warn('flow action downstream failure', {
    flow: ctx.conversation.activeFlow?.flowId,
    what,
    service: error.service,
    status: error.upstreamStatus,
    correlationId: ctx.request.correlationId,
  });
  return {
    replies: [
      {
        text: `Sorry, I couldn't ${what} right now. You can try again in a few minutes or talk to one of our team.`,
        quickReplies: [agentQuickReply()],
      },
    ],
    next: END,
    outcome: 'downstream_error',
  };
}

export function isBusinessUser(roles: Role[]): boolean {
  return roles.includes('BUSINESS_ADMIN') || roles.includes('BUSINESS_USER');
}

export function isPartnerUser(roles: Role[]): boolean {
  return roles.includes('PARTNER_ADMIN') || roles.includes('PARTNER_AGENT');
}

export function formatSpeed(mbps: number): string {
  return mbps >= 1000 ? `${mbps / 1000} Gbps` : `${mbps} Mbps`;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}
```

## apps/chatbot/src/dialog/flows/index.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/index.ts`.

```typescript
import { IntentName } from '../../domain/types';
import { FlowDefinition, validateFlow } from '../stateMachine';
import { createAgentHandoffFlow } from './agentHandoff';
import { billEnquiryFlow } from './billEnquiry';
import { checkOutageFlow } from './checkOutage';
import { planUpgradeFlow } from './planUpgrade';
import { raiseTicketFlow } from './raiseTicket';
import { resetRouterFlow } from './resetRouter';

/** Registry of dialog flows keyed by id and by triggering intent. */
export class FlowRegistry {
  private readonly byId = new Map<string, FlowDefinition>();
  private readonly byIntent = new Map<IntentName, FlowDefinition>();

  constructor(flows: FlowDefinition[]) {
    for (const flow of flows) this.register(flow);
  }

  register(flow: FlowDefinition): void {
    validateFlow(flow);
    if (this.byId.has(flow.id)) throw new Error(`Duplicate flow id ${flow.id}`);
    if (this.byIntent.has(flow.intent)) throw new Error(`Intent ${flow.intent} already mapped to ${this.byIntent.get(flow.intent)?.id}`);
    this.byId.set(flow.id, flow);
    this.byIntent.set(flow.intent, flow);
  }

  get(id: string): FlowDefinition | undefined {
    return this.byId.get(id);
  }

  forIntent(intent: IntentName): FlowDefinition | undefined {
    return this.byIntent.get(intent);
  }

  list(): FlowDefinition[] {
    return [...this.byId.values()];
  }
}

export function defaultFlowRegistry(clock?: () => Date): FlowRegistry {
  return new FlowRegistry([
    checkOutageFlow,
    billEnquiryFlow,
    resetRouterFlow,
    planUpgradeFlow,
    raiseTicketFlow,
    createAgentHandoffFlow(clock),
  ]);
}
```

## apps/chatbot/src/dialog/flows/planUpgrade.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/planUpgrade.test.ts`.

```typescript
import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { account, gbp } from '../../testing/fakes';
import { eligibleUpgrades } from './planUpgrade';

describe('eligibleUpgrades', () => {
  const current = account().services[0];
  const offer = (code: string, downloadMbps: number, amountMinor: number, currency = 'GBP') => ({
    code,
    name: code,
    downloadMbps,
    uploadMbps: 100,
    monthly: { amountMinor, currency },
    contractMonths: 18,
  });

  it('keeps only strictly faster plans in the same currency, slowest then cheapest first', () => {
    const result = eligibleUpgrades(current, [
      offer('SAME', 500, 3000),
      offer('GIG-B', 1000, 6000),
      offer('GIG-A', 1000, 5500),
      offer('EURO', 900, 4000, 'EUR'),
      offer('NINE', 900, 4500),
    ]);
    expect(result.map((o) => o.code)).toEqual(['NINE', 'GIG-A', 'GIG-B']);
  });
});

describe('plan upgrade flow', () => {
  it('lists faster plans with the monthly price difference and submits the chosen one', async () => {
    const chat = new ChatHarness();
    const list = await chat.say('I want to upgrade my plan');
    expect(list.text).toContain("You're on Fibre 500 (500 Mbps)");
    expect(list.text).toContain('1. Fibre 900 - 900 Mbps for £45.00/month (+£10.00)');
    expect(list.text).toContain('2. Gigabit - 1 Gbps for £55.00/month (+£20.00)');
    expect(list.text).not.toContain('Fibre 100');
    expect(list.replies[0].card).toMatchObject({ kind: 'PLANS', plans: [expect.objectContaining({ code: 'FIBRE-900', monthly: gbp(4500) }), expect.anything()] });

    const quote = await chat.say('2');
    expect(quote.text).toBe('Gigabit (1 Gbps) is £55.00 a month on a 18-month contract. Shall I place the upgrade?');

    const done = await chat.say('yes');
    expect(done.text).toContain('Your upgrade is order ORD-0001');
    expect(chat.clients.billing.planChanges).toEqual([
      { serviceId: 'SVC-1', planCode: 'FIBRE-1000', key: expect.stringMatching(/plan-change-SVC-1-FIBRE-1000$/) },
    ]);
    expect(outcomeOf(done, 'plan_upgrade')).toBe('order_submitted');
  });

  it('accepts a plan by its speed alias', async () => {
    const chat = new ChatHarness();
    await chat.say('upgrade my plan');
    const quote = await chat.say('900 mbps');
    expect(quote.text).toContain('Fibre 900 (900 Mbps)');
  });

  it('jumps straight to a quote when the opening message names an offered speed', async () => {
    const chat = new ChatHarness();
    const quote = await chat.say('upgrade me to 1 gig');
    expect(quote.text).toContain('Gigabit (1 Gbps) is £55.00 a month');
    expect(chat.awaiting).toBe('quote');
  });

  it('shows the list when the requested speed is not offered at the address', async () => {
    const chat = new ChatHarness();
    const list = await chat.say('upgrade me to 2 gig');
    expect(list.text).toContain("Here's what you can move to");
    expect(chat.awaiting).toBe('planCode');
  });

  it('changes nothing when the customer declines the quote', async () => {
    const chat = new ChatHarness();
    await chat.say('upgrade me to 1 gig');
    const declined = await chat.say('no');
    expect(declined.text).toContain('nothing has been changed');
    expect(chat.clients.billing.planChanges).toHaveLength(0);
  });

  it('tells top-tier customers there is nothing faster', async () => {
    const chat = new ChatHarness();
    const base = account().services[0];
    chat.clients.account.summary = account({ services: [{ ...base, downloadMbps: 2000 }] });
    const turn = await chat.say('upgrade my plan');
    expect(outcomeOf(turn, 'plan_upgrade')).toBe('already_top_tier');
  });

  it('reports when no faster plans exist at the address', async () => {
    const chat = new ChatHarness();
    chat.clients.billing.offers = [];
    const turn = await chat.say('upgrade my plan');
    expect(turn.text).toContain('no faster plans available at SW1A 1AA');
  });

  it('reports a failed order honestly', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.billing, 'submitPlanChange').mockResolvedValue({ orderId: 'ORD-9', status: 'FAILED', effectiveDate: '2026-11-20T00:00:00Z' });
    await chat.say('upgrade me to 1 gig');
    const turn = await chat.say('yes');
    expect(turn.text).toContain("order ORD-9 couldn't be completed");
    expect(outcomeOf(turn, 'plan_upgrade')).toBe('order_failed');
  });

  it.each([['BUSINESS_USER'], ['PARTNER_AGENT']] as const)('does not let %s change plans', async (role) => {
    const chat = new ChatHarness({ principal: { roles: [role] } });
    await chat.say('upgrade my plan');
    expect(chat.activeFlowId).toBeUndefined();
    expect(chat.clients.billing.planChanges).toHaveLength(0);
  });
});
```

## apps/chatbot/src/dialog/flows/planUpgrade.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/planUpgrade.ts`.

```typescript
import { PlanOffer, ServiceSummary } from '../../clients/platformClients';
import { formatMoney, priceDelta } from '../../domain/money';
import { BotReply } from '../../domain/types';
import { choiceSlot, speedSlot } from '../slots';
import { END, FlowContext, FlowDefinition } from '../stateMachine';
import {
  activeServices,
  autofillSingleService,
  downstreamFailure,
  formatDate,
  formatSpeed,
  loadAccount,
  serviceChoicePrompt,
  serviceChoiceValidator,
} from './common';

/**
 * Plan upgrade: picks the service, loads eligible upgrade offers (faster than the
 * current tier), lets the customer choose by number/name/speed, quotes the monthly
 * price difference and submits a PLAN_CHANGE order idempotently.
 *
 * Business users without admin rights cannot change plans (enforced via allowedRoles).
 */

export const ADVERTISED_TIERS_MBPS = [100, 500, 900, 1000, 2000];

/** A requested speed in the opening message ("upgrade me to 1 gig") skips the plan list. */
const desiredSpeedValidator = speedSlot(ADVERTISED_TIERS_MBPS);

interface StoredOffer {
  code: string;
  name: string;
  downloadMbps: number;
  monthlyMinor: number;
  currency: string;
  contractMonths: number;
}

/** Offers are persisted between turns as a compact JSON string slot. */
function storeOffers(ctx: FlowContext, offers: PlanOffer[]): void {
  const stored: StoredOffer[] = offers.map((o) => ({
    code: o.code,
    name: o.name,
    downloadMbps: o.downloadMbps,
    monthlyMinor: o.monthly.amountMinor,
    currency: o.monthly.currency,
    contractMonths: o.contractMonths,
  }));
  ctx.slots.offersJson = JSON.stringify(stored);
}

export function readOffers(ctx: FlowContext): StoredOffer[] {
  try {
    const parsed = JSON.parse(String(ctx.slots.offersJson ?? '[]')) as StoredOffer[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Eligible upgrades: strictly faster than the current tier, cheapest first. */
export function eligibleUpgrades(current: ServiceSummary, offers: PlanOffer[]): PlanOffer[] {
  return offers
    .filter((o) => o.downloadMbps > current.downloadMbps && o.monthly.currency === current.monthlyPrice.currency)
    .sort((a, b) => a.downloadMbps - b.downloadMbps || a.monthly.amountMinor - b.monthly.amountMinor);
}

function offersReply(offers: StoredOffer[], current: ServiceSummary): BotReply {
  const lines = offers.map((o, i) => {
    const delta = priceDelta(current.monthlyPrice, { amountMinor: o.monthlyMinor, currency: o.currency });
    const sign = delta.amountMinor >= 0 ? '+' : '-';
    const abs = formatMoney({ amountMinor: Math.abs(delta.amountMinor), currency: delta.currency });
    return `${i + 1}. ${o.name} - ${formatSpeed(o.downloadMbps)} for ${formatMoney({ amountMinor: o.monthlyMinor, currency: o.currency })}/month (${sign}${abs})`;
  });
  return {
    text: `You're on ${current.productName} (${formatSpeed(current.downloadMbps)}). Here's what you can move to:\n${lines.join('\n')}`,
    card: {
      kind: 'PLANS',
      plans: offers.map((o) => ({ code: o.code, name: o.name, downloadMbps: o.downloadMbps, monthly: { amountMinor: o.monthlyMinor, currency: o.currency } })),
    },
    quickReplies: offers.map((o, i) => ({ label: `${i + 1}. ${formatSpeed(o.downloadMbps)}`, payload: o.code })),
  };
}

async function currentService(ctx: FlowContext): Promise<ServiceSummary | undefined> {
  const account = await loadAccount(ctx);
  return activeServices(account).find((s) => s.serviceId === ctx.slots.serviceId);
}

export const planUpgradeFlow: FlowDefinition = {
  id: 'plan_upgrade',
  intent: 'PLAN_UPGRADE',
  label: 'upgrading your plan',
  initial: 'serviceId',
  allowedRoles: ['CONSUMER', 'BUSINESS_ADMIN', 'PARTNER_ADMIN'],
  prefill(entities) {
    if (!entities.some((e) => e.type === 'SPEED')) return {};
    const parsed = desiredSpeedValidator.parse('', entities);
    return parsed.ok ? { desiredMbps: parsed.value } : {};
  },
  states: {
    serviceId: {
      kind: 'slot',
      slot: 'serviceId',
      validator: serviceChoiceValidator,
      autofill: autofillSingleService,
      prompt: serviceChoicePrompt,
      next: 'loadOffers',
    },
    loadOffers: {
      kind: 'action',
      async run(ctx) {
        try {
          const current = await currentService(ctx);
          if (!current) {
            return { replies: [{ text: "I couldn't find that service on your account." }], next: END, outcome: 'service_not_found' };
          }
          if (current.downloadMbps >= Math.max(...ADVERTISED_TIERS_MBPS)) {
            return { replies: [{ text: "You're already on our fastest plan - nothing to upgrade to right now!" }], next: END, outcome: 'already_top_tier' };
          }
          const offers = eligibleUpgrades(current, await ctx.clients.billing.listUpgradeOffers(ctx.principal.accountId, current.serviceId, ctx.request));
          if (offers.length === 0) {
            return { replies: [{ text: `There are no faster plans available at ${current.serviceAddress.postcode} yet. We'll let you know when that changes.` }], next: END, outcome: 'no_offers' };
          }
          storeOffers(ctx, offers);
          const desired = ctx.slots.desiredMbps;
          if (typeof desired === 'number') {
            const match = offers.find((o) => o.downloadMbps === desired);
            if (match) {
              ctx.slots.planCode = match.code;
              return { next: 'quote' };
            }
          }
          return { replies: [offersReply(readOffers(ctx), current)], next: 'planCode' };
        } catch (error) {
          return downstreamFailure(ctx, error, 'load upgrade options');
        }
      },
    },
    planCode: {
      kind: 'slot',
      slot: 'planCode',
      validator: (ctx) =>
        choiceSlot(() =>
          readOffers(ctx).map((o) => ({ key: o.code, label: o.name, aliases: [formatSpeed(o.downloadMbps), `${o.downloadMbps}`, `${o.downloadMbps} mbps`] })),
        ),
      prompt: { text: 'Which plan would you like? You can reply with the number.' },
      next: 'quote',
    },
    quote: {
      kind: 'confirm',
      prompt(ctx) {
        const offer = readOffers(ctx).find((o) => o.code === ctx.slots.planCode);
        if (!offer) return { text: 'Shall I go ahead?' };
        const term = offer.contractMonths > 0 ? ` on a ${offer.contractMonths}-month contract` : '';
        return {
          text: `${offer.name} (${formatSpeed(offer.downloadMbps)}) is ${formatMoney({ amountMinor: offer.monthlyMinor, currency: offer.currency })} a month${term}. Shall I place the upgrade?`,
          quickReplies: [
            { label: 'Yes, upgrade', payload: 'yes' },
            { label: 'No', payload: 'no' },
          ],
        };
      },
      onYes: 'submit',
      onNo: 'declined',
    },
    submit: {
      kind: 'action',
      async run(ctx) {
        try {
          const result = await ctx.clients.billing.submitPlanChange(
            ctx.principal.accountId,
            String(ctx.slots.serviceId),
            String(ctx.slots.planCode),
            ctx.request,
            ctx.idempotencyKey(`plan-change-${ctx.slots.serviceId}-${ctx.slots.planCode}`),
          );
          if (result.status === 'FAILED' || result.status === 'CANCELLED') {
            return { replies: [{ text: `Sorry, order ${result.orderId} couldn't be completed. An advisor will be in touch.` }], next: END, outcome: 'order_failed' };
          }
          return {
            replies: [
              {
                text: `Done! Your upgrade is order ${result.orderId}. It'll be active from ${formatDate(result.effectiveDate)} - you'll get a confirmation email shortly.`,
              },
            ],
            next: END,
            outcome: 'order_submitted',
          };
        } catch (error) {
          return downstreamFailure(ctx, error, 'place your upgrade');
        }
      },
    },
    declined: {
      kind: 'action',
      run: async () => ({ replies: [{ text: "No problem - nothing has been changed. The offers will still be here if you change your mind." }], next: END, outcome: 'declined' }),
    },
  },
};
```

## apps/chatbot/src/dialog/flows/raiseTicket.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/raiseTicket.test.ts`.

```typescript
import { ChatHarness, outcomeOf, principal } from '../../testing/chatHarness';
import { buildSubject, derivePriority } from './raiseTicket';

describe('derivePriority', () => {
  const consumer = principal();
  const business = principal({ roles: ['BUSINESS_ADMIN'] });

  it('never assigns P1, which is reserved for NOC major incidents', () => {
    expect(derivePriority('FAULT', 'All sites down, phones down, total outage', business)).toBe('P2');
  });

  it('ranks a total loss of service higher for business customers', () => {
    expect(derivePriority('FAULT', 'We have no internet at the office', business)).toBe('P2');
    expect(derivePriority('FAULT', 'We have no internet at home', consumer)).toBe('P3');
  });

  it('treats degraded service as P3 and other faults as P4', () => {
    expect(derivePriority('FAULT', 'Connection keeps disconnecting every evening', business)).toBe('P3');
    expect(derivePriority('FAULT', 'The router LED is a strange colour', consumer)).toBe('P4');
  });

  it('assigns category defaults for non-fault tickets', () => {
    expect(derivePriority('COMPLAINT', 'Unhappy with the installer', consumer)).toBe('P3');
    expect(derivePriority('BILLING', 'Charged twice', consumer)).toBe('P3');
    expect(derivePriority('GENERAL', 'Can I change my email address?', consumer)).toBe('P4');
  });
});

describe('buildSubject', () => {
  it('uses the category label and the first sentence of the description', () => {
    expect(buildSubject('BILLING', 'I was charged twice. Please refund me.')).toBe('Billing or payments: I was charged twice');
  });

  it('truncates long first sentences to keep subjects scannable', () => {
    const subject = buildSubject('GENERAL', 'x'.repeat(100));
    expect(subject).toBe(`Something else: ${'x'.repeat(57)}...`);
  });
});

describe('raise ticket flow', () => {
  it('collects category, description and callback number, then creates the ticket after confirmation', async () => {
    const chat = new ChatHarness();
    const menu = await chat.say('I want to raise a ticket');
    expect(menu.replies[0].quickReplies?.map((q) => q.payload)).toEqual(['FAULT', 'BILLING', 'COMPLAINT', 'GENERAL']);

    await chat.say('1');
    expect(chat.awaiting).toBe('description');

    await chat.say('The internet has been completely down since this morning, nothing works');
    expect(chat.awaiting).toBe('phone');

    const summary = await chat.say('07700 900123');
    expect(summary.text).toContain('- Type: Fault with my service');
    expect(summary.text).toContain('- Callback: 07700900123');
    expect(summary.text).toContain('Expected response: within 1 working day');

    const created = await chat.say('yes');
    expect(created.text).toContain('Your ticket TKT-0000001 is open (priority P3)');
    expect(created.replies[0].card).toEqual({ kind: 'TICKET', ticketId: 'TKT-0000001', priority: 'P3', status: 'OPEN' });
    expect(chat.clients.tickets.created[0].request).toMatchObject({
      category: 'FAULT',
      priority: 'P3',
      subject: 'Fault with my service: The internet has been completely down since this morning,...',
      contactPhone: '07700900123',
      conversationId: chat.conversation.id,
    });
    expect(outcomeOf(created, 'raise_ticket')).toBe('ticket_created');
  });

  it('accepts a category by alias', async () => {
    const chat = new ChatHarness();
    await chat.say('log a fault');
    await chat.say('billing');
    await chat.say('My direct debit was taken twice in October');
    await chat.say('07700900123');
    await chat.say('yes');
    expect(chat.clients.tickets.created[0].request.category).toBe('BILLING');
  });

  it('does not let a typed description be hijacked by intent detection', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    await chat.say('Please reset my router, the router lights are red all the time');
    expect(chat.activeFlowId).toBe('raise_ticket');
    expect(chat.conversation.activeFlow?.slots.description).toContain('reset my router');
  });

  it('abandons the flow after three unusable descriptions', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('fault');
    const first = await chat.say('slow');
    expect(first.text).toContain('at least 15 characters');
    await chat.say('very slow');
    const last = await chat.say('help');
    expect(last.text).toContain("Let's leave this here for now");
    expect(outcomeOf(last, 'raise_ticket')).toBe('abandoned');
    expect(chat.conversation.fallbackCount).toBe(1);
  });

  it('creates nothing when the customer cancels at the summary', async () => {
    const chat = new ChatHarness();
    await chat.say('raise a ticket');
    await chat.say('4');
    await chat.say('How do I add a second user to the portal?');
    await chat.say('07700900123');
    const cancelled = await chat.say('no');
    expect(cancelled.text).toContain("I haven't raised anything");
    expect(chat.clients.tickets.created).toHaveLength(0);
  });

  it('ends gracefully without a ticket when the ticket API is unavailable', async () => {
    const chat = new ChatHarness();
    chat.clients.tickets.failNext = true;
    await chat.say('raise a ticket');
    await chat.say('fault');
    await chat.say('My broadband drops out every hour or so');
    await chat.say('07700900123');
    const failed = await chat.say('yes');
    expect(failed.text).toContain("couldn't create your ticket");
    expect(chat.clients.tickets.created).toHaveLength(0);
  });
});
```

## apps/chatbot/src/dialog/flows/raiseTicket.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/raiseTicket.ts`.

```typescript
import { CreateTicketRequest } from '../../clients/platformClients';
import { Principal, TicketPriority } from '../../domain/types';
import { choiceSlot, freeTextSlot, phoneSlot } from '../slots';
import { END, FlowDefinition } from '../stateMachine';
import { downstreamFailure, isBusinessUser } from './common';

/**
 * Raise ticket: collects category, description and a callback number, shows a
 * summary for confirmation and creates the ticket with a derived priority.
 */

export const TICKET_CATEGORIES: Array<{ key: CreateTicketRequest['category']; label: string; aliases: string[] }> = [
  { key: 'FAULT', label: 'Fault with my service', aliases: ['fault', 'broken', 'not working', 'technical'] },
  { key: 'BILLING', label: 'Billing or payments', aliases: ['billing', 'bill', 'payment', 'charge'] },
  { key: 'COMPLAINT', label: 'Make a complaint', aliases: ['complaint', 'complain', 'unhappy'] },
  { key: 'GENERAL', label: 'Something else', aliases: ['other', 'general', 'question'] },
];

const TOTAL_LOSS_CUES = ['no service', 'completely down', 'no internet', 'total outage', 'nothing works', 'all sites down', 'phones down'];
const DEGRADED_CUES = ['slow', 'intermittent', 'dropping', 'drops out', 'keeps disconnecting', 'buffering'];

/**
 * Priority rules (CONVENTIONS: P1..P4):
 *  - P1 is reserved for NOC-raised major incidents and never set by the chatbot.
 *  - Business total loss of service -> P2; consumer total loss -> P3.
 *  - Degraded service -> P3; complaints -> P3; everything else -> P4.
 */
export function derivePriority(category: CreateTicketRequest['category'], description: string, principal: Principal): TicketPriority {
  const text = description.toLowerCase();
  const totalLoss = TOTAL_LOSS_CUES.some((cue) => text.includes(cue));
  const degraded = DEGRADED_CUES.some((cue) => text.includes(cue));
  if (category === 'FAULT') {
    if (totalLoss) return isBusinessUser(principal.roles) ? 'P2' : 'P3';
    if (degraded) return 'P3';
    return 'P4';
  }
  if (category === 'COMPLAINT') return 'P3';
  if (category === 'BILLING') return 'P3';
  return 'P4';
}

export function buildSubject(category: CreateTicketRequest['category'], description: string): string {
  const label = TICKET_CATEGORIES.find((c) => c.key === category)?.label ?? 'Support request';
  const firstSentence = description.split(/[.!?\n]/)[0].trim();
  const snippet = firstSentence.length > 60 ? `${firstSentence.slice(0, 57)}...` : firstSentence;
  return `${label}: ${snippet}`;
}

const RESPONSE_TIMES: Record<TicketPriority, string> = {
  P1: '1 hour',
  P2: '4 hours',
  P3: '1 working day',
  P4: '3 working days',
};

export const raiseTicketFlow: FlowDefinition = {
  id: 'raise_ticket',
  intent: 'RAISE_TICKET',
  label: 'raising a ticket',
  initial: 'category',
  states: {
    category: {
      kind: 'slot',
      slot: 'category',
      validator: choiceSlot(() => TICKET_CATEGORIES),
      prompt: {
        text: `What's the ticket about?\n${TICKET_CATEGORIES.map((c, i) => `${i + 1}. ${c.label}`).join('\n')}`,
        quickReplies: TICKET_CATEGORIES.map((c) => ({ label: c.label, payload: c.key })),
      },
      next: 'description',
    },
    description: {
      kind: 'slot',
      slot: 'description',
      validator: freeTextSlot(15, 1000),
      captureFreeText: true,
      prompt: { text: 'Please describe the problem in a sentence or two - when it started and what you\'ve tried helps us most.' },
      next: 'phone',
    },
    phone: {
      kind: 'slot',
      slot: 'contactPhone',
      validator: phoneSlot,
      prompt: { text: 'What number can our team call you back on?' },
      next: 'confirm',
    },
    confirm: {
      kind: 'confirm',
      prompt(ctx) {
        const category = String(ctx.slots.category) as CreateTicketRequest['category'];
        const priority = derivePriority(category, String(ctx.slots.description), ctx.principal);
        ctx.slots.priority = priority;
        return {
          text:
            `Here's your ticket:\n- Type: ${TICKET_CATEGORIES.find((c) => c.key === category)?.label}\n` +
            `- Details: ${ctx.slots.description}\n- Callback: ${ctx.slots.contactPhone}\n` +
            `- Expected response: within ${RESPONSE_TIMES[priority]}\nShall I submit it?`,
          quickReplies: [
            { label: 'Submit', payload: 'yes' },
            { label: 'Cancel', payload: 'no' },
          ],
        };
      },
      onYes: 'create',
      onNo: 'cancelled',
    },
    create: {
      kind: 'action',
      async run(ctx) {
        const category = String(ctx.slots.category) as CreateTicketRequest['category'];
        const description = String(ctx.slots.description);
        const priority = (ctx.slots.priority as TicketPriority | undefined) ?? derivePriority(category, description, ctx.principal);
        try {
          const ticket = await ctx.clients.tickets.createTicket(
            {
              accountId: ctx.principal.accountId,
              category,
              priority,
              subject: buildSubject(category, description),
              description,
              contactPhone: String(ctx.slots.contactPhone),
              serviceId: ctx.slots.serviceId ? String(ctx.slots.serviceId) : undefined,
              source: 'CHATBOT',
              conversationId: ctx.conversation.id,
            },
            ctx.request,
            ctx.idempotencyKey('ticket'),
          );
          ctx.slots.ticketId = ticket.ticketId;
          return {
            replies: [
              {
                text: `Your ticket ${ticket.ticketId} is open (priority ${ticket.priority}). We'll be in touch within ${RESPONSE_TIMES[ticket.priority]}. You can track it under Support in your portal.`,
                card: { kind: 'TICKET', ticketId: ticket.ticketId, priority: ticket.priority, status: ticket.status },
              },
            ],
            next: END,
            outcome: 'ticket_created',
          };
        } catch (error) {
          return downstreamFailure(ctx, error, 'create your ticket');
        }
      },
    },
    cancelled: {
      kind: 'action',
      run: async () => ({ replies: [{ text: "OK, I haven't raised anything. Let me know if you change your mind." }], next: END, outcome: 'cancelled' }),
    },
  },
};
```

## apps/chatbot/src/dialog/flows/resetRouter.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/resetRouter.test.ts`.

```typescript
import { ChatHarness, outcomeOf } from '../../testing/chatHarness';
import { account } from '../../testing/fakes';
import { diagnose, OPTICAL_MAX_DBM, OPTICAL_MIN_DBM } from './resetRouter';

const healthy = { serviceId: 'SVC-1', ontOnline: true, routerOnline: true, lastSeen: '2026-11-11T09:59:00Z', opticalSignalDbm: -18 };

describe('diagnose', () => {
  it('prioritises an offline ONT over every other symptom', () => {
    expect(diagnose({ ...healthy, ontOnline: false, routerOnline: false, opticalSignalDbm: -40 })).toBe('ONT_OFFLINE');
  });

  it('flags optical power outside the healthy band as a fibre fault', () => {
    expect(diagnose({ ...healthy, opticalSignalDbm: OPTICAL_MIN_DBM - 0.5 })).toBe('WEAK_SIGNAL');
    expect(diagnose({ ...healthy, opticalSignalDbm: OPTICAL_MAX_DBM + 1 })).toBe('WEAK_SIGNAL');
    expect(diagnose({ ...healthy, opticalSignalDbm: OPTICAL_MIN_DBM })).toBe('HEALTHY');
  });

  it('treats an unknown optical reading as acceptable', () => {
    expect(diagnose({ ...healthy, opticalSignalDbm: undefined, routerOnline: false })).toBe('ROUTER_OFFLINE');
  });
});

describe('reset router flow', () => {
  it('reboots a healthy line remotely after confirmation, with an idempotency key per service', async () => {
    const chat = new ChatHarness();
    const check = await chat.say('please reset my router');
    expect(check.text).toContain('look healthy');
    expect(chat.awaiting).toBe('rebootConfirm');

    const reboot = jest.spyOn(chat.clients.network, 'requestRemoteReboot');
    const done = await chat.say('yes');
    expect(chat.clients.network.reboots).toEqual(['SVC-1']);
    expect(reboot.mock.calls[0][2]).toMatch(/:reboot-SVC-1$/);
    expect(outcomeOf(done, 'reset_router')).toBe('remote_reboot');
  });

  it('gives manual steps when the customer declines the remote restart', async () => {
    const chat = new ChatHarness();
    await chat.say('reboot the router');
    const declined = await chat.say('not now');
    expect(declined.text).toContain('1. Switch the router off at the wall');
    expect(chat.clients.network.reboots).toHaveLength(0);
    expect(outcomeOf(declined, 'reset_router')).toBe('manual_steps');
  });

  it('stops before rebooting when the ONT is offline and points to outage checks', async () => {
    const chat = new ChatHarness();
    chat.clients.network.diagnostic = { ...healthy, ontOnline: false };
    const turn = await chat.say('reset the hub please');
    expect(turn.text).toContain("fibre box (the ONT on the wall) isn't responding");
    expect(turn.replies[0].quickReplies?.map((q) => q.payload)).toContain('intent:CHECK_OUTAGE');
    expect(chat.clients.network.reboots).toHaveLength(0);
    expect(outcomeOf(turn, 'reset_router')).toBe('ont_offline');
  });

  it('walks through manual checks for an offline router and escalates if they fail', async () => {
    const chat = new ChatHarness();
    chat.clients.network.diagnostic = { ...healthy, routerOnline: false };
    const steps = await chat.say('router lights are red');
    expect(steps.text).toContain('Your router appears to be offline');
    expect(chat.awaiting).toBe('manualWorked');

    const escalated = await chat.say('no');
    expect(escalated.replies[0].quickReplies?.map((q) => q.payload)).toEqual(['intent:RAISE_TICKET', 'intent:TALK_TO_AGENT']);
    expect(outcomeOf(escalated, 'reset_router')).toBe('escalation_offered');
  });

  it('falls back to manual steps when the router rejects the reboot command', async () => {
    const chat = new ChatHarness();
    jest.spyOn(chat.clients.network, 'requestRemoteReboot').mockResolvedValue({ accepted: false });
    await chat.say('please reset my router');
    const rejected = await chat.say('yes');
    expect(rejected.text).toContain("didn't accept the restart command");
    expect(chat.awaiting).toBe('manualWorked');
  });

  it('asks which service to reset when the account has several, accepting the option number', async () => {
    const base = account().services[0];
    const chat = new ChatHarness();
    chat.clients.account.summary = account({
      services: [
        base,
        { ...base, serviceId: 'SVC-2', productName: 'Fibre 900', serviceAddress: { line1: '9 Dock Road', town: 'Hull', postcode: 'HU1 1AA' } },
        { ...base, serviceId: 'SVC-3', status: 'CEASED' },
      ],
    });
    const diagnostic = jest.spyOn(chat.clients.network, 'runLineDiagnostic');

    const prompt = await chat.say('please reset my router');
    expect(prompt.text).toContain('1. Fibre 500 at 1 High Street, SW1A 1AA');
    expect(prompt.text).toContain('2. Fibre 900 at 9 Dock Road, HU1 1AA');
    expect(prompt.text).not.toContain('3.');

    await chat.say('2');
    expect(diagnostic).toHaveBeenCalledWith('SVC-2', expect.anything());
  });
});
```

## apps/chatbot/src/dialog/flows/resetRouter.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/flows/resetRouter.ts`.

```typescript
import { LineDiagnostic } from '../../clients/platformClients';
import { quickReplyPayload } from '../../nlu/intentClassifier';
import { END, FlowDefinition } from '../stateMachine';
import {
  agentQuickReply,
  autofillSingleService,
  downstreamFailure,
  serviceChoicePrompt,
  serviceChoiceValidator,
  ticketQuickReply,
} from './common';

/**
 * Reset router: runs a line diagnostic for the chosen service, then either
 * triggers a remote reboot of the router or walks the customer through manual
 * checks when the optical terminal (ONT) itself is offline.
 */

/** Optical receive power outside this range indicates a fibre fault rather than a router issue. */
export const OPTICAL_MIN_DBM = -27;
export const OPTICAL_MAX_DBM = -8;

export type DiagnosisKind = 'ONT_OFFLINE' | 'WEAK_SIGNAL' | 'ROUTER_OFFLINE' | 'HEALTHY';

export function diagnose(result: LineDiagnostic): DiagnosisKind {
  if (!result.ontOnline) return 'ONT_OFFLINE';
  if (
    result.opticalSignalDbm !== undefined &&
    (result.opticalSignalDbm < OPTICAL_MIN_DBM || result.opticalSignalDbm > OPTICAL_MAX_DBM)
  ) {
    return 'WEAK_SIGNAL';
  }
  if (!result.routerOnline) return 'ROUTER_OFFLINE';
  return 'HEALTHY';
}

const MANUAL_STEPS = [
  'Switch the router off at the wall and wait 30 seconds.',
  'Check the cable between the fibre box (ONT) and the router WAN port is pushed in firmly.',
  'Switch the router back on and give it 3 minutes to start.',
  'If the lights are still red, try a different power socket.',
].map((step, i) => `${i + 1}. ${step}`).join('\n');

export const resetRouterFlow: FlowDefinition = {
  id: 'reset_router',
  intent: 'RESET_ROUTER',
  label: 'resetting your router',
  initial: 'serviceId',
  states: {
    serviceId: {
      kind: 'slot',
      slot: 'serviceId',
      validator: serviceChoiceValidator,
      autofill: autofillSingleService,
      prompt: serviceChoicePrompt,
      next: 'diagnose',
    },
    diagnose: {
      kind: 'action',
      async run(ctx) {
        let result: LineDiagnostic;
        try {
          result = await ctx.clients.network.runLineDiagnostic(String(ctx.slots.serviceId), ctx.request);
        } catch (error) {
          return downstreamFailure(ctx, error, 'run a line check');
        }
        const diagnosis = diagnose(result);
        ctx.slots.diagnosis = diagnosis;
        switch (diagnosis) {
          case 'ONT_OFFLINE':
            return {
              replies: [
                {
                  text:
                    "Your fibre box (the ONT on the wall) isn't responding, so a router reset won't help yet. Please check its power light is on. " +
                    'If it has a red LOS light, there may be a fault on the line or an outage nearby.',
                  quickReplies: [
                    { label: 'Check for outages', payload: quickReplyPayload('CHECK_OUTAGE') },
                    ticketQuickReply(),
                  ],
                },
              ],
              next: END,
              outcome: 'ont_offline',
            };
          case 'WEAK_SIGNAL':
            return {
              replies: [
                {
                  text: "The fibre signal to your property is outside normal levels, which needs an engineer. I'd recommend raising a fault.",
                  quickReplies: [ticketQuickReply(), agentQuickReply()],
                },
              ],
              next: END,
              outcome: 'fibre_fault_suspected',
            };
          case 'ROUTER_OFFLINE':
            return { replies: [{ text: `Your router appears to be offline. Try these steps:\n${MANUAL_STEPS}` }], next: 'manualWorked' };
          default:
            return { replies: [{ text: 'Your line and router both look healthy from our side.' }], next: 'rebootConfirm' };
        }
      },
    },
    rebootConfirm: {
      kind: 'confirm',
      prompt: {
        text: 'I can restart your router remotely - it will be offline for about 3 minutes. Go ahead?',
        quickReplies: [
          { label: 'Restart it', payload: 'yes' },
          { label: 'Not now', payload: 'no' },
        ],
      },
      onYes: 'reboot',
      onNo: 'declined',
    },
    reboot: {
      kind: 'action',
      async run(ctx) {
        try {
          const result = await ctx.clients.network.requestRemoteReboot(
            String(ctx.slots.serviceId),
            ctx.request,
            ctx.idempotencyKey(`reboot-${ctx.slots.serviceId}`),
          );
          if (!result.accepted) {
            return { replies: [{ text: "The router didn't accept the restart command. Let's try a manual restart instead:\n" + MANUAL_STEPS }], next: 'manualWorked' };
          }
          return {
            replies: [{ text: "Restart sent. Give it about 3 minutes, then check your connection. If it's still slow afterwards, let me know." }],
            next: END,
            outcome: 'remote_reboot',
          };
        } catch (error) {
          return downstreamFailure(ctx, error, 'restart your router');
        }
      },
    },
    manualWorked: {
      kind: 'confirm',
      prompt: { text: 'Is your connection working now?', quickReplies: [{ label: 'Yes', payload: 'yes' }, { label: 'No', payload: 'no' }] },
      onYes: 'fixed',
      onNo: 'escalate',
    },
    fixed: {
      kind: 'action',
      run: async () => ({ replies: [{ text: "Brilliant, glad that's sorted." }], next: END, outcome: 'resolved' }),
    },
    escalate: {
      kind: 'action',
      run: async () => ({
        replies: [{ text: "Sorry that didn't fix it. The next step is a fault ticket so an engineer can investigate.", quickReplies: [ticketQuickReply(), agentQuickReply()] }],
        next: END,
        outcome: 'escalation_offered',
      }),
    },
    declined: {
      kind: 'action',
      run: async () => ({ replies: [{ text: `No problem. If you'd rather restart it yourself:\n${MANUAL_STEPS}` }], next: END, outcome: 'manual_steps' }),
    },
  },
};
```

## apps/chatbot/src/dialog/slots.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/slots.test.ts`.

```typescript
import { extractEntities } from '../nlu/entityExtractor';
import { choiceSlot, freeTextSlot, invoiceIdSlot, phoneSlot, postcodeSlot, SlotValidator, speedSlot, yesNoSlot } from './slots';

const parse = (validator: SlotValidator, text: string) => validator.parse(text, extractEntities(text));

describe('slot validators', () => {
  it('parses postcodes from entities embedded in a sentence or bare input', () => {
    expect(parse(postcodeSlot, "it's at ec1a1bb thanks")).toEqual({ ok: true, value: 'EC1A 1BB' });
    expect(parse(postcodeSlot, 'w1a 0ax')).toEqual({ ok: true, value: 'W1A 0AX' });
    expect(parse(postcodeSlot, '12345')).toMatchObject({ ok: false });
  });

  it('normalises UK phone numbers and rejects non-UK formats', () => {
    expect(parse(phoneSlot, '+44 7700 900123')).toEqual({ ok: true, value: '07700900123' });
    expect(parse(phoneSlot, '020 7946 0018')).toEqual({ ok: true, value: '02079460018' });
    expect(parse(phoneSlot, '555-0100')).toMatchObject({ ok: false, error: expect.stringContaining('UK phone number') });
  });

  it('understands yes/no variants including quick-reply payloads and punctuation', () => {
    expect(parse(yesNoSlot, 'Yes please!')).toEqual({ ok: true, value: true });
    expect(parse(yesNoSlot, 'intent:AFFIRM')).toEqual({ ok: true, value: true });
    expect(parse(yesNoSlot, 'No thanks')).toEqual({ ok: true, value: false });
    expect(parse(yesNoSlot, 'maybe later')).toMatchObject({ ok: false });
  });

  it('collapses whitespace in free text and enforces length bounds', () => {
    const validator = freeTextSlot(5, 20);
    expect(parse(validator, '  line   keeps\n dropping ')).toEqual({ ok: true, value: 'line keeps dropping' });
    expect(parse(validator, 'hm')).toMatchObject({ ok: false, error: expect.stringContaining('at least 5') });
    expect(parse(validator, 'x'.repeat(21))).toMatchObject({ ok: false, error: expect.stringContaining('under 20') });
  });

  describe('choiceSlot', () => {
    const options = [
      { key: 'FIBRE-900', label: 'Fibre 900', aliases: ['900 mbps'] },
      { key: 'FIBRE-1000', label: 'Fibre Gigabit', aliases: ['1 gbps'] },
      { key: 'VOICE', label: 'Home Phone' },
    ];
    const validator = choiceSlot(() => options);

    it('accepts an in-range option number but not out-of-range or decimal numbers', () => {
      expect(parse(validator, '3')).toEqual({ ok: true, value: 'VOICE' });
      expect(parse(validator, '4')).toMatchObject({ ok: false });
      expect(parse(validator, '0')).toMatchObject({ ok: false });
    });

    it('accepts keys, labels and aliases case-insensitively', () => {
      expect(parse(validator, 'fibre-1000')).toEqual({ ok: true, value: 'FIBRE-1000' });
      expect(parse(validator, 'HOME PHONE')).toEqual({ ok: true, value: 'VOICE' });
      expect(parse(validator, '1 Gbps')).toEqual({ ok: true, value: 'FIBRE-1000' });
    });

    it('accepts an unambiguous partial label but rejects an ambiguous one', () => {
      expect(parse(validator, 'gigabit')).toEqual({ ok: true, value: 'FIBRE-1000' });
      const ambiguous = parse(validator, 'fibre');
      expect(ambiguous).toMatchObject({ ok: false, error: 'Please pick one of: 1. Fibre 900, 2. Fibre Gigabit, 3. Home Phone.' });
    });

    it('re-reads options on every parse so dynamic lists stay current', () => {
      const dynamic: Array<{ key: string; label: string }> = [];
      const lazy = choiceSlot(() => dynamic);
      expect(parse(lazy, '1')).toMatchObject({ ok: false });
      dynamic.push({ key: 'A', label: 'Alpha' });
      expect(parse(lazy, '1')).toEqual({ ok: true, value: 'A' });
    });
  });

  it('restricts speeds to the advertised tiers', () => {
    const validator = speedSlot([500, 1000, 2000]);
    expect(parse(validator, '2 gig please')).toEqual({ ok: true, value: 2000 });
    expect(parse(validator, '500')).toEqual({ ok: true, value: 500 });
    expect(parse(validator, '300 mbps')).toMatchObject({ ok: false, error: 'We offer 500 Mbps, 1 Gbps, 2 Gbps. Which would you like?' });
  });

  it('resolves invoice references to an id or the LATEST marker', () => {
    expect(parse(invoiceIdSlot, 'inv00123456 please')).toEqual({ ok: true, value: 'INV-00123456' });
    expect(parse(invoiceIdSlot, 'the latest one')).toMatchObject({ ok: false });
    expect(parse(invoiceIdSlot, 'latest one')).toEqual({ ok: true, value: 'LATEST' });
    expect(parse(invoiceIdSlot, 'most recent')).toEqual({ ok: true, value: 'LATEST' });
  });
});
```

## apps/chatbot/src/dialog/slots.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/slots.ts`.

```typescript
import { Entity, EntityType } from '../domain/types';
import { normalisePhone, normalisePostcode } from '../nlu/entityExtractor';
import { normalise } from '../nlu/rulesMatcher';

/**
 * Slot validators. Each validator parses free-text input (plus any entities the
 * NLU extracted from it) into a typed slot value or a user-facing error.
 */

export type SlotValue = string | number | boolean;

export type SlotParseResult = { ok: true; value: SlotValue } | { ok: false; error: string };

export interface SlotValidator {
  /** Entity type that can pre-fill this slot directly from the utterance. */
  entity?: EntityType;
  parse(text: string, entities: Entity[]): SlotParseResult;
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
const UK_PHONE = /^(?:0\d{9,10})$/;

export const postcodeSlot: SlotValidator = {
  entity: 'POSTCODE',
  parse(text, entities) {
    const fromEntity = entities.find((e) => e.type === 'POSTCODE');
    if (fromEntity) return { ok: true, value: fromEntity.value };
    const trimmed = text.trim();
    if (UK_POSTCODE.test(trimmed)) return { ok: true, value: normalisePostcode(trimmed) };
    return { ok: false, error: "That doesn't look like a valid UK postcode. It should look like SW1A 1AA." };
  },
};

export const phoneSlot: SlotValidator = {
  entity: 'PHONE',
  parse(text, entities) {
    const fromEntity = entities.find((e) => e.type === 'PHONE');
    const candidate = fromEntity?.value ?? normalisePhone(text.trim());
    if (UK_PHONE.test(candidate)) return { ok: true, value: candidate };
    return { ok: false, error: 'Please give a UK phone number, for example 07700 900123.' };
  },
};

const YES = new Set(['yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay', 'correct', 'confirm', 'go ahead', 'yes please', 'intent:affirm']);
const NO = new Set(['no', 'n', 'nope', 'nah', 'no thanks', 'not now', 'cancel', 'intent:deny']);

export const yesNoSlot: SlotValidator = {
  parse(text) {
    const clean = text.trim().toLowerCase();
    const norm = normalise(text);
    if (YES.has(clean) || YES.has(norm)) return { ok: true, value: true };
    if (NO.has(clean) || NO.has(norm)) return { ok: true, value: false };
    return { ok: false, error: 'Please answer yes or no.' };
  },
};

export function freeTextSlot(minLength: number, maxLength: number): SlotValidator {
  return {
    parse(text) {
      const trimmed = text.trim().replace(/\s+/g, ' ');
      if (trimmed.length < minLength) {
        return { ok: false, error: `Could you give me a bit more detail (at least ${minLength} characters)?` };
      }
      if (trimmed.length > maxLength) {
        return { ok: false, error: `That's a little long - please keep it under ${maxLength} characters.` };
      }
      return { ok: true, value: trimmed };
    },
  };
}

/**
 * Choice slot: accepts an option number ("2"), the option key/payload, or a
 * case-insensitive label match. Options are resolved at prompt time so the
 * same validator works for dynamic lists (plans, services).
 */
export function choiceSlot(options: () => Array<{ key: string; label: string; aliases?: string[] }>): SlotValidator {
  return {
    parse(text) {
      const list = options();
      const clean = normalise(text);
      const index = Number.parseInt(clean, 10);
      if (Number.isInteger(index) && String(index) === clean && index >= 1 && index <= list.length) {
        return { ok: true, value: list[index - 1].key };
      }
      const exact = list.find(
        (o) => o.key.toLowerCase() === text.trim().toLowerCase() || normalise(o.label) === clean || o.aliases?.some((a) => normalise(a) === clean),
      );
      if (exact) return { ok: true, value: exact.key };
      const partial = list.filter((o) => clean.length >= 3 && normalise(o.label).includes(clean));
      if (partial.length === 1) return { ok: true, value: partial[0].key };
      const labels = list.map((o, i) => `${i + 1}. ${o.label}`).join(', ');
      return { ok: false, error: `Please pick one of: ${labels}.` };
    },
  };
}

/** Speed slot in Mbps, constrained to the advertised fibre tiers. */
export function speedSlot(allowedMbps: number[]): SlotValidator {
  return {
    entity: 'SPEED',
    parse(text, entities) {
      const raw = entities.find((e) => e.type === 'SPEED')?.value ?? text.replace(/[^\d]/g, '');
      const mbps = Number.parseInt(raw, 10);
      if (Number.isInteger(mbps) && allowedMbps.includes(mbps)) return { ok: true, value: mbps };
      const tiers = allowedMbps.map((m) => (m >= 1000 ? `${m / 1000} Gbps` : `${m} Mbps`)).join(', ');
      return { ok: false, error: `We offer ${tiers}. Which would you like?` };
    },
  };
}

export const invoiceIdSlot: SlotValidator = {
  entity: 'INVOICE_ID',
  parse(text, entities) {
    const fromEntity = entities.find((e) => e.type === 'INVOICE_ID');
    if (fromEntity) return { ok: true, value: fromEntity.value };
    if (/^latest|^last|^most recent|^current/i.test(text.trim())) return { ok: true, value: 'LATEST' };
    return { ok: false, error: 'Please give the invoice number (e.g. INV-00123456) or say "latest".' };
  },
};
```

## apps/chatbot/src/dialog/stateMachine.test.ts

Application: Customer support chatbot. Stack: Node.js (Express, TypeScript). Language: typescript. Path: `apps/chatbot/src/dialog/stateMachine.test.ts`.

```typescript
import { silentLogger } from '../logger';
import { Conversation } from '../domain/types';
import { PlatformClients } from '../clients/platformClients';
import { postcodeSlot, yesNoSlot } from './slots';
import {
  END,
  FlowContext,
  FlowDefinition,
  FlowDefinitionError,
  interpretYesNo,
  prefillFromEntities,
  startFlow,
  stepFlow,
  validateFlow,
} from './stateMachine';
import { extractEntities } from '../nlu/entityExtractor';

const conversation: Conversation = {
  id: 'c1',
  principal: { userId: 'u1', accountId: 'ACC-00000001', roles: ['CONSUMER'] },
  channel: 'REST',
  status: 'ACTIVE',
  suspendedFlows: [],
  fallbackCount: 0,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function ctx(): FlowContext {
  return {
    conversation,
    principal: conversation.principal,
    slots: {},
    clients: {} as PlatformClients,
    request: { correlationId: 'corr' },
    logger: silentLogger,
    idempotencyKey: (p) => `c1:${p}`,
    scratch: {},
  };
}

const lookups: string[] = [];

const flow: FlowDefinition = {
  id: 'test',
  intent: 'CHECK_OUTAGE',
  label: 'test',
  initial: 'postcode',
  states: {
    postcode: { kind: 'slot', slot: 'postcode', validator: postcodeSlot, prompt: { text: 'Postcode?' }, next: 'lookup', maxRetries: 2 },
    lookup: {
      kind: 'action',
      run: async (c) => {
        lookups.push(String(c.slots.postcode));
        return { replies: [{ text: `Checked ${c.slots.postcode}` }], next: 'confirm' };
      },
    },
    confirm: { kind: 'confirm', prompt: { text: 'Anything else?' }, onYes: 'done', onNo: END },
    done: { kind: 'action', run: async () => ({ replies: [{ text: 'Great' }], next: END, outcome: 'resolved' }) },
  },
};

describe('stateMachine', () => {
  beforeEach(() => lookups.splice(0));

  it('validates transitions statically', () => {
    expect(() => validateFlow(flow)).not.toThrow();
    const broken: FlowDefinition = { ...flow, states: { ...flow.states, confirm: { kind: 'confirm', prompt: { text: '?' }, onYes: 'nowhere', onNo: END } } };
    expect(() => validateFlow(broken)).toThrow(FlowDefinitionError);
  });

  it('prompts for a missing slot, then runs actions after valid input', async () => {
    const first = await stepFlow(flow, startFlow(flow), ctx());
    expect(first.replies.map((r) => r.text)).toEqual(['Postcode?']);
    expect(first.flow?.state).toBe('postcode');

    const second = await stepFlow(flow, first.flow!, ctx(), { text: 'm1 1ae', entities: [] });
    expect(second.replies.map((r) => r.text)).toEqual(['Checked M1 1AE', 'Anything else?']);
    expect(second.flow?.state).toBe('confirm');

    const third = await stepFlow(flow, second.flow!, ctx(), { text: 'yes', entities: [] });
    expect(third.flow).toBeUndefined();
    expect(third.outcome).toBe('resolved');
  });

  it('re-asks on invalid input and abandons after max retries', async () => {
    const start = startFlow(flow);
    const bad1 = await stepFlow(flow, start, ctx(), { text: 'nowhere', entities: [] });
    expect(bad1.replies[0].text).toMatch(/valid UK postcode/);
    expect(bad1.flow?.retries).toBe(1);
    const bad2 = await stepFlow(flow, bad1.flow!, ctx(), { text: 'still nowhere', entities: [] });
    expect(bad2.abandoned).toBe(true);
    expect(bad2.flow).toBeUndefined();
  });

  it('skips slots that were pre-filled from entities', async () => {
    const prefill = prefillFromEntities(flow, extractEntities('outage at SW1A 1AA'));
    expect(prefill).toEqual({ postcode: 'SW1A 1AA' });
    const result = await stepFlow(flow, startFlow(flow, prefill), ctx());
    expect(lookups).toEqual(['SW1A 1AA']);
    expect(result.flow?.state).toBe('confirm');
  });

  it('ends the flow on a negative confirmation', async () => {
    const atConfirm = { ...startFlow(flow, { postcode: 'SW1A 1AA' }), state: 'confirm' };
    const result = await stepFlow(flow, atConfirm, ctx(), { text: 'no thanks', entities: [] });
    expect(result.flow).toBeUndefined();
    expect(result.replies).toEqual([]);
  });

  it('detects runaway cycles', async () => {
    const cyclic: FlowDefinition = {
      id: 'loop',
      intent: 'GREETING',
      label: 'loop',
      initial: 'a',
      states: { a: { kind: 'action', run: async () => ({ next: 'a' }) } },
    };
    await expect(stepFlow(cyclic, startFlow(cyclic), ctx())).rejects.toThrow(/exceeded/);
  });

  it('interprets yes/no variants including quick reply payloads', () => {
    expect(interpretYesNo('Yes.')).toBe(true);
    expect(interpretYesNo('intent:AFFIRM')).toBe(true);
    expect(interpretYesNo('nope')).toBe(false);
    expect(interpretYesNo('maybe')).toBeUndefined();
    expect(yesNoSlot.parse('no', [])).toEqual({ ok: true, value: false });
  });
});
```
