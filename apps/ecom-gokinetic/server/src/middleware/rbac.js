'use strict';

const { ForbiddenError, UnauthorizedError } = require('../errors');
const { ROLES } = require('../domain/constants');

/**
 * Permission matrix. Routes ask for a permission, never a raw role, so the
 * mapping can evolve without touching controllers.
 */
const PERMISSIONS = Object.freeze({
  'catalog:manage': [ROLES.SUPPORT_AGENT],
  'promo:manage': [ROLES.SUPPORT_AGENT],
  'order:place': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'order:read:own': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'order:read:any': [ROLES.SUPPORT_AGENT],
  'order:cancel:own': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN],
  'order:advance': [ROLES.SUPPORT_AGENT],
  'quote:request': [ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'quote:read:own': [ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'quote:accept': [ROLES.BUSINESS_ADMIN],
  'quote:price': [ROLES.SUPPORT_AGENT],
  'quote:approve': [ROLES.SUPPORT_AGENT],
  'quote:read:any': [ROLES.SUPPORT_AGENT],
  'account:manage-users': [ROLES.BUSINESS_ADMIN],
  'account:read': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
});

/**
 * @param {{roles: string[]}} principal
 * @param {string} permission
 */
function hasPermission(principal, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission ${permission}`);
  return Boolean(principal && principal.roles.some((role) => allowed.includes(role)));
}

/**
 * Middleware requiring at least one of the given permissions.
 * @param {...string} permissions
 */
function requirePermission(...permissions) {
  permissions.forEach((p) => {
    if (!PERMISSIONS[p]) throw new Error(`Unknown permission ${p}`);
  });
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (permissions.some((p) => hasPermission(req.user, p))) return next();
    return next(new ForbiddenError(`Requires permission: ${permissions.join(' or ')}.`));
  };
}

/**
 * Asserts the principal may access a resource owned by `accountId`: either it
 * belongs to their own account or they hold the `any` permission.
 * @returns {boolean}
 */
function canAccessAccountResource(principal, accountId, anyPermission) {
  if (!principal) return false;
  if (principal.accountId && principal.accountId === accountId) return true;
  return anyPermission ? hasPermission(principal, anyPermission) : false;
}

module.exports = { PERMISSIONS, hasPermission, requirePermission, canAccessAccountResource };
