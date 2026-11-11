'use strict';

const { ORDER_STATUS } = require('./constants');

/**
 * Builds the customer-facing tracking timeline for an order: the happy-path
 * milestones, which are done, which is current, and an estimated date for
 * the remaining ones.
 */

const MILESTONES = [
  { status: ORDER_STATUS.SUBMITTED, label: 'Order placed', etaDays: 0 },
  { status: ORDER_STATUS.VALIDATED, label: 'Order confirmed', etaDays: 1 },
  { status: ORDER_STATUS.PROVISIONING, label: 'Installation scheduled', etaDays: 2 },
  { status: ORDER_STATUS.ACTIVE, label: 'Service active', etaDays: 10 },
];

const TERMINAL_FAILURES = new Set([ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED]);

const DAY_MS = 24 * 3600 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * @param {object} order persisted order with statusHistory
 * @param {{estimatedInstallDays?: number|null}} [hints]
 * @returns {{ status: string, steps: Array<object>, closed: boolean, closedReason?: string }}
 */
function buildTimeline(order, hints = {}) {
  const history = order.statusHistory || [];
  const reachedAt = new Map(history.map((h) => [h.to, new Date(h.at)]));
  const submittedAt = reachedAt.get(ORDER_STATUS.SUBMITTED) || (order.submittedAt ? new Date(order.submittedAt) : null);
  const currentIndex = MILESTONES.findIndex((m) => m.status === order.status);

  // Index of the last milestone actually reached (handles CANCELLED/FAILED).
  let lastReached = -1;
  MILESTONES.forEach((m, i) => {
    if (reachedAt.has(m.status)) lastReached = i;
  });

  const installDays = hints.estimatedInstallDays ?? null;
  const steps = MILESTONES.map((milestone, index) => {
    const completedAt = reachedAt.get(milestone.status) || null;
    let state;
    if (completedAt && index < (currentIndex === -1 ? lastReached + 1 : currentIndex)) state = 'COMPLETE';
    else if (index === currentIndex) state = order.status === ORDER_STATUS.ACTIVE ? 'COMPLETE' : 'CURRENT';
    else if (completedAt) state = 'COMPLETE';
    else state = TERMINAL_FAILURES.has(order.status) ? 'SKIPPED' : 'UPCOMING';

    let estimatedAt = null;
    if (state === 'UPCOMING' && submittedAt) {
      if (milestone.status === ORDER_STATUS.ACTIVE && order.installAppointment) {
        estimatedAt = new Date(order.installAppointment);
      } else if (milestone.status === ORDER_STATUS.ACTIVE && installDays != null) {
        estimatedAt = addDays(submittedAt, installDays);
      } else {
        estimatedAt = addDays(submittedAt, milestone.etaDays);
      }
    }
    return {
      status: milestone.status,
      label: milestone.label,
      state,
      completedAt: completedAt ? completedAt.toISOString() : null,
      estimatedAt: estimatedAt ? estimatedAt.toISOString() : null,
    };
  });

  const closed = TERMINAL_FAILURES.has(order.status);
  return {
    status: order.status,
    steps,
    closed,
    ...(closed ? { closedReason: order.cancellationReason || order.failureReason || null } : {}),
    installAppointment: order.installAppointment ? new Date(order.installAppointment).toISOString() : null,
  };
}

/** Whether the customer may still self-cancel. */
function isSelfCancellable(order) {
  return [ORDER_STATUS.DRAFT, ORDER_STATUS.SUBMITTED, ORDER_STATUS.VALIDATED].includes(order.status);
}

module.exports = { buildTimeline, isSelfCancellable, MILESTONES };
