import { ContentDocument, HelpArticleDocument, PlanCopyDocument, PromoBannerDocument } from './document';

export interface ValidationIssue {
  field: string;
  message: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLAN_CODE = /^[A-Z0-9_]{3,40}$/;
const CURRENCY = /^[A-Z]{3}$/;
const ALLOWED_CTA_HOSTS = [/^([a-z0-9-]+\.)*uniti\.example$/];

/**
 * Publishing guard-rails. Editors can save drafts freely in Contentful, but
 * a published entry that would render badly or mislead customers (missing
 * price, banner linking off-site, ends before it starts) is held back from
 * the index and reported instead.
 */
export function validateDocument(doc: ContentDocument): ValidationIssue[] {
  switch (doc.kind) {
    case 'helpArticle':
      return validateArticle(doc);
    case 'planCopy':
      return validatePlan(doc);
    case 'promoBanner':
      return validateBanner(doc);
  }
}

function validateArticle(doc: HelpArticleDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(issues, 'title', doc.title, 120);
  requireText(issues, 'summary', doc.summary, 300);
  if (!SLUG.test(doc.slug) || doc.slug.length > 100) issues.push({ field: 'slug', message: 'Slug must be lower-case words separated by hyphens.' });
  if (doc.body.length < 40) issues.push({ field: 'body', message: 'Article body is too short to be useful.' });
  if (doc.topics.length === 0) issues.push({ field: 'topics', message: 'At least one topic is required for navigation.' });
  return issues;
}

function validatePlan(doc: PlanCopyDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!PLAN_CODE.test(doc.planCode)) issues.push({ field: 'planCode', message: 'Plan code must match the catalogue (A-Z, 0-9, _).' });
  requireText(issues, 'headline', doc.headline, 80);
  requireText(issues, 'tagline', doc.tagline, 160);
  if (!Number.isInteger(doc.downMbps) || doc.downMbps <= 0) issues.push({ field: 'downMbps', message: 'Download speed must be a positive whole number.' });
  if (!Number.isInteger(doc.upMbps) || doc.upMbps <= 0) issues.push({ field: 'upMbps', message: 'Upload speed must be a positive whole number.' });
  if (Number.isInteger(doc.upMbps) && Number.isInteger(doc.downMbps) && doc.upMbps > doc.downMbps) {
    issues.push({ field: 'upMbps', message: 'Upload speed cannot exceed download speed.' });
  }
  if (!Number.isInteger(doc.monthlyPrice.amountMinor) || doc.monthlyPrice.amountMinor <= 0) {
    issues.push({ field: 'monthlyPrice', message: 'Monthly price must be a positive amount such as 49.99.' });
  }
  if (!CURRENCY.test(doc.monthlyPrice.currency)) issues.push({ field: 'currency', message: 'Currency must be an ISO 4217 code.' });
  if (doc.promoPrice) {
    if (doc.promoPrice.amountMinor >= doc.monthlyPrice.amountMinor) {
      issues.push({ field: 'promoPrice', message: 'Promotional price must be lower than the regular price.' });
    }
    if (doc.promoPrice.months < 1 || doc.promoPrice.months > 24) {
      issues.push({ field: 'promoMonths', message: 'Promotion length must be 1 to 24 months.' });
    }
  }
  if (doc.features.length > 8) issues.push({ field: 'features', message: 'Show at most 8 feature bullets.' });
  return issues;
}

function validateBanner(doc: PromoBannerDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  requireText(issues, 'message', doc.message, 140);
  if (!doc.startsAt) issues.push({ field: 'startsAt', message: 'Start date is required.' });
  if (doc.startsAt && doc.endsAt && doc.endsAt <= doc.startsAt) issues.push({ field: 'endsAt', message: 'Banner must end after it starts.' });
  if ((doc.ctaLabel === null) !== (doc.ctaUrl === null)) {
    issues.push({ field: 'ctaUrl', message: 'Call to action needs both a label and a URL.' });
  }
  if (doc.ctaUrl !== null && !isAllowedCtaUrl(doc.ctaUrl)) {
    issues.push({ field: 'ctaUrl', message: 'Call to action must be an https link to a Uniti site.' });
  }
  return issues;
}

export function isAllowedCtaUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ALLOWED_CTA_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
}

function requireText(issues: ValidationIssue[], field: string, value: string, max: number): void {
  if (!value) issues.push({ field, message: 'Required.' });
  else if (value.length > max) issues.push({ field, message: `Must be at most ${max} characters.` });
}
