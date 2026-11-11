import { AnalyticsProps } from './types';

/**
 * PII guards applied before anything reaches a third-party analytics vendor:
 * sensitive keys are dropped, sensitive values are redacted, identifiers are
 * replaced with salted SHA-256 hashes, and DOM elements holding personal data
 * are tagged so session replay masks or excludes them.
 */

const SENSITIVE_KEY = /(e-?mail|phone|mobile|name|address|postcode|zip|password|token|secret|iban|card|sort.?code|dob|birth)/i;

// Applied in order: email, 13-19 digit numbers (cards), UK phone, UK postcode, Uniti ids.
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[EMAIL]'],
  [/\b(?:\d[ -]?){12,18}\d\b/g, '[NUMBER]'],
  [/(?:\+44\s?|\b0)(?:\d[\s-]?){9,10}\b/g, '[PHONE]'],
  [/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/gi, '[POSTCODE]'],
  [/\b(?:ACC|INV|TKT|ORD)-\d{6,10}\b/gi, '[ID]'],
];

export function redactValue(value: string): string {
  let text = value;
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function sanitizeProps(props: AnalyticsProps): AnalyticsProps {
  const clean: AnalyticsProps = {};
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key) || value === undefined) continue;
    clean[key] = typeof value === 'string' ? redactValue(value).slice(0, 255) : value;
  }
  return clean;
}

export async function hashIdentifier(value: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${value}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Elements that always hold personal data in Uniti portals. */
export const DEFAULT_PII_SELECTORS = [
  '[data-pii]',
  'input[type="email"]',
  'input[type="tel"]',
  'input[type="password"]',
  'input[autocomplete^="cc-"]',
  '[data-account-number]',
];

/**
 * Applies a marker to every element matching the selectors now and as the DOM
 * changes (portals render asynchronously). Returns a disconnect function.
 */
export function observeMarking(root: ParentNode & Node, selectors: string[], mark: (el: Element) => void): () => void {
  const selector = selectors.join(',');
  if (!selector) return () => undefined;
  const apply = (scope: ParentNode) => scope.querySelectorAll(selector).forEach(mark);
  apply(root);
  if (typeof MutationObserver === 'undefined') return () => undefined;
  const markAdded = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches(selector)) mark(node);
    apply(node);
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(markAdded);
    }
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
