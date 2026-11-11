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
