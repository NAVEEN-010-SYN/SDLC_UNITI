import { expect, Locator, Page } from '@playwright/test';
import { Credentials } from '@config/env';
import { PortalDefinition } from '@config/portals';

/**
 * All portals delegate sign-in to the shared OIDC hosted login page, so a single
 * page object covers them. The portal definition supplies the entry path and
 * the landing page that proves the session was established.
 */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly mfaCode: Locator;
  readonly verify: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page, private readonly portal: PortalDefinition) {
    this.username = page.getByLabel('Email address');
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.mfaCode = page.getByLabel('Verification code');
    this.verify = page.getByRole('button', { name: 'Verify' });
    this.error = page.getByRole('alert');
  }

  async open(): Promise<void> {
    await this.page.goto(this.portal.loginPath);
    await expect(this.username).toBeVisible();
  }

  async signIn(credentials: Credentials, mfaCode?: string): Promise<void> {
    await this.username.fill(credentials.username);
    await this.password.fill(credentials.password);
    await this.submit.click();
    if (mfaCode) {
      await expect(this.mfaCode).toBeVisible();
      await this.mfaCode.fill(mfaCode);
      await this.verify.click();
    }
  }

  async signInAndLand(credentials: Credentials, mfaCode?: string): Promise<void> {
    await this.open();
    await this.signIn(credentials, mfaCode);
    await this.page.waitForURL((url) => url.pathname.startsWith(this.portal.landingPath), { timeout: 30_000 });
  }

  async expectRejected(message: string | RegExp = /incorrect email or password/i): Promise<void> {
    await expect(this.error).toContainText(message);
    await expect(this.page).toHaveURL(new RegExp(this.portal.loginPath.replace('/', '\\/')));
  }

  async signOut(): Promise<void> {
    await this.page.getByRole('button', { name: 'Account menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(this.username).toBeVisible();
  }
}
