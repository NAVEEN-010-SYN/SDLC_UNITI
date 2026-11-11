import { Router } from 'express';
import request from 'supertest';
import { createApp } from './app';
import { TokenVerifier } from './auth/jwt';
import { UnauthorizedError } from './lib/errors';
import { requirePermission } from './middleware/auth';
import { adminCtx, userCtx } from './test/fixtures';

const ORIGIN = 'https://business.example-uniti.net';

function build(ready: () => Promise<void> = async () => undefined) {
  const verifier: TokenVerifier = {
    verify: (token) => {
      if (token === 'admin') return adminCtx();
      if (token === 'user') return userCtx();
      throw new UnauthorizedError('Access token is invalid');
    }
  };
  const probe = Router();
  probe.get('/probe', requirePermission('users:manage'), (req, res) => {
    res.json({ accountId: req.auth?.accountId });
  });
  return createApp({ config: { corsAllowedOrigins: [ORIGIN], env: 'test' }, verifier, health: { ready }, routers: [probe] });
}

describe('createApp', () => {
  it('serves liveness and readiness', async () => {
    await request(build()).get('/health/live').expect(200, { status: 'ok' });
    await request(build(async () => Promise.reject(new Error('db down')))).get('/health/ready').expect(503);
  });

  it('returns problem+json with the correlation id for missing tokens', async () => {
    const res = await request(build()).get('/api/v1/probe').set('X-Correlation-Id', 'test-corr-0001').expect(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.headers['x-correlation-id']).toBe('test-corr-0001');
    expect(res.body).toMatchObject({ status: 401, correlationId: 'test-corr-0001', instance: '/api/v1/probe' });
  });

  it('enforces permissions server-side', async () => {
    await request(build()).get('/api/v1/probe').set('Authorization', 'Bearer user').expect(403);
    const res = await request(build()).get('/api/v1/probe').set('Authorization', 'Bearer admin').expect(200);
    expect(res.body.accountId).toBe(adminCtx().accountId);
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await request(build())
      .options('/api/v1/probe')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-headers']).toContain('X-Correlation-Id');

    await request(build())
      .options('/api/v1/probe')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')
      .expect(403);
  });

  it('maps malformed JSON bodies to a 400 problem', async () => {
    const res = await request(build())
      .post('/api/v1/probe')
      .set('Authorization', 'Bearer admin')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
    expect(res.body.title).toBe('Malformed request body');
  });
});
