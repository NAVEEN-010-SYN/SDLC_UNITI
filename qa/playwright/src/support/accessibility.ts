import AxeBuilder from '@axe-core/playwright';
import { expect, Page, TestInfo } from '@playwright/test';
import type { Result } from 'axe-core';

export interface A11yOptions {
  /** CSS selectors excluded from the scan, e.g. third-party widgets we do not own. */
  exclude?: string[];
  /** Rule ids temporarily disabled; each must reference a tracked defect. */
  disabledRules?: Array<{ id: string; ticket: string }>;
  /** Minimum impact that fails the test. */
  failOn?: Array<NonNullable<Result['impact']>>;
}

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Third-party embeds owned by vendors; scanned separately in their own contracts. */
const GLOBAL_EXCLUDES = ['#fs-root', '[data-clarity-region]', 'iframe[title="Secure card payment input frame"]'];

/**
 * Runs axe-core against the current page (WCAG 2.2 AA) and attaches the full
 * report to the test. Only violations at or above the configured impact fail.
 */
export async function expectAccessible(page: Page, testInfo: TestInfo, options: A11yOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(DEFAULT_TAGS);
  for (const selector of [...GLOBAL_EXCLUDES, ...(options.exclude ?? [])]) {
    builder = builder.exclude(selector);
  }
  if (options.disabledRules?.length) {
    builder = builder.disableRules(options.disabledRules.map((rule) => rule.id));
  }

  const results = await builder.analyze();
  await testInfo.attach('axe-results', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });

  const failOn = options.failOn ?? ['serious', 'critical'];
  const blocking = results.violations.filter((violation) => violation.impact && failOn.includes(violation.impact));
  expect(blocking.map(summarise), `Accessibility violations on ${page.url()}`).toEqual([]);
}

function summarise(violation: Result): string {
  const targets = violation.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .join(' | ');
  return `[${violation.impact}] ${violation.id}: ${violation.help} -> ${targets}`;
}

/**
 * Tabs through the page and asserts every focused element shows a visible
 * focus indicator (outline or box-shadow), covering WCAG 2.4.7.
 */
export async function expectVisibleFocusOrder(page: Page, steps: number): Promise<string[]> {
  const visited: string[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) {
        return null;
      }
      const style = window.getComputedStyle(el);
      const hasIndicator =
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
      return { name, hasIndicator };
    });
    if (!info) {
      continue;
    }
    expect(info.hasIndicator, `Focus indicator missing on "${info.name}"`).toBe(true);
    visited.push(info.name);
  }
  return visited;
}
