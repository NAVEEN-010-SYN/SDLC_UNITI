import { expect, Locator, Page, Response } from '@playwright/test';

/**
 * Behaviour common to every portal page: navigation with a ready signal,
 * toast handling, and access to the shared problem+json error banner that all
 * portals render when an API call fails.
 */
export abstract class BasePage {
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  get toast(): Locator {
    return this.page.getByRole('status').filter({ has: this.page.getByTestId('toast-message') });
  }

  get errorBanner(): Locator {
    return this.page.getByTestId('problem-banner');
  }

  get mainHeading(): Locator {
    return this.page.getByRole('main').getByRole('heading', { level: 1 });
  }

  get spinner(): Locator {
    return this.page.getByTestId('page-loading');
  }

  async goto(query?: Record<string, string>): Promise<this> {
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    await this.page.goto(`${this.path}${search}`);
    await this.waitUntilReady();
    return this;
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.spinner).toBeHidden();
    await expect(this.mainHeading).toBeVisible();
  }

  async expectToast(text: string | RegExp): Promise<void> {
    await expect(this.toast).toContainText(text);
  }

  async expectProblem(title: string | RegExp): Promise<void> {
    await expect(this.errorBanner).toBeVisible();
    await expect(this.errorBanner.getByTestId('problem-title')).toHaveText(title);
  }

  /**
   * Correlation id shown in the error banner so support can trace the failure.
   * Specs attach it to the report on failure.
   */
  async problemCorrelationId(): Promise<string | null> {
    const ref = this.errorBanner.getByTestId('problem-correlation-id');
    return (await ref.count()) > 0 ? ref.textContent() : null;
  }

  protected waitForApi(method: string, urlPart: string | RegExp): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === method &&
        (typeof urlPart === 'string' ? response.url().includes(urlPart) : urlPart.test(response.url())),
    );
  }

  protected tableRows(table: Locator): Locator {
    return table.getByRole('row').filter({ hasNot: this.page.getByRole('columnheader') });
  }
}
