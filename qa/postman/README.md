# Postman collections

| Collection | API | Flow |
|---|---|---|
| `ecom-orders` | eCom (MERN) | catalogue paging, serviceability, order create -> get -> cancel, validation and transition errors |
| `uconnect-account` | Uconnect (.NET 8) | account, services, invoices, PDF, payment validation, ticket lifecycle |
| `partner-sdwan` | Enterprise Partner Portal, SD-WAN | deal register/duplicate/list/withdraw, site list, change request create/approve/withdraw |

Each collection carries:

- **Collection pre-request**: fetches a client-credentials token (cached until
  60 s before expiry) and stamps a fresh `X-Correlation-Id` on every request.
- **Collection test**: asserts the correlation id is echoed and that every 4xx/5xx
  is `application/problem+json` with `type`, `title`, `status`.
- **Request tests**: status, JSON schema, domain rules (integer minor units,
  canonical ids such as `ORD-########`, lifecycle transitions).

Requests within a folder are ordered and chain through collection variables
(`orderId`, `ticketId`, `dealId`, `changeRequestId`), so run folders in order.

## Running with Newman

```bash
npx newman run collections/ecom-orders.postman_collection.json \
  -e environments/dev.postman_environment.json \
  --env-var oidcClientId=$OIDC_CLIENT_ID \
  --env-var oidcClientSecret=$OIDC_CLIENT_SECRET \
  --reporters cli,junit --reporter-junit-export reports/ecom.xml
```

Secret values in the environment files are intentionally blank; inject them from
the CI secret store with `--env-var`. Never export a populated environment back
into the repository.
