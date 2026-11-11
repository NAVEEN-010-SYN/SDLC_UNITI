# Snowflake warehouse

Self-care analytics: orders, billing, support SLAs, ARPU and churn.

```
S3 landing (NDJSON CDC) --Snowpipe--> UNITI_RAW.<source>.*_CDC      append-only
                         --stream+task--> UNITI_RAW.<source>.*_CURRENT  latest state per key
                         --dbt staging--> UNITI_ANALYTICS.STAGING      typed, renamed, enum-normalised
                         --dbt marts----> UNITI_ANALYTICS.MARTS        facts, dims, finance marts
```

## Setup (run once per environment, in order)

| Script | Role | Creates |
|---|---|---|
| `setup/00_platform.sql` | SECURITYADMIN / SYSADMIN | roles, service users, warehouses, resource monitor, databases, grants, alert email integration |
| `setup/01_ingestion.sql` | ACCOUNTADMIN, UNITI_LOADER | storage integration, stage, raw CDC tables, Snowpipes |
| `setup/02_streams_tasks.sql` | UNITI_LOADER | `MERGE_LATEST` procedure, streams, serverless tasks, ticket status log, ingestion alert |
| `setup/03_governance.sql` | UNITI_GOVERNANCE | `PII_CLASS` tag + masking, segment row access policy, PII access audit view |

`01_ingestion.sql` uses SnowSQL variables: `snowsql -D env=prod -D datalake_role_arn=arn:aws:iam::...`.

## dbt

```bash
cd dbt
cp profiles.example.yml ~/.dbt/profiles.yml
dbt deps && dbt seed && dbt build          # build + test
dbt source freshness                       # CDC lag vs. thresholds in _sources.yml
```

Models

- **Staging** (views): one per source entity; `enum_code()` normalises `PendingCustomer` -> `PENDING_CUSTOMER`; `minor_units()` fails the build on any fractional money.
- **Core marts**: `dim_date`, `dim_account` (conformed on `ACC-########`), `dim_product` (type 2 from daily catalogue snapshots), `fact_orders` (eCom + iConnect), `fact_invoices`, `fact_payments` (incremental on CDC merge time), `fact_tickets` (first-response and resolution SLA with PENDING_CUSTOMER pauses; targets in `seeds/ticket_sla_targets.csv`).
- **Finance marts**: `mart_arpu_monthly`, `mart_churn_monthly` (logo churn with a `churn_grace_days` re-connect window, rates in basis points).

## Conventions

- Money is `NUMBER(38,0)` minor units with a sibling `currency` column. Never aggregate across currencies.
- Timestamps are `TIMESTAMP_TZ` UTC; `*_date_key` is `YYYYMMDD` into `dim_date`.
- PII columns declare `meta.pii_class` in `_marts.yml`; the post-hook tags them and the tag masks them. Adding a PII column without the meta leaves it unmasked - reviewers check this.
- Every mart with a `segment` column gets the `RAP_SEGMENT` row access policy. Grant segment access by inserting into `GOVERNANCE.SEGMENT_ENTITLEMENTS`, not by creating new policies.
