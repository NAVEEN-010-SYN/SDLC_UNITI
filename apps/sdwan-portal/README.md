# SD-WAN Portal

B2B self-care for managed SD-WAN customers. One vendor-neutral model fronts two
very different control planes:

| Vendor | Control plane | Transport used here |
|---|---|---|
| VMware VeloCloud | VeloCloud Orchestrator (VCO) | Portal API `POST /portal/rest/<method>` with session cookie |
| Fortinet | FortiManager + FortiGate | FortiManager JSON-RPC (`/jsonrpc`, session token) and FortiGate REST (`/api/v2/...`, API key) |

```
apps/sdwan-portal
|-- api/   Node.js + Express (TypeScript) - adapters, services, jobs, REST API
`-- web/   React + Vite (TypeScript) - customer dashboard
```

## Capabilities

* **Inventory** - sites, edges and WAN links per Account, normalised across vendors.
* **Health** - latency / jitter / loss per link, polled on a schedule, aggregated into
  percentiles and scored (MOS-style link score, SLA compliance %).
* **Business policies / QoS** - one neutral policy model translated to VeloCloud QoS
  rules and FortiGate SD-WAN service rules (and back).
* **Firewall rules** - neutral rule list, shadowing/overlap lint, vendor translation.
* **Change requests** - risk-scored, approval workflow (no self-approval, role quorum
  by risk), scheduling into maintenance windows, automatic pre-change backup.
* **Config backup / rollback** - checksummed snapshots, structural diff, restore via CR.
* **Alerts & events** - threshold alerts raised from metrics, vendor events merged.
* **Reports** - SLA/availability per site for a period, CSV export.

## Architecture (api)

```
routes/        HTTP boundary: validation (zod), RBAC, problem+json
services/      business logic (inventory, health, policies, change requests, ...)
domain/        pure logic: scoring, aggregation, policy translation, approval rules
providers/     SdwanProvider interface + VeloCloudAdapter / FortinetAdapter
  http/        HttpClient with retry, exponential backoff + jitter, timeouts
repositories/  persistence interfaces + in-memory implementations
jobs/          interval scheduler: metric polling, alert evaluation, CR execution
```

Roles (from `CONVENTIONS.md`): `BUSINESS_ADMIN`, `BUSINESS_USER`, `SUPPORT_AGENT`,
`PARTNER_ADMIN`. Business users are scoped to their `accountId` claim; support
agents may act on any account.

## Running locally

```bash
cd api && npm install && cp .env.example .env && npm run dev     # :8080
cd web && npm install && npm run dev                              # :5173, proxies /api
```

Set `SDWAN_PROVIDER_MODE=mock` in `api/.env` to run without vendor credentials -
the adapters are then backed by deterministic in-memory fixtures and demo account
`ACC-10000001` (one VeloCloud and one Fortinet tenant). In live mode map accounts to
controller tenants with `SDWAN_TENANTS=ACC-########:VELOCLOUD|FORTINET:<tenant>,...`.

## Tests

```bash
cd api && npm test        # Jest: services, vendor clients (scripted fetch), validation, scheduler, routes (supertest)
cd web && npm test        # Vitest + Testing Library: API client, token gating, drafts, components, pages
```
