'use strict';

const { format } = require('../domain/money');
const { formatAddress } = require('../domain/address');

/**
 * Transactional email templates. Each template returns `{ subject, text, html }`.
 * HTML is intentionally simple: the email provider wraps it in the branded
 * layout configured per sender domain.
 */

const BRAND = {
  CONSUMER: 'GoKinetic',
  BUSINESS: 'Business GoKinetic',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const usd = (amount, currency = 'USD') => format({ amount, currency });

function itemsTable(items) {
  const rows = items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td>${i.quantity}</td><td>${usd(i.unitMonthly * i.quantity)}/mo</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Item</th><th>Qty</th><th>Monthly</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const templates = {
  ORDER_CONFIRMATION: ({ order }) => {
    const brand = BRAND[order.segment] || BRAND.CONSUMER;
    const subject = `${brand} order ${order.orderNumber} received`;
    const text = [
      `Hi ${order.contact.firstName},`,
      `Thanks for your order ${order.orderNumber}.`,
      `Service address: ${formatAddress(order.serviceAddress)}`,
      `Due today: ${usd(order.dueToday)}`,
      `Monthly: ${usd(order.monthlyRecurring)}`,
      'We will email you again once your installation is scheduled.',
    ].join('\n');
    const html = `<p>Hi ${escapeHtml(order.contact.firstName)},</p>
<p>Thanks for your order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
<p>Service address: ${escapeHtml(formatAddress(order.serviceAddress))}</p>
${itemsTable(order.items)}
<p>Due today: <strong>${usd(order.dueToday)}</strong><br/>Monthly: <strong>${usd(order.monthlyRecurring)}</strong></p>`;
    return { subject, text, html };
  },

  ORDER_STATUS_CHANGED: ({ order, status }) => {
    const brand = BRAND[order.segment] || BRAND.CONSUMER;
    const labels = {
      VALIDATED: 'has been confirmed',
      PROVISIONING: 'is being set up - your installation is scheduled',
      ACTIVE: 'is now active. Welcome to fibre!',
      CANCELLED: 'has been cancelled',
      FAILED: 'could not be completed',
    };
    const phrase = labels[status] || `is now ${status.toLowerCase()}`;
    const subject = `${brand} order ${order.orderNumber} ${status === 'ACTIVE' ? 'is live' : 'update'}`;
    const appointment = order.installAppointment
      ? `Installation: ${new Date(order.installAppointment).toUTCString()}`
      : '';
    const text = [`Hi ${order.contact.firstName},`, `Your order ${order.orderNumber} ${phrase}.`, appointment]
      .filter(Boolean)
      .join('\n');
    const html = `<p>Hi ${escapeHtml(order.contact.firstName)},</p><p>Your order <strong>${escapeHtml(
      order.orderNumber,
    )}</strong> ${escapeHtml(phrase)}.</p>${appointment ? `<p>${escapeHtml(appointment)}</p>` : ''}`;
    return { subject, text, html };
  },

  ABANDONED_CART: ({ firstName, cart, resumeUrl }) => {
    const brand = BRAND[cart.segment] || BRAND.CONSUMER;
    const subject = `Your ${brand} cart is waiting`;
    const names = cart.items.map((i) => i.name).join(', ');
    const text = `Hi ${firstName},\nYou left ${names} in your cart. Pick up where you left off: ${resumeUrl}`;
    const html = `<p>Hi ${escapeHtml(firstName)},</p><p>You left ${escapeHtml(names)} in your cart.</p><p><a href="${escapeHtml(
      resumeUrl,
    )}">Resume checkout</a></p>`;
    return { subject, text, html };
  },

  QUOTE_SENT: ({ quote, viewUrl }) => {
    const subject = `Business GoKinetic quote ${quote.quoteNumber}`;
    const monthly = quote.pricing ? usd(quote.pricing.recurring.total) : 'n/a';
    const validUntil = quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : 'n/a';
    const text = `Your quote ${quote.quoteNumber} for ${quote.sites.length} site(s) is ready.\nMonthly: ${monthly}\nValid until: ${validUntil}\n${viewUrl}`;
    const html = `<p>Your quote <strong>${escapeHtml(quote.quoteNumber)}</strong> for ${quote.sites.length} site(s) is ready.</p>
<p>Monthly: <strong>${monthly}</strong><br/>Valid until: ${validUntil}</p><p><a href="${escapeHtml(viewUrl)}">Review and accept</a></p>`;
    return { subject, text, html };
  },

  QUOTE_EXPIRED: ({ quote }) => {
    const subject = `Business GoKinetic quote ${quote.quoteNumber} has expired`;
    const text = `Quote ${quote.quoteNumber} expired. Reply to this email or request a new quote online.`;
    return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
  },

  USER_INVITED: ({ inviter, accountName, activationUrl }) => {
    const subject = `You've been invited to ${accountName} on Business GoKinetic`;
    const text = `${inviter} invited you to manage ${accountName}. Activate your login: ${activationUrl}`;
    const html = `<p>${escapeHtml(inviter)} invited you to manage <strong>${escapeHtml(accountName)}</strong>.</p><p><a href="${escapeHtml(
      activationUrl,
    )}">Activate your login</a></p>`;
    return { subject, text, html };
  },
};

/**
 * @param {keyof templates} name
 * @param {object} data
 */
function render(name, data) {
  const template = templates[name];
  if (!template) throw new RangeError(`Unknown email template ${name}`);
  return template(data);
}

module.exports = { render, escapeHtml, TEMPLATE_NAMES: Object.keys(templates) };
