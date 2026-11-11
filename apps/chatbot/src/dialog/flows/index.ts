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
