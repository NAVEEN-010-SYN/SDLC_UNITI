'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/**
 * Thin HTTP adapters over authService/accountService. The refresh token is
 * returned in the body (the SPA keeps it in memory + sessionStorage); the
 * user agent is recorded on the session for the "active sessions" audit.
 */
function createAuthController({ authService, accountService }) {
  const agent = (req) => (req.get('User-Agent') || '').slice(0, 200);

  return {
    register: asyncHandler(async (req, res) => {
      const result = await authService.register(req.body, { userAgent: agent(req) });
      res.status(201).json(result);
    }),

    login: asyncHandler(async (req, res) => {
      res.json(await authService.login(req.body, { userAgent: agent(req) }));
    }),

    refresh: asyncHandler(async (req, res) => {
      res.json(await authService.refresh(req.body.refreshToken, { userAgent: agent(req) }));
    }),

    logout: asyncHandler(async (req, res) => {
      await authService.logout(req.body.refreshToken);
      res.status(204).end();
    }),

    me: asyncHandler(async (req, res) => {
      res.json(await accountService.getOverview(req.user));
    }),

    changePassword: asyncHandler(async (req, res) => {
      await authService.changePassword(req.user.id, req.body);
      res.status(204).end();
    }),

    activateInvite: asyncHandler(async (req, res) => {
      res.json(await accountService.activateInvite(req.body));
    }),
  };
}

module.exports = { createAuthController };
