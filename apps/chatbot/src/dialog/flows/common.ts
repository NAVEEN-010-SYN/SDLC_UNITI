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
