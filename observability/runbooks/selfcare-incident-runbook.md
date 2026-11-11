# Self-care incident runbook

Applies to every portal under `apps/`. Each section matches an alert's `runbook` link.

## First five minutes

1. Acknowledge the page (PagerDuty `selfcare-oncall`) and post in `#selfcare-incidents`: alert name, start time, who is driving.
2. Open the Dynatrace problem. Its management zone (Selfcare B2C / B2B / Partners) tells you the owning team.
3. Open Kibana **Selfcare - API operations** for the same window. Check which services, routes and problem `code`s are involved.
4. Pick one failing request's `correlationId` and open **Selfcare - request trace by correlationId**. Every service logs the same ID (`X-Correlation-Id`), so this shows the whole call chain and which hop failed first.
5. Decide severity: SEV1 if checkout, login or payments fail for more than 5% of users, otherwise SEV2. Start a status page incident for SEV1.

## Elevated 5xx rate

Watcher `selfcare-5xx-rate`: more than 2% 5xx over 5 minutes, at least 50 requests.

- **One service, one route**: usually a dependency. Look for `err.code` values such as `UPSTREAM_TIMEOUT` or `PAYMENT_GATEWAY_UNAVAILABLE` in the trace. Check the dependency's Dynatrace service page and its status page.
- **One service, every route**: check for a recent deployment (Dynatrace deployment events on the process group). Roll back first and investigate after.
- **Many services**: suspect shared infrastructure, such as the identity provider (401/5xx on token validation), the database cluster or the ingress. Check the Dynatrace host and network views.
- SD-WAN `502 ControllerUnavailable` means VeloCloud Orchestrator or FortiManager is down. Raise it with the vendor and set the portal banner. We can't fix this ourselves.

Close the incident once the rate has stayed below 0.5% for 15 minutes.

## Checkout failures

Synthetic monitor `GoKinetic checkout to payment step` or SLO `eCom checkout availability`.

- `402` responses are declines and normal in small numbers. A rising decline rate with a single `failureCode` means a gateway problem, not a customer problem.
- If orders stay in `DRAFT`, the checkout service could not authorise. Check `paymentGatewayClient` logs for that correlationId.
- Never retry a checkout by hand. The API is idempotent on `Idempotency-Key`, so ask the customer to resubmit from the same browser session.

## Login failures

Synthetic monitors `GoKinetic consumer login` / `Business GoKinetic login`.

- Run the same journey by hand in a private window. If that works, the synthetic credential is probably expired. Rotate it in the Dynatrace credential vault (`DT_SYNTHETIC_*_CREDENTIAL_ID`).
- If it fails for real, check the OIDC provider status and the JWKS endpoint. A rotated signing key that hasn't propagated shows up as a wave of 401s across every API at once.

## P1 ticket spike

Watcher `selfcare-p1-ticket-spike`: at least 5 P1 tickets in 15 minutes and more than 3x the 7-day baseline.

1. Look at the top categories and ZIP codes in the alert. A cluster of `FAULT` tickets in a few ZIPs usually means a fibre cut or OLT outage.
2. Check with the NOC (`#noc`) and get an outage declared in Uconnect so customers see it and compensation runs (`OutageCompensationPolicy`).
3. Once the outage is declared, tell support agents to link new tickets to it rather than triaging them one by one.

## SLO burn

When Dynatrace raises `SLO ... error budget burn rate`:

- A fast burn (10x or more) gets the same response as the matching incident above.
- For a slow burn, open a ticket for the owning team. During business hours, review the change log for the last 7 days.

## Data freshness

Snowflake alert `ALR_INGEST_HEALTH` (email to data-platform on-call).

1. Run `SHOW TASKS IN SCHEMA UNITI_RAW.INGEST;`. A task in `suspended` state has failed 3 times. Check `TABLE(INFORMATION_SCHEMA.TASK_HISTORY())` for the error, fix it, then `ALTER TASK ... RESUME`.
2. Run `SELECT SYSTEM$PIPE_STATUS('UNITI_RAW.INGEST.PIPE_<NAME>');` and look for `executionState` and `lastIngestedTimestamp`. A pipe with errors skips the whole file (`ON_ERROR = SKIP_FILE`). Fix the producer, then reload the file with `COPY INTO ... FILES = (...)`.
3. Run `SHOW STREAMS IN DATABASE UNITI_RAW;`. If `stale = true`, the stream's offset is lost. Recreate the stream and backfill the `_CURRENT` table from the full `_CDC` table with `MERGE_LATEST`.
4. Once data is current, re-run `dbt build --select source:ecom+ source:uconnect+`.

## After the incident

Write a post-incident review within 5 working days. Include the timeline, the correlationIds used during diagnosis, customer impact (orders and tickets affected, from the Snowflake marts) and follow-up actions with owners.
