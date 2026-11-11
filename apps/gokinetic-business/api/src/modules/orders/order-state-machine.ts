import { InvalidStateTransitionError } from '../../lib/errors';
import { OrderStatus } from './orders.types';

/**
 * Order lifecycle: DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE,
 * with CANCELLED available to the customer until provisioning starts and FAILED
 * set by validation (rejection) or provisioning.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['VALIDATED', 'CANCELLED', 'FAILED'],
  VALIDATED: ['PROVISIONING', 'CANCELLED'],
  PROVISIONING: ['ACTIVE', 'FAILED'],
  ACTIVE: [],
  CANCELLED: [],
  FAILED: []
};

export type TransitionActor = 'customer' | 'approver' | 'fulfilment';

/** Which actor class is allowed to drive each target state. */
const ACTOR_FOR_TARGET: Readonly<Record<OrderStatus, readonly TransitionActor[]>> = {
  DRAFT: [],
  SUBMITTED: ['customer'],
  VALIDATED: ['approver', 'fulfilment'],
  PROVISIONING: ['fulfilment'],
  ACTIVE: ['fulfilment'],
  CANCELLED: ['customer', 'approver'],
  FAILED: ['approver', 'fulfilment']
};

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus, actor?: TransitionActor): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  return actor === undefined || ACTOR_FOR_TARGET[to].includes(actor);
}

export function assertTransition(from: OrderStatus, to: OrderStatus, actor?: TransitionActor): void {
  if (!canTransition(from, to, actor)) {
    throw new InvalidStateTransitionError('Order', from, to);
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isCancellable(status: OrderStatus): boolean {
  return TRANSITIONS[status].includes('CANCELLED');
}
