import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';
import { portals } from './src/config/portals';

/**
 * One Playwright project per portal. Each portal project depends on a matching
 * "setup" project that signs in once and persists storage state, so specs start
 * authenticated. Specs tagged @unauth opt out by clearing storage state locally.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  outputDir: './reports/artifacts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: env.retries,
  workers: env.workers,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
  ],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
    locale: 'en-US',
    timezoneId: 'UTC',
    extraHTTPHeaders: { 'X-Test-Run': `pw-${env.name}` },
  },
  projects: [
    {
      name: 'setup-ecom',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.ecom.baseURL },
      metadata: { portal: 'ecom' },
    },
    {
      name: 'setup-uconnect',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.uconnect.baseURL },
      metadata: { portal: 'uconnect' },
    },
    {
      name: 'setup-partner',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.partner.baseURL },
      metadata: { portal: 'partner' },
    },
    {
      name: 'setup-sdwan',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.sdwan.baseURL },
      metadata: { portal: 'sdwan' },
    },
    {
      name: 'ecom-chromium',
      testDir: './tests/ecom',
      dependencies: ['setup-ecom'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.ecom.baseURL, storageState: portals.ecom.storageState },
    },
    {
      name: 'ecom-mobile-safari',
      testDir: './tests/ecom',
      grep: /@smoke/,
      dependencies: ['setup-ecom'],
      use: { ...devices['iPhone 14'], baseURL: portals.ecom.baseURL, storageState: portals.ecom.storageState },
    },
    {
      name: 'uconnect-chromium',
      testDir: './tests/uconnect',
      dependencies: ['setup-uconnect'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.uconnect.baseURL, storageState: portals.uconnect.storageState },
    },
    {
      name: 'uconnect-firefox',
      testDir: './tests/uconnect',
      grep: /@smoke/,
      dependencies: ['setup-uconnect'],
      use: { ...devices['Desktop Firefox'], baseURL: portals.uconnect.baseURL, storageState: portals.uconnect.storageState },
    },
    {
      name: 'partner-chromium',
      testDir: './tests/partner',
      dependencies: ['setup-partner'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.partner.baseURL, storageState: portals.partner.storageState },
    },
    {
      name: 'sdwan-chromium',
      testDir: './tests/sdwan',
      dependencies: ['setup-sdwan'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.sdwan.baseURL, storageState: portals.sdwan.storageState },
    },
    {
      name: 'a11y',
      testDir: './tests/a11y',
      dependencies: ['setup-ecom', 'setup-uconnect', 'setup-partner'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: env.urls.api },
    },
  ],
});
