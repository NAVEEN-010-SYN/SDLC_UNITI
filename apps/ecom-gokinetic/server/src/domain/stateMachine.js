'use strict';

const { InvalidStateTransitionError } = require('../errors');
const { ORDER_STATUS, QUOTE_STATUS } = require('./constants');

/**
 * Small declarative finite-state machine.
 *
 * `transitions` maps each state to the states it may move to. Guards are
 * evaluated with the entity and context and may veto a transition by
 * returning a string reason.
 */
function createStateMachine({ entity, transitions, terminal = [], guards = {} }) {
  const states = new Set(Object.keys(transitions));

  function allowedTargets(from) {
    return transitions[from] || [];
  }

  function canTransition(from, to) {
    return allowedTargets(from).includes(to);
  }

  /**
   * Validates a transition and returns a history entry to append.
   * @param {object} record entity with a `status` field
   * @param {string} to target state
   * @param {{actor?: string, reason?: string, at?: Date}} [context]
   */
  function transition(record, to, context = {}) {
    const from = record.status;
    if (!states.has(to)) {
      throw new RangeError(`Unknown ${entity} state ${to}`);
    }
    if (!canTransition(from, to)) {
      throw new InvalidStateTransitionError(entity, from, to);
    }
    const guard = guards[`${from}->${to}`] || guards[`*->${to}`];
    if (guard) {
      const veto = guard(record, context);
      if (veto) {
        const err = new InvalidStateTransitionError(entity, from, to);
        err.detail = `${err.detail} ${veto}`;
        err.message = err.detail;
        throw err;
      }
    }
    return {
      from,
      to,
      at: (context.at || new Date()).toISOString(),
      actor: context.actor || 'system',
      reason: context.reason || null,
    };
  }

  function isTerminal(state) {
    return terminal.includes(state);
  }

  return { entity, states: [...states], allowedTargets, canTransition, transition, isTerminal };
}

/**
 * Order lifecycle: DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE,
 * with CANCELLED / FAILED exits. Cancellation is not allowed once provisioning
 * has started; those must go through a support ticket.
 */
const orderStateMachine = createStateMachine({
  entity: 'Order',
  transitions: {
    [ORDER_STATUS.DRAFT]: [ORDER_STATUS.SUBMITTED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SUBMITTED]: [ORDER_STATUS.VALIDATED, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
    [ORDER_STATUS.VALIDATED]: [ORDER_STATUS.PROVISIONING, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
    [ORDER_STATUS.PROVISIONING]: [ORDER_STATUS.ACTIVE, ORDER_STATUS.FAILED],
    [ORDER_STATUS.ACTIVE]: [],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.FAILED]: [],
  },
  terminal: [ORDER_STATUS.ACTIVE, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
  guards: {
    [`${ORDER_STATUS.DRAFT}->${ORDER_STATUS.SUBMITTED}`]: (order) =>
      !order.items || order.items.length === 0 ? 'Order has no items.' : null,
    [`*->${ORDER_STATUS.FAILED}`]: (_order, ctx) =>
      !ctx.reason ? 'A failure reason is required.' : null,
  },
});

/**
 * B2B quote lifecycle. Quotes whose negotiated discount exceeds the approval
 * threshold must pass through PENDING_APPROVAL before being sent.
 */
const quoteStateMachine = createStateMachine({
  entity: 'Quote',
  transitions: {
    [QUOTE_STATUS.REQUESTED]: [QUOTE_STATUS.PRICED, QUOTE_STATUS.REJECTED],
    [QUOTE_STATUS.PRICED]: [
      QUOTE_STATUS.PRICED,
      QUOTE_STATUS.PENDING_APPROVAL,
      QUOTE_STATUS.SENT,
      QUOTE_STATUS.REJECTED,
    ],
    [QUOTE_STATUS.PENDING_APPROVAL]: [QUOTE_STATUS.SENT, QUOTE_STATUS.PRICED, QUOTE_STATUS.REJECTED],
    [QUOTE_STATUS.SENT]: [QUOTE_STATUS.ACCEPTED, QUOTE_STATUS.REJECTED, QUOTE_STATUS.EXPIRED],
    [QUOTE_STATUS.ACCEPTED]: [QUOTE_STATUS.CONVERTED, QUOTE_STATUS.EXPIRED],
    [QUOTE_STATUS.REJECTED]: [],
    [QUOTE_STATUS.EXPIRED]: [],
    [QUOTE_STATUS.CONVERTED]: [],
  },
  terminal: [QUOTE_STATUS.REJECTED, QUOTE_STATUS.EXPIRED, QUOTE_STATUS.CONVERTED],
  guards: {
    [`${QUOTE_STATUS.PRICED}->${QUOTE_STATUS.SENT}`]: (quote, ctx) =>
      quote.requiresApproval && !ctx.approved ? 'Quote discount requires approval before sending.' : null,
    [`${QUOTE_STATUS.SENT}->${QUOTE_STATUS.ACCEPTED}`]: (quote, ctx) => {
      const now = ctx.at || new Date();
      return quote.validUntil && new Date(quote.validUntil) < now ? 'Quote has expired.' : null;
    },
  },
});

module.exports = { createStateMachine, orderStateMachine, quoteStateMachine };
