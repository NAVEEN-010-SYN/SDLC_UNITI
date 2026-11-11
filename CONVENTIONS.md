# Engineering Conventions

These apply to every application in the monorepo.

## Domain vocabulary
- **Account** – billing entity (consumer household or business). IDs: `ACC-########`.
- **Customer / User** – a person who logs in. Roles: `CONSUMER`, `BUSINESS_ADMIN`, `BUSINESS_USER`, `PARTNER_ADMIN`, `PARTNER_AGENT`, `WHOLESALE_BUYER`, `SUPPORT_AGENT`.
- **Product / Plan** – fibre broadband tiers (e.g. 100 Mbps, 500 Mbps, 1 Gbps, 2 Gbps), voice, SD-WAN, hosted services.
- **Order** – lifecycle `DRAFT → SUBMITTED → VALIDATED → PROVISIONING → ACTIVE` (or `CANCELLED`/`FAILED`).
- **Service** – an active product instance on an account, tied to a service address.
- **Ticket** – support case, priority `P1..P4`, status `OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED`.
- **Invoice / Payment** – monthly billing; amounts are integer minor units (cents) + ISO currency.

## Code quality
- Layered architecture: controllers/routes → services (business logic) → repositories/clients (I/O).
- Validate every input at the boundary; return RFC 7807 `application/problem+json` errors from APIs.
- No secrets in code: read from environment variables / config; provide `.env.example`.
- Structured JSON logging with a correlation ID (`X-Correlation-Id` header) propagated across calls.
- Unit tests next to each module for business logic.
- Money is never a floating-point type.
- Dates are ISO-8601 UTC on the wire.

## API
- REST, versioned under `/api/v1`.
- Pagination: `?page=&pageSize=` returning `{ items, page, pageSize, total }`.
- Auth: OAuth2/OIDC bearer JWT; roles enforced server-side.
