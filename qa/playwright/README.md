# Playwright E2E suite

TypeScript Playwright tests covering the customer and partner journeys of the
Uniti Self-Care portals.

| Project | Portal | Default persona | Scope |
|---|---|---|---|
| `ecom-chromium`, `ecom-mobile-safari` | GoKinetic eCom | `CONSUMER` | Catalogue, address qualification, checkout |
| `uconnect-chromium`, `uconnect-firefox` | Uconnect | `BUSINESS_ADMIN` | Billing, invoices, payments, support tickets |
| `partner-chromium` | Enterprise Partner Portal | `PARTNER_ADMIN` | Deal registration and permissions |
| `sdwan-chromium` | SD-WAN Portal | `BUSINESS_ADMIN` | Change requests and approvals |
| `a11y` | all | per page | WCAG 2.2 AA (axe-core) and keyboard checks |
| `api` | API gateway | client credentials | Contract checks complementing Postman |

Mobile Safari and Firefox projects run only `@smoke`-tagged tests.

## Layout

```
playwright.config.ts      projects per portal, reporters, setup dependencies
src/config                environment + portal definitions
src/api                   typed API client (bearer, correlation id, problem+json) and seed helpers
src/data                  fluent test-data builders (all ids prefixed QA-)
src/pages                 page-object models
src/fixtures              extended `test` with page objects, seed API, profile, cleanup
src/support               accessibility and JSON-schema helpers
tests/auth.setup.ts       signs each portal persona in once and stores session state
tests/<portal>/           specs per portal
```

## Running

```bash
cp .env.example .env    # fill persona passwords and OIDC client from the secret store
npm ci
npx playwright install --with-deps
npm test                # everything
npm run test:smoke      # @smoke only
npm run test:uconnect   # one portal
```

`TEST_ENV=staging` plus the staging URLs targets staging. Never point the suite at
production: the checkout tests place real orders against the order API (cancelled
in teardown) and use the payment provider's sandbox card numbers.

## Conventions

- Locators prefer roles and accessible names; `data-testid` only where no
  accessible name exists. A spec that cannot find an element by role is usually
  an accessibility defect worth raising.
- Arrange state through `seed` (API), assert through the UI, then verify the
  side effect through `seed` again.
- Register teardown with `cleanup(() => ...)` immediately after creating data.
- Failing tests record the correlation id from the problem banner as an
  annotation; search Kibana with `correlationId:<value>`.
- Money in assertions is compared in integer minor units; format only for
  display comparisons via `formatMoney`.
