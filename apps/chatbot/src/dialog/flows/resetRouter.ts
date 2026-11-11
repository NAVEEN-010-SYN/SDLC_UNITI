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
