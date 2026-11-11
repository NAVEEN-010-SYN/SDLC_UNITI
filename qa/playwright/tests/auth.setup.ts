import * as fs from 'fs';
import * as path from 'path';
import { test as setup, expect } from '@playwright/test';
import { credentialsFor } from '../src/config/env';
import { PortalKey, portals } from '../src/config/portals';
import { LoginPage } from '../src/pages/LoginPage';

/**
 * Signs each portal's default persona in once and saves storage state so the
 * portal project can reuse the session. The portal comes from the setup
 * project's metadata. A cached state younger than 30 minutes is reused.
 */
const MAX_STATE_AGE_MS = 30 * 60 * 1000;

setup('authenticate default persona', async ({ page }, testInfo) => {
  const portalKey = testInfo.project.metadata.portal as PortalKey;
  const portal = portals[portalKey];
  expect(portal, `unknown portal "${portalKey}" in project metadata`).toBeDefined();

  if (fs.existsSync(portal.storageState)) {
    const age = Date.now() - fs.statSync(portal.storageState).mtimeMs;
    if (age < MAX_STATE_AGE_MS) {
      setup.skip(true, `reusing ${path.basename(portal.storageState)} (${Math.round(age / 1000)}s old)`);
    }
  }

  const login = new LoginPage(page, portal);
  await login.signInAndLand(credentialsFor(portal.defaultRole));

  const me = await page.request.get('/api/v1/me');
  expect(me.ok(), 'profile endpoint after sign-in').toBeTruthy();
  const profile = (await me.json()) as { roles: string[] };
  expect(profile.roles).toContain(portal.defaultRole);

  fs.mkdirSync(path.dirname(portal.storageState), { recursive: true });
  await page.context().storageState({ path: portal.storageState });
});
