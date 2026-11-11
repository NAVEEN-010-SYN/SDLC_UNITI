# OpenAPI specs

Contract specs for the APIs exercised by the Playwright, Selenium and Postman suites.

| Spec | Service | Base path |
|---|---|---|
| `specs/ecom-orders.yaml` | eCom GoKinetic checkout & orders | `/api/v1/checkout`, `/api/v1/orders` |
| `specs/uconnect-accounts-billing.yaml` | Uconnect accounts, invoices, payments | `/api/v1/accounts`, `/api/v1/invoices` |
| `specs/iconnect-wholesale-orders.yaml` | iConnect wholesale orders | `/api/v1/wholesale/orders` |
| `specs/sdwan-edges.yaml` | SD-WAN sites, edges, link health | `/api/v1/sdwan` |

`specs/common.yaml` holds the shared components (`ProblemDetails`, `ValidationProblem`,
`PageMeta`, `Money`, `AccountId`, correlation/idempotency headers and the standard error
responses). Service specs reference it with `./common.yaml#/components/...`.

## Linting

```bash
npm install
npm run lint          # all specs
npm run lint -- specs/sdwan-edges.yaml
npm test              # linter unit tests (node:test)
```

The linter runs `@apidevtools/swagger-parser` for structural validity, then enforces the
house rules from `CONVENTIONS.md`:

- every path is under `/api/v1/`; `operationId` is present and unique across all specs
- a global bearer security requirement backed by an `http`/`bearer` scheme
- every templated path parameter is declared, and vice versa
- 4xx/5xx responses are `application/problem+json`
- `page` and `pageSize` come together, and paginated responses are `PageMeta` + `items[]`
- properties named `*Minor` / `*Amount` are `integer`/`int64`
- every `$ref`, including cross-file ones, resolves

When adding an endpoint, update the spec in the same PR as the controller change and keep
the Postman collection's request paths in step with it.
