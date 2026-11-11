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
      const summary = status.summary ? ` ${status.summary}.` : '';
      return `Yes - there's a known outage affecting ${status.region} (${status.postcode}).${summary}${eta} Our engineers are working on it.`;
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
