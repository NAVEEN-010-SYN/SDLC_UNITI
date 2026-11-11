# Data warehouse and analytics: data/snowflake

- **Application:** Data warehouse and analytics
- **Tech stack:** Snowflake SQL, dbt
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 36

## Files

- `data/snowflake/README.md` (44 lines)
- `data/snowflake/dbt/dbt_project.yml` (47 lines)
- `data/snowflake/dbt/macros/governance.sql` (29 lines)
- `data/snowflake/dbt/macros/naming.sql` (33 lines)
- `data/snowflake/dbt/models/intermediate/int_account_active_months.sql` (38 lines)
- `data/snowflake/dbt/models/marts/_marts.yml` (110 lines)
- `data/snowflake/dbt/models/marts/core/dim_account.sql` (77 lines)
- `data/snowflake/dbt/models/marts/core/dim_date.sql` (23 lines)
- `data/snowflake/dbt/models/marts/core/dim_product.sql` (25 lines)
- `data/snowflake/dbt/models/marts/core/fact_invoices.sql` (51 lines)
- `data/snowflake/dbt/models/marts/core/fact_orders.sql` (105 lines)
- `data/snowflake/dbt/models/marts/core/fact_payments.sql` (48 lines)
- `data/snowflake/dbt/models/marts/core/fact_tickets.sql` (96 lines)
- `data/snowflake/dbt/models/marts/finance/mart_arpu_monthly.sql` (46 lines)
- `data/snowflake/dbt/models/marts/finance/mart_churn_monthly.sql` (57 lines)
- `data/snowflake/dbt/models/staging/_sources.yml` (65 lines)
- `data/snowflake/dbt/models/staging/_staging.yml` (129 lines)
- `data/snowflake/dbt/models/staging/stg_catalog__products.sql` (43 lines)
- `data/snowflake/dbt/models/staging/stg_ecom__order_items.sql` (15 lines)
- `data/snowflake/dbt/models/staging/stg_ecom__orders.sql` (30 lines)
- `data/snowflake/dbt/models/staging/stg_iconnect__orders.sql` (20 lines)
- `data/snowflake/dbt/models/staging/stg_uconnect__accounts.sql` (20 lines)
- `data/snowflake/dbt/models/staging/stg_uconnect__invoices.sql` (20 lines)
- `data/snowflake/dbt/models/staging/stg_uconnect__payments.sql` (17 lines)
- `data/snowflake/dbt/models/staging/stg_uconnect__services.sql` (14 lines)
- `data/snowflake/dbt/models/staging/stg_uconnect__ticket_status_intervals.sql` (17 lines)
- `data/snowflake/dbt/models/staging/stg_uconnect__tickets.sql` (15 lines)
- `data/snowflake/dbt/packages.yml` (4 lines)
- `data/snowflake/dbt/profiles.example.yml` (38 lines)
- `data/snowflake/dbt/seeds/ticket_sla_targets.csv` (6 lines)
- `data/snowflake/dbt/tests/assert_currency_consistent_per_account.sql` (7 lines)
- `data/snowflake/dbt/tests/assert_payments_do_not_exceed_invoice_total.sql` (13 lines)
- `data/snowflake/setup/00_platform.sql` (131 lines)
- `data/snowflake/setup/01_ingestion.sql` (144 lines)
- `data/snowflake/setup/02_streams_tasks.sql` (204 lines)
- `data/snowflake/setup/03_governance.sql` (121 lines)

## data/snowflake/README.md

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: markdown. Path: `data/snowflake/README.md`.

````markdown
# Snowflake warehouse

Self-care analytics: orders, billing, support SLAs, ARPU and churn.

```
S3 landing (NDJSON CDC) ──Snowpipe──> UNITI_RAW.<source>.*_CDC      append-only
                         ──stream+task──> UNITI_RAW.<source>.*_CURRENT  latest state per key
                         ──dbt staging──> UNITI_ANALYTICS.STAGING      typed, renamed, enum-normalised
                         ──dbt marts────> UNITI_ANALYTICS.MARTS        facts, dims, finance marts
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

- **Staging** (views): one per source entity; `enum_code()` normalises `PendingCustomer` → `PENDING_CUSTOMER`; `minor_units()` fails the build on any fractional money.
- **Core marts**: `dim_date`, `dim_account` (conformed on `ACC-########`), `dim_product` (type 2 from daily catalogue snapshots), `fact_orders` (eCom + iConnect), `fact_invoices`, `fact_payments` (incremental on CDC merge time), `fact_tickets` (first-response and resolution SLA with PENDING_CUSTOMER pauses; targets in `seeds/ticket_sla_targets.csv`).
- **Finance marts**: `mart_arpu_monthly`, `mart_churn_monthly` (logo churn with a `churn_grace_days` re-connect window, rates in basis points).

## Conventions

- Money is `NUMBER(38,0)` minor units with a sibling `currency` column. Never aggregate across currencies.
- Timestamps are `TIMESTAMP_TZ` UTC; `*_date_key` is `YYYYMMDD` into `dim_date`.
- PII columns declare `meta.pii_class` in `_marts.yml`; the post-hook tags them and the tag masks them. Adding a PII column without the meta leaves it unmasked — reviewers check this.
- Every mart with a `segment` column gets the `RAP_SEGMENT` row access policy. Grant segment access by inserting into `GOVERNANCE.SEGMENT_ENTITLEMENTS`, not by creating new policies.
````

## data/snowflake/dbt/dbt_project.yml

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: yaml. Path: `data/snowflake/dbt/dbt_project.yml`.

```yaml
name: uniti_selfcare
version: '1.0.0'
config-version: 2
require-dbt-version: ['>=1.7.0', '<2.0.0']
profile: uniti_selfcare

model-paths: ['models']
seed-paths: ['seeds']
macro-paths: ['macros']
test-paths: ['tests']
target-path: target
clean-targets: ['target', 'dbt_packages']

vars:
  # Month boundary used by churn/ARPU marts; overridable for backfills.
  reporting_start_month: '2023-01-01'
  # An account with no active service for this many days is churned.
  churn_grace_days: 30
  # Days of late-arriving CDC re-processed by incremental models.
  incremental_lookback_days: 3

models:
  uniti_selfcare:
    +copy_grants: true
    staging:
      +schema: staging
      +materialized: view
    marts:
      +schema: marts
      +materialized: table
      +post-hook:
        - "{{ apply_pii_tags() }}"
        - "{{ apply_segment_policy() }}"
      core:
        +tags: ['core']
      finance:
        +tags: ['finance']

seeds:
  uniti_selfcare:
    +schema: staging
    ticket_sla_targets:
      +column_types:
        priority: varchar(2)
        first_response_minutes: integer
        resolution_minutes: integer
```

## data/snowflake/dbt/macros/governance.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/macros/governance.sql`.

```sql
{#
  Sets the PII_CLASS tag on every column whose schema.yml entry declares
  `meta: { pii_class: EMAIL|PHONE|NAME|ADDRESS|PAYMENT_CARD }`. The tag carries
  the masking policy (setup/03_governance.sql), so tagging is all that is needed.
#}
{% macro apply_pii_tags() -%}
    {%- if not execute -%}{{ return('') }}{%- endif -%}
    {%- set statements = [] -%}
    {%- for column_name, column in model.columns.items() -%}
        {%- set pii_class = column.meta.get('pii_class') -%}
        {%- if pii_class -%}
            {%- do statements.append(
                "ALTER TABLE " ~ this ~ " MODIFY COLUMN " ~ adapter.quote(column_name | upper)
                ~ " SET TAG UNITI_ANALYTICS.GOVERNANCE.PII_CLASS = '" ~ pii_class | upper ~ "'"
            ) -%}
        {%- endif -%}
    {%- endfor -%}
    {{ return(statements | join(';\n')) }}
{%- endmacro %}

{# Attaches the segment row access policy to marts that expose a `segment` column. #}
{% macro apply_segment_policy() -%}
    {%- if not execute -%}{{ return('') }}{%- endif -%}
    {%- if 'segment' not in model.columns -%}{{ return('') }}{%- endif -%}
    {#- An incremental run alters the existing table, which still carries the policy. -#}
    {%- if is_incremental() -%}{{ return('') }}{%- endif -%}
    ALTER TABLE {{ this }} ADD ROW ACCESS POLICY UNITI_ANALYTICS.GOVERNANCE.RAP_SEGMENT ON (segment)
{%- endmacro %}
```

## data/snowflake/dbt/macros/naming.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/macros/naming.sql`.

```sql
{#
  In prod, models land in the exact schema configured (STAGING / MARTS) so the
  grants and policies in setup/ apply. Elsewhere they are prefixed with the
  target schema so developers and CI runs never collide.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if target.name == 'prod' and custom_schema_name is not none -%}
        {{ custom_schema_name | upper }}
    {%- elif custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ target.schema }}_{{ custom_schema_name }}
    {%- endif -%}
{%- endmacro %}

{# Normalises source enum spellings ("PendingCustomer", "pending customer") to PENDING_CUSTOMER. #}
{% macro enum_code(expr) -%}
    UPPER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM({{ expr }}), '([a-z0-9])([A-Z])', '\\1_\\2'), '[\\s-]+', '_'))
{%- endmacro %}

{#
  Reads a money amount that must already be integer minor units. Anything with a
  fractional part fails the cast instead of being silently rounded.
#}
{% macro minor_units(expr) -%}
    CASE
        WHEN {{ expr }} IS NULL THEN NULL
        WHEN {{ expr }}::NUMBER(38, 6) = TRUNC({{ expr }}::NUMBER(38, 6)) THEN {{ expr }}::NUMBER(38, 0)
        -- Deliberate cast failure: aborts the model with the offending value in the error.
        ELSE TO_NUMBER('non-integer minor units: ' || {{ expr }}::VARCHAR)
    END
{%- endmacro %}
```

## data/snowflake/dbt/models/intermediate/int_account_active_months.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/intermediate/int_account_active_months.sql`.

```sql
{{ config(materialized='ephemeral') }}

-- One row per (account, month) in which the account held at least one service
-- that was active for some part of the month. Shared by the ARPU and churn marts
-- so both agree on what "active" means.
with services as (
    select
        s.account_id,
        s.activated_on,
        coalesce(s.cancelled_on, '9999-12-31'::date) as ended_on
    from {{ ref('stg_uconnect__services') }} s
    where not s.is_deleted
      and s.activated_on is not null
      and s.service_status <> 'PENDING_ACTIVATION'
),

months as (
    select distinct month_start, month_end
    from {{ ref('dim_date') }}
    where month_start >= '{{ var("reporting_start_month") }}'::date
      and month_start <= date_trunc('month', current_date())
)

select
    a.account_key,
    a.segment,
    a.currency,
    m.month_start,
    m.month_end,
    min(s.activated_on)  as first_activation_in_scope,
    max(s.ended_on)      as last_service_end
from services s
join months m
  on s.activated_on <= m.month_end
 and s.ended_on     >= m.month_start
join {{ ref('dim_account') }} a on a.account_id = s.account_id
group by a.account_key, a.segment, a.currency, m.month_start, m.month_end
```

## data/snowflake/dbt/models/marts/_marts.yml

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: yaml. Path: `data/snowflake/dbt/models/marts/_marts.yml`.

```yaml
version: 2

models:
  - name: dim_account
    description: Conformed account dimension across Uconnect, eCom and iConnect.
    columns:
      - name: account_key
        tests: [unique, not_null]
      - name: account_number
        tests: [unique, not_null]
      - name: segment
        tests:
          - accepted_values:
              values: [CONSUMER, BUSINESS, WHOLESALE]
      - name: display_name
        meta: { pii_class: NAME }
      - name: contact_email
        meta: { pii_class: EMAIL }
      - name: contact_phone
        meta: { pii_class: PHONE }

  - name: dim_product
    columns:
      - name: product_key
        tests: [unique, not_null]
    tests:
      - dbt_utils.expression_is_true:
          expression: "valid_to > valid_from"

  - name: dim_date
    columns:
      - name: date_key
        tests: [unique, not_null]

  - name: fact_orders
    columns:
      - name: order_key
        tests: [unique, not_null]
      - name: account_key
        tests:
          - not_null
          - relationships:
              to: ref('dim_account')
              field: account_key
      - name: segment
        tests:
          - accepted_values:
              values: [CONSUMER, BUSINESS, WHOLESALE]
      - name: order_status
        tests:
          - accepted_values:
              values: [DRAFT, SUBMITTED, VALIDATED, PROVISIONING, ACTIVE, CANCELLED, FAILED]
      - name: monthly_recurring_minor
        tests:
          - dbt_utils.expression_is_true:
              expression: ">= 0"
      - name: product_key
        tests:
          - not_null:
              config:
                severity: warn
                where: "source_system = 'ECOM'"

  - name: fact_invoices
    columns:
      - name: invoice_id
        tests: [unique, not_null]
      - name: account_key
        tests: [not_null]
      - name: balance_due_minor
        tests:
          - dbt_utils.expression_is_true:
              expression: ">= 0"
    tests:
      - dbt_utils.expression_is_true:
          expression: "total_minor = subtotal_minor + tax_minor"

  - name: fact_payments
    columns:
      - name: payment_id
        tests: [unique, not_null]
      - name: net_collected_minor
        tests:
          - dbt_utils.expression_is_true:
              expression: ">= 0"

  - name: fact_tickets
    columns:
      - name: ticket_id
        tests: [unique, not_null]
      - name: resolution_target_minutes
        description: Null means the priority is missing from the ticket_sla_targets seed.
        tests: [not_null]
      - name: paused_minutes
        tests:
          - dbt_utils.expression_is_true:
              expression: ">= 0"

  - name: mart_arpu_monthly
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns: [month_start, segment, currency]

  - name: mart_churn_monthly
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns: [month_start, segment]
      - dbt_utils.expression_is_true:
          expression: "closing_accounts = opening_accounts + gross_adds - churned_accounts - winbacks_within_grace"
```

## data/snowflake/dbt/models/marts/core/dim_account.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/dim_account.sql`.

```sql
-- Conformed account dimension. Uconnect is the system of record for consumer and
-- business accounts; wholesale partners appear only through iConnect orders.
-- eCom accounts that never reached Uconnect (e.g. orders that failed before
-- activation) are kept so every fact_orders row has a dimension member.
with uconnect as (
    select
        account_number,
        account_id,
        segment,
        account_status,
        display_name,
        contact_email,
        contact_phone,
        billing_state,
        billing_zip5,
        currency,
        is_autopay_enabled,
        created_at,
        closed_at
    from {{ ref('stg_uconnect__accounts') }}
    where not is_deleted
),

ecom_only as (
    select
        account_number,
        any_value(segment)       as segment,
        min(created_at)          as created_at,
        any_value(contact_email) as contact_email
    from {{ ref('stg_ecom__orders') }}
    where account_number not in (select account_number from uconnect)
    group by account_number
),

wholesale as (
    select
        account_number,
        min(created_at) as created_at
    from {{ ref('stg_iconnect__orders') }}
    where account_number is not null
      and account_number not in (select account_number from uconnect)
    group by account_number
),

unioned as (
    select account_number, account_id, segment, account_status, display_name, contact_email,
           contact_phone, billing_state, billing_zip5, currency, is_autopay_enabled,
           created_at, closed_at, 'UCONNECT' as record_source
    from uconnect
    union all
    select account_number, null, segment, 'PROSPECT', null, contact_email,
           null, null, null, null, false, created_at, null, 'ECOM'
    from ecom_only
    union all
    select account_number, null, 'WHOLESALE', 'ACTIVE', null, null,
           null, null, null, 'GBP', false, created_at, null, 'ICONNECT'
    from wholesale
)

select
    {{ dbt_utils.generate_surrogate_key(['account_number']) }} as account_key,
    account_number,
    account_id,
    segment,
    account_status,
    display_name,
    contact_email,
    contact_phone,
    billing_state,
    billing_zip5,
    currency,
    is_autopay_enabled,
    created_at,
    closed_at,
    record_source
from unioned
```

## data/snowflake/dbt/models/marts/core/dim_date.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/dim_date.sql`.

```sql
-- Calendar from 2020-01-01 for 15 years. date_key is YYYYMMDD for compact joins.
with days as (
    select dateadd(day, seq4(), '2020-01-01'::date) as calendar_date
    from table(generator(rowcount => 5479))
)

select
    to_number(to_char(calendar_date, 'YYYYMMDD'))   as date_key,
    calendar_date,
    date_trunc('month', calendar_date)              as month_start,
    last_day(calendar_date, 'month')                as month_end,
    date_trunc('quarter', calendar_date)            as quarter_start,
    year(calendar_date)                             as calendar_year,
    quarter(calendar_date)                          as calendar_quarter,
    month(calendar_date)                            as calendar_month,
    monthname(calendar_date)                        as month_name,
    dayofweekiso(calendar_date)                     as iso_day_of_week,
    dayname(calendar_date)                          as day_name,
    weekiso(calendar_date)                          as iso_week,
    dayofweekiso(calendar_date) between 1 and 5     as is_weekday,
    calendar_date = last_day(calendar_date, 'month') as is_month_end
from days
```

## data/snowflake/dbt/models/marts/core/dim_product.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/dim_product.sql`.

```sql
-- Type-2 product dimension: one row per SKU per catalogue version.
-- Join facts on sku and the fact date between valid_from and valid_to.
select
    {{ dbt_utils.generate_surrogate_key(['sku', 'valid_from']) }} as product_key,
    sku,
    product_name,
    product_type,
    product_family,
    download_mbps,
    upload_mbps,
    case
        when download_mbps is null then null
        when download_mbps < 500  then 'UNDER_500M'
        when download_mbps < 1000 then '500M'
        when download_mbps < 2000 then '1G'
        else '2G_PLUS'
    end                                                    as speed_tier,
    list_monthly_minor,
    currency,
    is_active,
    valid_from,
    coalesce(valid_to, '9999-12-31'::date)                 as valid_to,
    valid_to is null                                       as is_current
from {{ ref('stg_catalog__products') }}
```

## data/snowflake/dbt/models/marts/core/fact_invoices.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/fact_invoices.sql`.

```sql
-- Grain: one issued (non-draft) invoice. Balances are as of the model run.
with invoices as (
    select *
    from {{ ref('stg_uconnect__invoices') }}
    where not is_deleted
      and invoice_status <> 'DRAFT'
),

accounts as (
    select account_id, account_key, segment
    from {{ ref('dim_account') }}
    where account_id is not null
)

select
    i.invoice_id,
    i.invoice_number,
    a.account_key,
    a.segment,
    i.invoice_status,
    i.currency,
    date_trunc('month', i.period_start)                         as billing_month,
    i.period_start,
    i.period_end,
    to_number(to_char(i.issued_on, 'YYYYMMDD'))                 as issued_date_key,
    i.issued_on,
    i.due_on,
    i.paid_at,
    i.subtotal_minor,
    i.tax_minor,
    i.total_minor,
    i.amount_paid_minor,
    case
        when i.invoice_status = 'VOID' or i.total_minor < 0 then 0
        else i.total_minor - i.amount_paid_minor
    end                                                         as balance_due_minor,
    i.tax_rate_bps,
    i.invoice_status = 'VOID'                                   as is_void,
    i.invoice_status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
        and i.due_on < current_date()                           as is_past_due,
    case
        when i.invoice_status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') and i.due_on < current_date()
        then datediff(day, i.due_on, current_date())
        else 0
    end                                                         as days_past_due,
    case
        when i.paid_at is not null then datediff(day, i.issued_on, i.paid_at::date)
    end                                                         as days_to_pay
from invoices i
left join accounts a on a.account_id = i.account_id
```

## data/snowflake/dbt/models/marts/core/fact_orders.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/fact_orders.sql`.

```sql
-- Grain: one order across retail (eCom) and wholesale (iConnect) channels.
-- Charges are in the order's own currency, integer minor units.
with ecom_plan as (
    -- The plan line identifies the product; an order always has exactly one.
    select order_number, sku as plan_sku
    from {{ ref('stg_ecom__order_items') }}
    where product_type = 'PLAN'
    qualify row_number() over (partition by order_number order by line_number) = 1
),

ecom_one_time as (
    select
        order_number,
        sum(quantity * (unit_one_time_minor + unit_installation_minor)) as one_time_list_minor
    from {{ ref('stg_ecom__order_items') }}
    group by order_number
),

ecom as (
    select
        'ECOM'                          as source_system,
        o.order_number,
        o.account_number,
        o.segment,
        'PROVIDE'                       as order_type,
        o.order_status,
        p.plan_sku                      as product_sku,
        o.contract_term_months,
        o.currency,
        o.due_today_minor,
        o.monthly_recurring_minor,
        ot.one_time_list_minor,
        o.payment_captured_minor - o.payment_refunded_minor as net_collected_minor,
        o.promo_code,
        o.created_at,
        o.submitted_at,
        o.activated_at
    from {{ ref('stg_ecom__orders') }} o
    left join ecom_plan p      on p.order_number = o.order_number
    left join ecom_one_time ot on ot.order_number = o.order_number
    where not o.is_deleted
),

wholesale as (
    select
        'ICONNECT'                      as source_system,
        order_reference                 as order_number,
        account_number,
        'WHOLESALE'                     as segment,
        order_type,
        order_status,
        product_code                    as product_sku,
        null::integer                   as contract_term_months,
        currency,
        0                               as due_today_minor,
        coalesce(monthly_rental_minor, 0) as monthly_recurring_minor,
        coalesce(one_off_charge_minor, 0) + coalesce(cancellation_charge_minor, 0) as one_time_list_minor,
        null::number                    as net_collected_minor,
        null::varchar                   as promo_code,
        created_at,
        created_at                      as submitted_at,
        case when order_status = 'ACTIVE' then completed_date::timestamp_tz end as activated_at
    from {{ ref('stg_iconnect__orders') }}
    where not is_deleted
),

orders as (
    select * from ecom
    union all
    select * from wholesale
)

select
    {{ dbt_utils.generate_surrogate_key(['o.source_system', 'o.order_number']) }} as order_key,
    o.source_system,
    o.order_number,
    a.account_key,
    o.segment,
    o.order_type,
    o.order_status,
    pr.product_key,
    o.product_sku,
    o.contract_term_months,
    o.currency,
    o.due_today_minor,
    o.monthly_recurring_minor,
    o.one_time_list_minor,
    o.net_collected_minor,
    o.promo_code,
    o.promo_code is not null                                        as has_promo,
    to_number(to_char(o.created_at, 'YYYYMMDD'))                    as created_date_key,
    o.created_at,
    o.submitted_at,
    o.activated_at,
    datediff(day, o.submitted_at, o.activated_at)                   as days_submit_to_active,
    o.order_status = 'ACTIVE'                                       as is_activated,
    o.order_status in ('CANCELLED', 'FAILED')                       as is_terminated,
    o.order_status in ('SUBMITTED', 'VALIDATED', 'PROVISIONING')    as is_in_flight
from orders o
left join {{ ref('dim_account') }} a on a.account_number = o.account_number
left join {{ ref('dim_product') }} pr
       on pr.sku = o.product_sku
      and o.created_at::date >= pr.valid_from
      and o.created_at::date <  pr.valid_to
```

## data/snowflake/dbt/models/marts/core/fact_payments.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/fact_payments.sql`.

```sql
{{
    config(
        materialized='incremental',
        unique_key='payment_id',
        incremental_strategy='merge',
        on_schema_change='append_new_columns',
        cluster_by=['created_date_key']
    )
}}

-- Grain: one payment attempt. Incremental on the CDC merge time so status
-- changes (settlement, refunds) re-merge regardless of when the payment was made.
with payments as (
    select *
    from {{ ref('stg_uconnect__payments') }}
    where not is_deleted
    {% if is_incremental() %}
      and _merged_at > (
          select dateadd(day, -{{ var('incremental_lookback_days') }}, max(_merged_at)) from {{ this }}
      )
    {% endif %}
)

select
    p.payment_id,
    p.invoice_id,
    a.account_key,
    a.segment,
    p.payment_status,
    p.payment_channel,
    p.method_type,
    p.currency,
    p.amount_minor,
    p.refunded_minor,
    case
        when p.payment_status in ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
        then p.amount_minor - p.refunded_minor
        else 0
    end                                                    as net_collected_minor,
    p.payment_status = 'FAILED'                            as is_failed,
    p.failure_code,
    to_number(to_char(p.created_at, 'YYYYMMDD'))           as created_date_key,
    p.created_at,
    p.settled_at,
    p._merged_at
from payments p
left join {{ ref('dim_account') }} a on a.account_id = p.account_id
```

## data/snowflake/dbt/models/marts/core/fact_tickets.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/core/fact_tickets.sql`.

```sql
-- Grain: one support ticket, with first-response and resolution SLA outcomes.
--
-- SLA rules (agreed with Support Operations):
--   * Clocks run 24x7 from created_at; targets per priority come from the
--     ticket_sla_targets seed.
--   * The resolution clock pauses while the ticket is PENDING_CUSTOMER.
--   * The first-response clock never pauses.
--   * Open tickets are measured against now(); `*_breached` can flip from
--     false to true between runs, so `is_*_at_risk` flags the last 20%.
with tickets as (
    select *
    from {{ ref('stg_uconnect__tickets') }}
    where not is_deleted
),

targets as (
    select priority, first_response_minutes, resolution_minutes
    from {{ ref('ticket_sla_targets') }}
),

clock_end as (
    select
        ticket_id,
        coalesce(resolved_at, closed_at, current_timestamp()) as resolution_clock_end
    from tickets
),

paused as (
    -- Clip each PENDING_CUSTOMER interval to the part that falls before the
    -- resolution clock stopped.
    select
        i.ticket_id,
        sum(greatest(
            datediff(
                minute,
                i.entered_at,
                least(coalesce(i.exited_at, c.resolution_clock_end), c.resolution_clock_end)
            ),
            0
        )) as paused_minutes
    from {{ ref('stg_uconnect__ticket_status_intervals') }} i
    join clock_end c on c.ticket_id = i.ticket_id
    where i.ticket_status = 'PENDING_CUSTOMER'
      and i.entered_at < c.resolution_clock_end
    group by i.ticket_id
),

measured as (
    select
        t.*,
        tg.first_response_minutes                                      as first_response_target_minutes,
        tg.resolution_minutes                                          as resolution_target_minutes,
        coalesce(p.paused_minutes, 0)                                  as paused_minutes,
        datediff(minute, t.created_at, coalesce(t.first_responded_at, current_timestamp()))
                                                                       as first_response_elapsed_minutes,
        datediff(minute, t.created_at, c.resolution_clock_end) - coalesce(p.paused_minutes, 0)
                                                                       as resolution_elapsed_minutes
    from tickets t
    join clock_end c      on c.ticket_id = t.ticket_id
    left join targets tg  on tg.priority = t.priority
    left join paused p    on p.ticket_id = t.ticket_id
)

select
    m.ticket_id,
    m.ticket_number,
    a.account_key,
    a.segment,
    m.priority,
    m.ticket_status,
    m.category,
    to_number(to_char(m.created_at, 'YYYYMMDD'))                       as created_date_key,
    m.created_at,
    m.first_responded_at,
    m.resolved_at,
    m.closed_at,
    m.ticket_status in ('RESOLVED', 'CLOSED')                          as is_resolved,
    m.first_response_target_minutes,
    m.first_response_elapsed_minutes,
    m.first_response_elapsed_minutes > m.first_response_target_minutes as is_first_response_breached,
    m.resolution_target_minutes,
    m.paused_minutes,
    m.resolution_elapsed_minutes,
    m.resolution_elapsed_minutes > m.resolution_target_minutes         as is_resolution_breached,
    dateadd(minute, m.resolution_target_minutes + m.paused_minutes, m.created_at)
                                                                       as resolution_due_at,
    m.resolved_at is null
        and m.ticket_status not in ('RESOLVED', 'CLOSED')
        and m.resolution_elapsed_minutes <= m.resolution_target_minutes
        and m.resolution_elapsed_minutes * 5 >= m.resolution_target_minutes * 4
                                                                       as is_resolution_at_risk,
    greatest(m.resolution_elapsed_minutes - m.resolution_target_minutes, 0)
                                                                       as resolution_overrun_minutes
from measured m
left join {{ ref('dim_account') }} a on a.account_id = m.account_id
```

## data/snowflake/dbt/models/marts/finance/mart_arpu_monthly.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/finance/mart_arpu_monthly.sql`.

```sql
-- Average revenue per active account, by billing month, segment and currency.
-- Revenue is invoiced recurring + usage + one-off, net of credits/discounts,
-- before tax, from non-void invoices. ARPU is rounded half-up to whole minor units.
with revenue as (
    select
        billing_month                 as month_start,
        segment,
        currency,
        sum(subtotal_minor)           as revenue_minor,
        count(distinct account_key)   as billed_accounts
    from {{ ref('fact_invoices') }}
    where not is_void
    group by 1, 2, 3
),

active as (
    select
        month_start,
        segment,
        currency,
        count(distinct account_key) as active_accounts
    from {{ ref('int_account_active_months') }}
    group by 1, 2, 3
)

select
    coalesce(r.month_start, a.month_start)                    as month_start,
    coalesce(r.segment, a.segment)                            as segment,
    coalesce(r.currency, a.currency)                          as currency,
    coalesce(r.revenue_minor, 0)                              as revenue_minor,
    coalesce(a.active_accounts, 0)                            as active_accounts,
    coalesce(r.billed_accounts, 0)                            as billed_accounts,
    case
        when coalesce(a.active_accounts, 0) = 0 then null
        else round(coalesce(r.revenue_minor, 0) / a.active_accounts, 0)::number(38, 0)
    end                                                       as arpu_minor,
    lag(case when coalesce(a.active_accounts, 0) = 0 then null
             else round(coalesce(r.revenue_minor, 0) / a.active_accounts, 0)::number(38, 0) end)
        over (partition by coalesce(r.segment, a.segment), coalesce(r.currency, a.currency)
              order by coalesce(r.month_start, a.month_start)) as prior_month_arpu_minor
from revenue r
full outer join active a
  on a.month_start = r.month_start
 and a.segment     = r.segment
 and a.currency    = r.currency
```

## data/snowflake/dbt/models/marts/finance/mart_churn_monthly.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/marts/finance/mart_churn_monthly.sql`.

```sql
-- Monthly logo churn by segment.
--   opening   = active in the previous month
--   gross_add = active this month, not active last month
--   churned   = active last month, not active this month, and still without an
--               active service `churn_grace_days` after their last service ended
--               (a quick re-connect is a plan change, not churn)
-- Rates are integer basis points of opening accounts.
with activity as (
    select account_key, segment, month_start, last_service_end
    from {{ ref('int_account_active_months') }}
),

transitions as (
    select
        coalesce(cur.month_start, dateadd(month, 1, prev.month_start)) as month_start,
        coalesce(cur.segment, prev.segment)                            as segment,
        coalesce(cur.account_key, prev.account_key)                    as account_key,
        prev.account_key is not null                                   as was_active,
        cur.account_key is not null                                    as is_active,
        prev.last_service_end                                          as prev_last_service_end
    from activity cur
    full outer join activity prev
      on prev.account_key = cur.account_key
     and prev.month_start = dateadd(month, -1, cur.month_start)
),

reactivated as (
    -- Accounts with any active month inside the grace window after leaving.
    select distinct t.account_key, t.month_start
    from transitions t
    join activity later
      on later.account_key = t.account_key
     and later.month_start >  t.month_start
     and later.month_start <= dateadd(day, {{ var('churn_grace_days') }}, t.prev_last_service_end)
    where t.was_active and not t.is_active
)

select
    t.month_start,
    t.segment,
    count_if(t.was_active)                                        as opening_accounts,
    count_if(t.is_active)                                         as closing_accounts,
    count_if(t.is_active and not t.was_active)                    as gross_adds,
    count_if(t.was_active and not t.is_active and r.account_key is null) as churned_accounts,
    count_if(t.was_active and not t.is_active and r.account_key is not null) as winbacks_within_grace,
    case
        when count_if(t.was_active) = 0 then null
        else round(count_if(t.was_active and not t.is_active and r.account_key is null) * 10000
                   / count_if(t.was_active), 0)::integer
    end                                                           as churn_rate_bps
from transitions t
left join reactivated r
  on r.account_key = t.account_key
 and r.month_start = t.month_start
where t.month_start <= date_trunc('month', current_date())
group by t.month_start, t.segment
```

## data/snowflake/dbt/models/staging/_sources.yml

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: yaml. Path: `data/snowflake/dbt/models/staging/_sources.yml`.

```yaml
version: 2

sources:
  - name: ecom
    database: UNITI_RAW
    schema: ECOM
    description: eCom GoKinetic MongoDB, merged to latest state by TSK_ECOM_ORDERS.
    loaded_at_field: _merged_at
    freshness:
      warn_after: { count: 30, period: minute }
      error_after: { count: 6, period: hour }
    tables:
      - name: orders_current
        identifier: ORDERS_CURRENT
        columns:
          - name: business_key
            description: orderNumber (GK-YYYYMMDD-XXXXXX)
            tests: [unique, not_null]

  - name: uconnect
    database: UNITI_RAW
    schema: UCONNECT
    description: Uconnect SQL Server via Debezium, merged to latest state per Id.
    loaded_at_field: _merged_at
    freshness:
      warn_after: { count: 30, period: minute }
      error_after: { count: 6, period: hour }
    tables:
      - name: accounts_current
        identifier: ACCOUNTS_CURRENT
      - name: services_current
        identifier: SERVICES_CURRENT
      - name: invoices_current
        identifier: INVOICES_CURRENT
      - name: payments_current
        identifier: PAYMENTS_CURRENT
      - name: tickets_current
        identifier: TICKETS_CURRENT
      - name: ticket_status_events
        identifier: TICKET_STATUS_EVENTS
        loaded_at_field: changed_at
        description: One row per ticket status change, built by TSK_TICKET_STATUS_EVENTS.

  - name: iconnect
    database: UNITI_RAW
    schema: ICONNECT
    loaded_at_field: _merged_at
    freshness:
      warn_after: { count: 1, period: hour }
      error_after: { count: 12, period: hour }
    tables:
      - name: orders_current
        identifier: ORDERS_CURRENT

  - name: catalog
    database: UNITI_RAW
    schema: CATALOG
    loaded_at_field: _loaded_at
    freshness:
      warn_after: { count: 26, period: hour }
      error_after: { count: 50, period: hour }
    tables:
      - name: products_snapshot
        identifier: PRODUCTS_SNAPSHOT
```

## data/snowflake/dbt/models/staging/_staging.yml

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: yaml. Path: `data/snowflake/dbt/models/staging/_staging.yml`.

```yaml
version: 2

models:
  - name: stg_ecom__orders
    columns:
      - name: order_number
        tests:
          - unique
          - not_null
          - dbt_utils.expression_is_true:
              expression: "regexp_like(order_number, '^GK-[0-9]{8}-[A-Z0-9]{6}$')"
      - name: account_number
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: "regexp_like(account_number, '^ACC-[0-9]{8}$')"
      - name: order_status
        tests:
          - accepted_values:
              values: [DRAFT, SUBMITTED, VALIDATED, PROVISIONING, ACTIVE, CANCELLED, FAILED]
      - name: segment
        tests:
          - accepted_values:
              values: [CONSUMER, BUSINESS]
      - name: due_today_minor
        tests: [not_null]

  - name: stg_ecom__order_items
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns: [order_number, line_number]
    columns:
      - name: quantity
        tests:
          - dbt_utils.expression_is_true:
              expression: "> 0"

  - name: stg_uconnect__accounts
    columns:
      - name: account_id
        tests: [unique, not_null]
      - name: account_number
        tests: [unique, not_null]
      - name: segment
        tests:
          - accepted_values:
              values: [CONSUMER, BUSINESS]
      - name: account_status
        tests:
          - accepted_values:
              values: [ACTIVE, SUSPENDED, CLOSED]

  - name: stg_uconnect__services
    columns:
      - name: service_id
        tests: [unique, not_null]
      - name: account_id
        tests:
          - relationships:
              to: ref('stg_uconnect__accounts')
              field: account_id
      - name: service_status
        tests:
          - accepted_values:
              values: [PENDING_ACTIVATION, ACTIVE, SUSPENDED, CANCELLED]

  - name: stg_uconnect__invoices
    columns:
      - name: invoice_id
        tests: [unique, not_null]
      - name: invoice_status
        tests:
          - accepted_values:
              values: [DRAFT, ISSUED, PARTIALLY_PAID, PAID, OVERDUE, VOID]
      - name: total_minor
        tests: [not_null]

  - name: stg_uconnect__payments
    columns:
      - name: payment_id
        tests: [unique, not_null]
      - name: invoice_id
        tests:
          - relationships:
              to: ref('stg_uconnect__invoices')
              field: invoice_id
      - name: amount_minor
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: "> 0"
      - name: payment_status
        tests:
          - accepted_values:
              values: [PENDING, SUCCEEDED, FAILED, REFUNDED, PARTIALLY_REFUNDED]

  - name: stg_uconnect__tickets
    columns:
      - name: ticket_id
        tests: [unique, not_null]
      - name: priority
        tests:
          - not_null
          - accepted_values:
              values: [P1, P2, P3, P4]
      - name: ticket_status
        tests:
          - accepted_values:
              values: [OPEN, IN_PROGRESS, PENDING_CUSTOMER, RESOLVED, CLOSED]

  - name: stg_uconnect__ticket_status_intervals
    tests:
      - dbt_utils.expression_is_true:
          expression: "exited_at is null or exited_at >= entered_at"

  - name: stg_iconnect__orders
    columns:
      - name: order_id
        tests: [unique, not_null]
      - name: order_type
        tests:
          - accepted_values:
              values: [PROVIDE, CEASE, MODIFY, MIGRATE]

  - name: stg_catalog__products
    tests:
      - dbt_utils.unique_combination_of_columns:
          combination_of_columns: [sku, valid_from]
```

## data/snowflake/dbt/models/staging/stg_catalog__products.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_catalog__products.sql`.

```sql
-- Daily full snapshots collapsed into validity ranges, so facts can price
-- against the catalogue as it was on the order date.
with snapshots as (
    select
        upper(payload:sku::varchar)                       as sku,
        payload:name::varchar                             as product_name,
        {{ enum_code('payload:productType::varchar') }}   as product_type,
        {{ enum_code('payload:family::varchar') }}        as product_family,
        payload:downloadMbps::integer                     as download_mbps,
        payload:uploadMbps::integer                       as upload_mbps,
        {{ minor_units('payload:monthlyPrice') }}         as list_monthly_minor,
        upper(payload:currency::varchar)                  as currency,
        payload:active::boolean                           as is_active,
        snapshot_on
    from {{ source('catalog', 'products_snapshot') }}
),

changes as (
    select
        *,
        hash(product_name, product_type, product_family, download_mbps, upload_mbps,
             list_monthly_minor, currency, is_active) as row_hash,
        lag(hash(product_name, product_type, product_family, download_mbps, upload_mbps,
                 list_monthly_minor, currency, is_active))
            over (partition by sku order by snapshot_on) as previous_hash
    from snapshots
)

select
    sku,
    product_name,
    product_type,
    product_family,
    download_mbps,
    upload_mbps,
    list_monthly_minor,
    currency,
    is_active,
    snapshot_on                                                       as valid_from,
    lead(snapshot_on) over (partition by sku order by snapshot_on)    as valid_to
from changes
where previous_hash is null or previous_hash <> row_hash
```

## data/snowflake/dbt/models/staging/stg_ecom__order_items.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_ecom__order_items.sql`.

```sql
-- One row per order line. Monetary unit prices stay in minor units; extended
-- amounts are computed in the fact so quantity changes never desync them.
select
    o.business_key                                       as order_number,
    item.index + 1                                       as line_number,
    upper(item.value:sku::varchar)                       as sku,
    {{ enum_code('item.value:productType::varchar') }}   as product_type,
    item.value:quantity::integer                         as quantity,
    {{ minor_units('item.value:unitMonthly') }}          as unit_monthly_minor,
    {{ minor_units('item.value:unitOneTime') }}          as unit_one_time_minor,
    {{ minor_units('item.value:unitInstallation') }}     as unit_installation_minor
from {{ source('ecom', 'orders_current') }} o,
     lateral flatten(input => o.payload:items) item
where not o.is_deleted
```

## data/snowflake/dbt/models/staging/stg_ecom__orders.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_ecom__orders.sql`.

```sql
with source as (
    select * from {{ source('ecom', 'orders_current') }}
)

select
    business_key                                              as order_number,
    payload:accountId::varchar                                as account_number,
    {{ enum_code('payload:segment::varchar') }}               as segment,
    {{ enum_code('payload:status::varchar') }}                as order_status,
    payload:contractTermMonths::integer                       as contract_term_months,
    upper(payload:currency::varchar)                          as currency,
    {{ minor_units('payload:dueToday') }}                     as due_today_minor,
    {{ minor_units('payload:monthlyRecurring') }}             as monthly_recurring_minor,
    {{ enum_code('payload:payment.status::varchar') }}        as payment_status,
    coalesce({{ minor_units('payload:payment.capturedAmount') }}, 0) as payment_captured_minor,
    coalesce({{ minor_units('payload:payment.refundedAmount') }}, 0) as payment_refunded_minor,
    nullif(payload:promoCode::varchar, '')                    as promo_code,
    payload:serviceAddress.state::varchar                     as service_state,
    left(payload:serviceAddress.postalCode::varchar, 5)       as service_zip5,
    payload:contact.email::varchar                            as contact_email,
    payload:sourceQuoteNumber::varchar                        as source_quote_number,
    payload:failureReason::varchar                            as failure_reason,
    payload:createdAt::timestamp_tz                           as created_at,
    payload:submittedAt::timestamp_tz                         as submitted_at,
    payload:activatedAt::timestamp_tz                         as activated_at,
    payload:updatedAt::timestamp_tz                           as updated_at,
    is_deleted,
    _merged_at
from source
```

## data/snowflake/dbt/models/staging/stg_iconnect__orders.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_iconnect__orders.sql`.

```sql
select
    business_key                                            as order_id,
    payload:Reference::varchar                              as order_reference,
    payload:PartnerId::varchar                              as partner_id,
    payload:PartnerAccountNumber::varchar                   as account_number,
    payload:PartnerReference::varchar                       as partner_reference,
    {{ enum_code('payload:Type::varchar') }}                as order_type,
    {{ enum_code('payload:Status::varchar') }}              as order_status,
    upper(payload:ProductCode::varchar)                     as product_code,
    {{ minor_units('payload:MonthlyRental_MinorUnits') }}   as monthly_rental_minor,
    {{ minor_units('payload:OneOffCharge_MinorUnits') }}    as one_off_charge_minor,
    {{ minor_units('payload:CancellationCharge_MinorUnits') }} as cancellation_charge_minor,
    coalesce(upper(payload:MonthlyRental_Currency::varchar), 'GBP') as currency,
    payload:RequestedDate::date                             as requested_date,
    payload:CommittedDate::date                             as committed_date,
    payload:CompletedDate::date                             as completed_date,
    payload:CreatedAt::timestamp_tz                         as created_at,
    is_deleted
from {{ source('iconnect', 'orders_current') }}
```

## data/snowflake/dbt/models/staging/stg_uconnect__accounts.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_uconnect__accounts.sql`.

```sql
select
    business_key                                    as account_id,
    payload:AccountNumber::varchar                  as account_number,
    {{ enum_code('payload:Type::varchar') }}        as segment,
    {{ enum_code('payload:Status::varchar') }}      as account_status,
    payload:DisplayName::varchar                    as display_name,
    payload:ContactEmail::varchar                   as contact_email,
    payload:ContactPhone::varchar                   as contact_phone,
    payload:BillingAddress_Line1::varchar           as billing_line1,
    payload:BillingAddress_City::varchar            as billing_city,
    payload:BillingAddress_State::varchar           as billing_state,
    left(payload:BillingAddress_PostalCode::varchar, 5) as billing_zip5,
    upper(payload:Currency::varchar)                as currency,
    payload:AutopayEnabled::boolean                 as is_autopay_enabled,
    payload:CreatedAt::timestamp_tz                 as created_at,
    payload:ClosedAt::timestamp_tz                  as closed_at,
    is_deleted,
    _merged_at
from {{ source('uconnect', 'accounts_current') }}
```

## data/snowflake/dbt/models/staging/stg_uconnect__invoices.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_uconnect__invoices.sql`.

```sql
select
    business_key                                      as invoice_id,
    payload:InvoiceNumber::varchar                    as invoice_number,
    payload:AccountId::varchar                        as account_id,
    {{ enum_code('payload:Status::varchar') }}        as invoice_status,
    payload:PeriodStart::date                         as period_start,
    payload:PeriodEnd::date                           as period_end,
    payload:IssuedOn::date                            as issued_on,
    payload:DueOn::date                               as due_on,
    payload:PaidAt::timestamp_tz                      as paid_at,
    upper(payload:Currency::varchar)                  as currency,
    {{ minor_units('payload:Subtotal_MinorUnits') }}  as subtotal_minor,
    {{ minor_units('payload:TaxTotal_MinorUnits') }}  as tax_minor,
    {{ minor_units('payload:Total_MinorUnits') }}     as total_minor,
    {{ minor_units('payload:AmountPaid_MinorUnits') }} as amount_paid_minor,
    payload:TaxRateBasisPoints::integer               as tax_rate_bps,
    payload:CreatedAt::timestamp_tz                   as created_at,
    is_deleted
from {{ source('uconnect', 'invoices_current') }}
```

## data/snowflake/dbt/models/staging/stg_uconnect__payments.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_uconnect__payments.sql`.

```sql
select
    business_key                                         as payment_id,
    payload:AccountId::varchar                           as account_id,
    payload:InvoiceId::varchar                           as invoice_id,
    {{ minor_units('payload:Amount_MinorUnits') }}       as amount_minor,
    coalesce({{ minor_units('payload:RefundedAmount_MinorUnits') }}, 0) as refunded_minor,
    upper(payload:Amount_Currency::varchar)              as currency,
    {{ enum_code('payload:Status::varchar') }}           as payment_status,
    {{ enum_code('payload:Channel::varchar') }}          as payment_channel,
    {{ enum_code('payload:MethodType::varchar') }}       as method_type,
    payload:FailureCode::varchar                         as failure_code,
    payload:CreatedAt::timestamp_tz                      as created_at,
    payload:SettledAt::timestamp_tz                      as settled_at,
    is_deleted,
    _merged_at
from {{ source('uconnect', 'payments_current') }}
```

## data/snowflake/dbt/models/staging/stg_uconnect__services.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_uconnect__services.sql`.

```sql
select
    business_key                                     as service_id,
    payload:AccountId::varchar                       as account_id,
    {{ enum_code('payload:ProductType::varchar') }}  as product_family,
    upper(payload:PlanCode::varchar)                 as plan_code,
    {{ enum_code('payload:Status::varchar') }}       as service_status,
    {{ minor_units('payload:MonthlyPrice_MinorUnits') }} as monthly_price_minor,
    upper(payload:MonthlyPrice_Currency::varchar)    as currency,
    payload:ActivatedOn::date                        as activated_on,
    payload:CancelledOn::date                        as cancelled_on,
    payload:ContractEndsOn::date                     as contract_ends_on,
    is_deleted
from {{ source('uconnect', 'services_current') }}
```

## data/snowflake/dbt/models/staging/stg_uconnect__ticket_status_intervals.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_uconnect__ticket_status_intervals.sql`.

```sql
-- Turns the status change log into closed intervals [entered_at, exited_at).
-- The last interval for an unresolved ticket is open (exited_at is null).
with events as (
    select
        ticket_id,
        {{ enum_code('status') }} as ticket_status,
        changed_at
    from {{ source('uconnect', 'ticket_status_events') }}
)

select
    ticket_id,
    ticket_status,
    changed_at                                                        as entered_at,
    lead(changed_at) over (partition by ticket_id order by changed_at) as exited_at
from events
```

## data/snowflake/dbt/models/staging/stg_uconnect__tickets.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/models/staging/stg_uconnect__tickets.sql`.

```sql
select
    business_key                                   as ticket_id,
    payload:TicketNumber::varchar                  as ticket_number,
    payload:AccountId::varchar                     as account_id,
    {{ enum_code('payload:Priority::varchar') }}   as priority,
    {{ enum_code('payload:Status::varchar') }}     as ticket_status,
    {{ enum_code('payload:Category::varchar') }}   as category,
    payload:AssignedTo::varchar                    as assigned_to,
    payload:CreatedAt::timestamp_tz                as created_at,
    payload:FirstRespondedAt::timestamp_tz         as first_responded_at,
    payload:ResolvedAt::timestamp_tz               as resolved_at,
    payload:ClosedAt::timestamp_tz                 as closed_at,
    is_deleted
from {{ source('uconnect', 'tickets_current') }}
```

## data/snowflake/dbt/packages.yml

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: yaml. Path: `data/snowflake/dbt/packages.yml`.

```yaml
packages:
  - package: dbt-labs/dbt_utils
    version: [">=1.1.0", "<2.0.0"]
```

## data/snowflake/dbt/profiles.example.yml

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: yaml. Path: `data/snowflake/dbt/profiles.example.yml`.

```yaml
# Copy to ~/.dbt/profiles.yml. All secrets come from the environment.
uniti_selfcare:
  target: dev
  outputs:
    dev:
      type: snowflake
      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user: "{{ env_var('SNOWFLAKE_USER') }}"
      authenticator: externalbrowser
      role: UNITI_TRANSFORMER
      warehouse: UNITI_TRANSFORMING_WH
      database: UNITI_ANALYTICS
      schema: "dbt_{{ env_var('USER', 'dev') | lower }}"
      threads: 8
    ci:
      type: snowflake
      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user: SVC_UNITI_DBT
      private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"
      private_key_passphrase: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PASSPHRASE', '') }}"
      role: UNITI_TRANSFORMER
      warehouse: UNITI_TRANSFORMING_WH
      database: UNITI_ANALYTICS
      schema: "ci_{{ env_var('CI_RUN_ID', 'local') }}"
      threads: 8
    prod:
      type: snowflake
      account: "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user: SVC_UNITI_DBT
      private_key_path: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PATH') }}"
      private_key_passphrase: "{{ env_var('SNOWFLAKE_PRIVATE_KEY_PASSPHRASE', '') }}"
      role: UNITI_TRANSFORMER
      warehouse: UNITI_TRANSFORMING_WH
      database: UNITI_ANALYTICS
      schema: public
      threads: 16
      query_tag: dbt_prod
```

## data/snowflake/dbt/seeds/ticket_sla_targets.csv

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: text. Path: `data/snowflake/dbt/seeds/ticket_sla_targets.csv`.

```text
priority,first_response_minutes,resolution_minutes,description
P1,15,240,Total loss of service or security incident
P2,60,480,Degraded service affecting multiple users
P3,240,2880,Single user or non-critical feature impaired
P4,1440,7200,Question or cosmetic issue
```

## data/snowflake/dbt/tests/assert_currency_consistent_per_account.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/tests/assert_currency_consistent_per_account.sql`.

```sql
-- Money is only summable within one currency. An account billed in more than one
-- currency would silently corrupt ARPU, so fail loudly instead.
select account_key, count(distinct currency) as currencies
from {{ ref('fact_invoices') }}
group by account_key
having count(distinct currency) > 1
```

## data/snowflake/dbt/tests/assert_payments_do_not_exceed_invoice_total.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/dbt/tests/assert_payments_do_not_exceed_invoice_total.sql`.

```sql
-- Net collected cash on an invoice must never exceed its total: an overpayment
-- means a double capture or a missing refund record upstream.
select
    i.invoice_id,
    i.invoice_number,
    i.total_minor,
    sum(p.net_collected_minor) as collected_minor
from {{ ref('fact_invoices') }} i
join {{ ref('fact_payments') }} p on p.invoice_id = i.invoice_id
where not i.is_void
group by i.invoice_id, i.invoice_number, i.total_minor
having sum(p.net_collected_minor) > i.total_minor
```

## data/snowflake/setup/00_platform.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/setup/00_platform.sql`.

```sql
-- =============================================================================
-- Platform objects: roles, warehouses, databases, schemas and grants.
-- Run as SECURITYADMIN / SYSADMIN. Idempotent: safe to re-run.
--
-- Role hierarchy (functional roles roll up to SYSADMIN):
--   UNITI_LOADER       -> writes RAW (Snowpipe, streams, tasks)
--   UNITI_TRANSFORMER  -> reads RAW, owns ANALYTICS (dbt)
--   UNITI_REPORTER     -> reads ANALYTICS.MARTS (BI tools)
--   UNITI_PII_READER   -> granted on top of REPORTER to see unmasked PII
--   UNITI_GOVERNANCE   -> owns tags, masking and row access policies
-- =============================================================================

USE ROLE SECURITYADMIN;

CREATE ROLE IF NOT EXISTS UNITI_LOADER      COMMENT = 'Ingestion: Snowpipe, streams and tasks into RAW';
CREATE ROLE IF NOT EXISTS UNITI_TRANSFORMER COMMENT = 'dbt: builds STAGING and MARTS from RAW';
CREATE ROLE IF NOT EXISTS UNITI_REPORTER    COMMENT = 'Read-only access to MARTS for BI';
CREATE ROLE IF NOT EXISTS UNITI_PII_READER  COMMENT = 'Sees unmasked customer PII; audited';
CREATE ROLE IF NOT EXISTS UNITI_GOVERNANCE  COMMENT = 'Owns tags, masking and row access policies';

GRANT ROLE UNITI_LOADER      TO ROLE SYSADMIN;
GRANT ROLE UNITI_TRANSFORMER TO ROLE SYSADMIN;
GRANT ROLE UNITI_REPORTER    TO ROLE UNITI_TRANSFORMER;
GRANT ROLE UNITI_PII_READER  TO ROLE SYSADMIN;
GRANT ROLE UNITI_GOVERNANCE  TO ROLE SYSADMIN;

-- Service users authenticate with key-pair auth; public keys are set out of band.
CREATE USER IF NOT EXISTS SVC_UNITI_LOADER
  DEFAULT_ROLE = UNITI_LOADER DEFAULT_WAREHOUSE = UNITI_LOADING_WH
  TYPE = SERVICE COMMENT = 'Ingestion service account';
CREATE USER IF NOT EXISTS SVC_UNITI_DBT
  DEFAULT_ROLE = UNITI_TRANSFORMER DEFAULT_WAREHOUSE = UNITI_TRANSFORMING_WH
  TYPE = SERVICE COMMENT = 'dbt Cloud / CI service account';
GRANT ROLE UNITI_LOADER      TO USER SVC_UNITI_LOADER;
GRANT ROLE UNITI_TRANSFORMER TO USER SVC_UNITI_DBT;

-- -----------------------------------------------------------------------------
-- Warehouses: separated so ingestion bursts never queue behind BI queries.
-- -----------------------------------------------------------------------------
USE ROLE SYSADMIN;

CREATE WAREHOUSE IF NOT EXISTS UNITI_LOADING_WH
  WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'Tasks and ad-hoc loads';
CREATE WAREHOUSE IF NOT EXISTS UNITI_TRANSFORMING_WH
  WAREHOUSE_SIZE = SMALL AUTO_SUSPEND = 120 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  COMMENT = 'dbt runs';
CREATE WAREHOUSE IF NOT EXISTS UNITI_REPORTING_WH
  WAREHOUSE_SIZE = SMALL AUTO_SUSPEND = 300 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE
  MIN_CLUSTER_COUNT = 1 MAX_CLUSTER_COUNT = 3 SCALING_POLICY = STANDARD
  COMMENT = 'BI dashboards; multi-cluster for month-end concurrency';

CREATE RESOURCE MONITOR IF NOT EXISTS UNITI_MONTHLY_QUOTA
  WITH CREDIT_QUOTA = 600 FREQUENCY = MONTHLY START_TIMESTAMP = IMMEDIATELY
  TRIGGERS ON 75 PERCENT DO NOTIFY
           ON 90 PERCENT DO NOTIFY
           ON 100 PERCENT DO SUSPEND;
ALTER WAREHOUSE UNITI_LOADING_WH      SET RESOURCE_MONITOR = UNITI_MONTHLY_QUOTA;
ALTER WAREHOUSE UNITI_TRANSFORMING_WH SET RESOURCE_MONITOR = UNITI_MONTHLY_QUOTA;
ALTER WAREHOUSE UNITI_REPORTING_WH    SET RESOURCE_MONITOR = UNITI_MONTHLY_QUOTA;

-- -----------------------------------------------------------------------------
-- Databases and schemas
-- -----------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS UNITI_RAW
  DATA_RETENTION_TIME_IN_DAYS = 7 COMMENT = 'Landed source data, append-only';
CREATE SCHEMA IF NOT EXISTS UNITI_RAW.ECOM      COMMENT = 'eCom GoKinetic (MongoDB change streams)';
CREATE SCHEMA IF NOT EXISTS UNITI_RAW.UCONNECT  COMMENT = 'Uconnect accounts, billing, tickets (SQL Server CDC)';
CREATE SCHEMA IF NOT EXISTS UNITI_RAW.ICONNECT  COMMENT = 'iConnect wholesale orders';
CREATE SCHEMA IF NOT EXISTS UNITI_RAW.CATALOG   COMMENT = 'Product catalogue snapshots';
CREATE SCHEMA IF NOT EXISTS UNITI_RAW.INGEST    COMMENT = 'Stages, file formats, pipes';

CREATE DATABASE IF NOT EXISTS UNITI_ANALYTICS
  DATA_RETENTION_TIME_IN_DAYS = 14 COMMENT = 'dbt-managed models';
CREATE SCHEMA IF NOT EXISTS UNITI_ANALYTICS.STAGING WITH MANAGED ACCESS;
CREATE SCHEMA IF NOT EXISTS UNITI_ANALYTICS.MARTS   WITH MANAGED ACCESS;
CREATE SCHEMA IF NOT EXISTS UNITI_ANALYTICS.GOVERNANCE WITH MANAGED ACCESS
  COMMENT = 'Tags, masking and row access policies, entitlement mapping';

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
USE ROLE SECURITYADMIN;

GRANT USAGE, OPERATE ON WAREHOUSE UNITI_LOADING_WH      TO ROLE UNITI_LOADER;
GRANT USAGE, OPERATE ON WAREHOUSE UNITI_TRANSFORMING_WH TO ROLE UNITI_TRANSFORMER;
GRANT USAGE          ON WAREHOUSE UNITI_REPORTING_WH    TO ROLE UNITI_REPORTER;

-- Loader owns everything it creates in RAW.
GRANT USAGE ON DATABASE UNITI_RAW TO ROLE UNITI_LOADER;
GRANT USAGE, CREATE TABLE, CREATE STAGE, CREATE FILE FORMAT, CREATE PIPE, CREATE STREAM, CREATE TASK
  ON ALL SCHEMAS IN DATABASE UNITI_RAW TO ROLE UNITI_LOADER;
GRANT USAGE, CREATE TABLE, CREATE STAGE, CREATE FILE FORMAT, CREATE PIPE, CREATE STREAM, CREATE TASK
  ON FUTURE SCHEMAS IN DATABASE UNITI_RAW TO ROLE UNITI_LOADER;
GRANT EXECUTE TASK, EXECUTE MANAGED TASK, EXECUTE ALERT ON ACCOUNT TO ROLE UNITI_LOADER;
-- ACCOUNT_USAGE.COPY_HISTORY powers the ingestion health alert.
GRANT DATABASE ROLE SNOWFLAKE.USAGE_VIEWER TO ROLE UNITI_LOADER;

USE ROLE ACCOUNTADMIN;
CREATE NOTIFICATION INTEGRATION IF NOT EXISTS UNITI_DATA_ALERTS
  TYPE = EMAIL ENABLED = TRUE
  ALLOWED_RECIPIENTS = ('data-platform-oncall@uniti.com');
GRANT USAGE ON INTEGRATION UNITI_DATA_ALERTS TO ROLE UNITI_LOADER;
USE ROLE SECURITYADMIN;

-- Transformer reads RAW and builds ANALYTICS.
GRANT USAGE ON DATABASE UNITI_RAW TO ROLE UNITI_TRANSFORMER;
GRANT USAGE ON ALL SCHEMAS    IN DATABASE UNITI_RAW TO ROLE UNITI_TRANSFORMER;
GRANT USAGE ON FUTURE SCHEMAS IN DATABASE UNITI_RAW TO ROLE UNITI_TRANSFORMER;
GRANT SELECT ON ALL TABLES    IN DATABASE UNITI_RAW TO ROLE UNITI_TRANSFORMER;
GRANT SELECT ON FUTURE TABLES IN DATABASE UNITI_RAW TO ROLE UNITI_TRANSFORMER;
GRANT USAGE ON DATABASE UNITI_ANALYTICS TO ROLE UNITI_TRANSFORMER;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA UNITI_ANALYTICS.STAGING TO ROLE UNITI_TRANSFORMER;
GRANT USAGE, CREATE TABLE, CREATE VIEW ON SCHEMA UNITI_ANALYTICS.MARTS   TO ROLE UNITI_TRANSFORMER;

-- Reporters see marts only; STAGING is an implementation detail.
GRANT USAGE ON DATABASE UNITI_ANALYTICS TO ROLE UNITI_REPORTER;
GRANT USAGE ON SCHEMA UNITI_ANALYTICS.MARTS TO ROLE UNITI_REPORTER;
GRANT SELECT ON FUTURE TABLES IN SCHEMA UNITI_ANALYTICS.MARTS TO ROLE UNITI_REPORTER;
GRANT SELECT ON FUTURE VIEWS  IN SCHEMA UNITI_ANALYTICS.MARTS TO ROLE UNITI_REPORTER;
GRANT SELECT ON ALL TABLES    IN SCHEMA UNITI_ANALYTICS.MARTS TO ROLE UNITI_REPORTER;
GRANT SELECT ON ALL VIEWS     IN SCHEMA UNITI_ANALYTICS.MARTS TO ROLE UNITI_REPORTER;

-- Governance owns the policy schema and may apply policies account-wide.
GRANT USAGE ON DATABASE UNITI_ANALYTICS TO ROLE UNITI_GOVERNANCE;
GRANT USAGE, CREATE TAG, CREATE MASKING POLICY, CREATE ROW ACCESS POLICY, CREATE TABLE
  ON SCHEMA UNITI_ANALYTICS.GOVERNANCE TO ROLE UNITI_GOVERNANCE;
GRANT APPLY MASKING POLICY, APPLY ROW ACCESS POLICY, APPLY TAG ON ACCOUNT TO ROLE UNITI_GOVERNANCE;
GRANT USAGE ON SCHEMA UNITI_ANALYTICS.GOVERNANCE TO ROLE UNITI_REPORTER;
GRANT USAGE ON SCHEMA UNITI_ANALYTICS.GOVERNANCE TO ROLE UNITI_TRANSFORMER;
```

## data/snowflake/setup/01_ingestion.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/setup/01_ingestion.sql`.

```sql
-- =============================================================================
-- Landing layer: storage integration, stages, raw tables and Snowpipes.
--
-- Sources publish newline-delimited JSON to s3://uniti-datalake-<env>/landing/<source>/<entity>/
-- (Debezium for Uconnect SQL Server, Mongo change streams for eCom, nightly
-- catalogue snapshots). Every raw table keeps the untouched payload plus load
-- metadata; parsing happens in streams/tasks and dbt staging, never here.
-- =============================================================================

USE ROLE ACCOUNTADMIN;

CREATE STORAGE INTEGRATION IF NOT EXISTS UNITI_DATALAKE_S3
  TYPE = EXTERNAL_STAGE
  STORAGE_PROVIDER = 'S3'
  ENABLED = TRUE
  STORAGE_AWS_ROLE_ARN = '&{datalake_role_arn}'
  STORAGE_ALLOWED_LOCATIONS = ('s3://uniti-datalake-&{env}/landing/');
GRANT USAGE ON INTEGRATION UNITI_DATALAKE_S3 TO ROLE UNITI_LOADER;

USE ROLE UNITI_LOADER;
USE WAREHOUSE UNITI_LOADING_WH;
USE SCHEMA UNITI_RAW.INGEST;

CREATE FILE FORMAT IF NOT EXISTS FF_NDJSON
  TYPE = JSON STRIP_OUTER_ARRAY = FALSE COMPRESSION = AUTO
  IGNORE_UTF8_ERRORS = FALSE ALLOW_DUPLICATE = FALSE;

CREATE STAGE IF NOT EXISTS STG_LANDING
  STORAGE_INTEGRATION = UNITI_DATALAKE_S3
  URL = 's3://uniti-datalake-&{env}/landing/'
  FILE_FORMAT = FF_NDJSON
  DIRECTORY = (ENABLE = TRUE AUTO_REFRESH = TRUE);

-- -----------------------------------------------------------------------------
-- Raw tables share one shape: payload + operation + source position + load audit.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS UNITI_RAW.ECOM.ORDERS_CDC (
    payload         VARIANT       NOT NULL,
    op              VARCHAR(1)    NOT NULL COMMENT 'c=create u=update d=delete r=snapshot read',
    source_ts       TIMESTAMP_TZ  NOT NULL COMMENT 'Commit time in the source system',
    source_position VARCHAR       NOT NULL COMMENT 'Resume token / LSN for ordering',
    _file_name      VARCHAR       NOT NULL,
    _file_row       NUMBER        NOT NULL,
    _loaded_at      TIMESTAMP_TZ  NOT NULL DEFAULT CURRENT_TIMESTAMP()
) CHANGE_TRACKING = TRUE;

CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.ACCOUNTS_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.INVOICES_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.PAYMENTS_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.SERVICES_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.TICKETS_CDC   LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.ICONNECT.ORDERS_CDC    LIKE UNITI_RAW.ECOM.ORDERS_CDC;

CREATE TABLE IF NOT EXISTS UNITI_RAW.CATALOG.PRODUCTS_SNAPSHOT (
    payload     VARIANT      NOT NULL,
    snapshot_on DATE         NOT NULL,
    _file_name  VARCHAR      NOT NULL,
    _loaded_at  TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

-- -----------------------------------------------------------------------------
-- Snowpipes. Envelope fields come from the CDC producer; the copy is a pure
-- projection so a pipe never fails on a payload schema change.
-- -----------------------------------------------------------------------------
CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_ECOM_ORDERS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.ECOM.ORDERS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT $1:after, $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:position::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/ecom/orders/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_ACCOUNTS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.ACCOUNTS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/accounts/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_INVOICES AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.INVOICES_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/invoices/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_PAYMENTS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.PAYMENTS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/payments/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_SERVICES AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.SERVICES_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/services/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_TICKETS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.TICKETS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/tickets/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_ICONNECT_ORDERS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.ICONNECT.ORDERS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/iconnect/orders/
)
ON_ERROR = SKIP_FILE;

-- Catalogue is a full daily snapshot; the partition date comes from the path
-- (catalog/products/snapshot_on=YYYY-MM-DD/part-0000.json).
CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_CATALOG_PRODUCTS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.CATALOG.PRODUCTS_SNAPSHOT (payload, snapshot_on, _file_name)
FROM (
    SELECT $1,
           TO_DATE(REGEXP_SUBSTR(METADATA$FILENAME, 'snapshot_on=(\\d{4}-\\d{2}-\\d{2})', 1, 1, 'e')),
           METADATA$FILENAME
    FROM @UNITI_RAW.INGEST.STG_LANDING/catalog/products/
)
ON_ERROR = ABORT_STATEMENT;

-- SQS ARN to configure on the bucket's event notifications:
--   SELECT "notification_channel" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) after SHOW PIPES;
-- Backfill after creating a pipe over existing files:
--   ALTER PIPE UNITI_RAW.INGEST.PIPE_ECOM_ORDERS REFRESH;
```

## data/snowflake/setup/02_streams_tasks.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/setup/02_streams_tasks.sql`.

```sql
-- =============================================================================
-- Incremental load: streams on the append-only CDC tables feed tasks that keep a
-- "latest state per business key" table (<ENTITY>_CURRENT). dbt staging models
-- read the _CURRENT tables, so they never have to deduplicate CDC history.
--
-- Ordering rule: the newest (source_ts, source_position) wins; an out-of-order
-- late event never overwrites a newer state. Deletes become tombstones
-- (is_deleted = TRUE) so downstream facts can still join historical keys.
-- =============================================================================

USE ROLE UNITI_LOADER;
USE WAREHOUSE UNITI_LOADING_WH;

CREATE OR REPLACE PROCEDURE UNITI_RAW.INGEST.MERGE_LATEST(
    STREAM_NAME VARCHAR, TARGET_TABLE VARCHAR, KEY_EXPR VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    merged INTEGER DEFAULT 0;
    stmt VARCHAR;
BEGIN
    stmt := 'CREATE TABLE IF NOT EXISTS ' || TARGET_TABLE || ' (
                 business_key    VARCHAR       NOT NULL PRIMARY KEY,
                 payload         VARIANT       NOT NULL,
                 is_deleted      BOOLEAN       NOT NULL,
                 source_ts       TIMESTAMP_TZ  NOT NULL,
                 source_position VARCHAR       NOT NULL,
                 _merged_at      TIMESTAMP_TZ  NOT NULL)';
    EXECUTE IMMEDIATE :stmt;

    -- Consuming the stream inside one DML statement advances its offset atomically.
    stmt := 'MERGE INTO ' || TARGET_TABLE || ' t
             USING (
                 SELECT ' || KEY_EXPR || ' AS business_key, payload, op = ''d'' AS is_deleted,
                        source_ts, source_position
                 FROM ' || STREAM_NAME || '
                 WHERE METADATA$ACTION = ''INSERT'' AND ' || KEY_EXPR || ' IS NOT NULL
                 QUALIFY ROW_NUMBER() OVER (
                     PARTITION BY ' || KEY_EXPR || '
                     ORDER BY source_ts DESC, source_position DESC) = 1
             ) s
             ON t.business_key = s.business_key
             WHEN MATCHED AND (s.source_ts > t.source_ts
                               OR (s.source_ts = t.source_ts AND s.source_position > t.source_position)) THEN UPDATE SET
                 payload = s.payload, is_deleted = s.is_deleted, source_ts = s.source_ts,
                 source_position = s.source_position, _merged_at = CURRENT_TIMESTAMP()
             WHEN NOT MATCHED THEN INSERT
                 (business_key, payload, is_deleted, source_ts, source_position, _merged_at)
                 VALUES (s.business_key, s.payload, s.is_deleted, s.source_ts, s.source_position, CURRENT_TIMESTAMP())';
    EXECUTE IMMEDIATE :stmt;
    merged := SQLROWCOUNT;
    RETURN TARGET_TABLE || ': ' || merged || ' row(s) merged';
END;
$$;

-- -----------------------------------------------------------------------------
-- Streams (append-only: CDC tables are never updated in place)
-- -----------------------------------------------------------------------------
CREATE STREAM IF NOT EXISTS UNITI_RAW.ECOM.ORDERS_STREAM       ON TABLE UNITI_RAW.ECOM.ORDERS_CDC       APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.ACCOUNTS_STREAM ON TABLE UNITI_RAW.UCONNECT.ACCOUNTS_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.INVOICES_STREAM ON TABLE UNITI_RAW.UCONNECT.INVOICES_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.PAYMENTS_STREAM ON TABLE UNITI_RAW.UCONNECT.PAYMENTS_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.SERVICES_STREAM ON TABLE UNITI_RAW.UCONNECT.SERVICES_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.TICKETS_STREAM  ON TABLE UNITI_RAW.UCONNECT.TICKETS_CDC  APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.ICONNECT.ORDERS_STREAM   ON TABLE UNITI_RAW.ICONNECT.ORDERS_CDC   APPEND_ONLY = TRUE;

-- Ticket status transitions are kept as history (not latest-state) because the
-- SLA clock needs every PENDING_CUSTOMER interval.
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.TICKETS_HISTORY_STREAM
    ON TABLE UNITI_RAW.UCONNECT.TICKETS_CDC APPEND_ONLY = TRUE;

CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.TICKET_STATUS_EVENTS (
    ticket_id   VARCHAR      NOT NULL,
    status      VARCHAR      NOT NULL,
    priority    VARCHAR      NOT NULL,
    changed_at  TIMESTAMP_TZ NOT NULL,
    source_position VARCHAR  NOT NULL,
    CONSTRAINT uq_ticket_status_event UNIQUE (ticket_id, source_position)
);

-- -----------------------------------------------------------------------------
-- Tasks: serverless, each guarded by SYSTEM$STREAM_HAS_DATA so an idle source
-- costs nothing. Five-minute cadence matches the Kibana/Dynatrace freshness SLO.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_ECOM_ORDERS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.ECOM.ORDERS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.ECOM.ORDERS_STREAM', 'UNITI_RAW.ECOM.ORDERS_CURRENT', 'payload:orderNumber::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_ACCOUNTS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.ACCOUNTS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.ACCOUNTS_STREAM', 'UNITI_RAW.UCONNECT.ACCOUNTS_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_INVOICES
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.INVOICES_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.INVOICES_STREAM', 'UNITI_RAW.UCONNECT.INVOICES_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_PAYMENTS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.PAYMENTS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.PAYMENTS_STREAM', 'UNITI_RAW.UCONNECT.PAYMENTS_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_SERVICES
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.SERVICES_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.SERVICES_STREAM', 'UNITI_RAW.UCONNECT.SERVICES_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_TICKETS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.TICKETS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.TICKETS_STREAM', 'UNITI_RAW.UCONNECT.TICKETS_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_ICONNECT_ORDERS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.ICONNECT.ORDERS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.ICONNECT.ORDERS_STREAM', 'UNITI_RAW.ICONNECT.ORDERS_CURRENT', 'payload:Id::VARCHAR');

-- Only rows whose status actually changed are recorded; a ticket edit that keeps
-- the status (e.g. a new comment) produces no event.
CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_TICKET_STATUS_EVENTS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.TICKETS_HISTORY_STREAM')
AS
INSERT INTO UNITI_RAW.UCONNECT.TICKET_STATUS_EVENTS (ticket_id, status, priority, changed_at, source_position)
WITH batch AS (
    SELECT payload:Id::VARCHAR                AS ticket_id,
           payload:Status::VARCHAR            AS status,
           payload:Priority::VARCHAR          AS priority,
           source_ts                          AS changed_at,
           source_position,
           LAG(payload:Status::VARCHAR) OVER (
               PARTITION BY payload:Id ORDER BY source_ts, source_position) AS previous_in_batch
    FROM UNITI_RAW.UCONNECT.TICKETS_HISTORY_STREAM
    WHERE METADATA$ACTION = 'INSERT' AND op <> 'd'
),
last_persisted AS (
    SELECT ticket_id, status AS last_status
    FROM UNITI_RAW.UCONNECT.TICKET_STATUS_EVENTS
    WHERE ticket_id IN (SELECT ticket_id FROM batch)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY changed_at DESC, source_position DESC) = 1
)
SELECT b.ticket_id, b.status, b.priority, b.changed_at, b.source_position
FROM batch b
LEFT JOIN last_persisted l ON l.ticket_id = b.ticket_id
WHERE COALESCE(b.previous_in_batch, l.last_status) IS DISTINCT FROM b.status;

ALTER TASK UNITI_RAW.INGEST.TSK_ECOM_ORDERS          RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_ACCOUNTS    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_INVOICES    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_PAYMENTS    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_SERVICES    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_TICKETS     RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_ICONNECT_ORDERS      RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_TICKET_STATUS_EVENTS RESUME;

-- -----------------------------------------------------------------------------
-- Freshness alert: any pipe with load errors, or a stream at risk of going stale
-- (stale streams lose their offset and require a full reload).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE ALERT UNITI_RAW.INGEST.ALR_INGEST_HEALTH
    WAREHOUSE = UNITI_LOADING_WH
    SCHEDULE = '30 MINUTE'
    IF (EXISTS (
        SELECT 1
        FROM SNOWFLAKE.ACCOUNT_USAGE.COPY_HISTORY
        WHERE table_catalog_name = 'UNITI_RAW'
          AND pipe_name IS NOT NULL
          AND status <> 'Loaded'
          AND last_load_time > DATEADD(HOUR, -3, CURRENT_TIMESTAMP())
        UNION ALL
        SELECT 1
        FROM UNITI_RAW.INFORMATION_SCHEMA.TABLES t
        WHERE t.table_schema IN ('ECOM', 'UCONNECT', 'ICONNECT')
          AND t.table_name LIKE '%\\_CURRENT' ESCAPE '\\'
          AND t.last_altered < DATEADD(HOUR, -6, CURRENT_TIMESTAMP())
    ))
    THEN CALL SYSTEM$SEND_EMAIL(
        'UNITI_DATA_ALERTS',
        'data-platform-oncall@uniti.com',
        'Snowflake ingestion degraded',
        'A Snowpipe reported load errors or a _CURRENT table has not merged for 6h. See runbook: observability/runbooks/selfcare-incident-runbook.md#data-freshness');
ALTER ALERT UNITI_RAW.INGEST.ALR_INGEST_HEALTH RESUME;
```

## data/snowflake/setup/03_governance.sql

Application: Data warehouse and analytics. Stack: Snowflake SQL, dbt. Language: sql. Path: `data/snowflake/setup/03_governance.sql`.

```sql
-- =============================================================================
-- Governance: PII classification tags, tag-based masking, and segment-level row
-- access for the marts.
--
-- Masking is attached to the PII_CLASS tag, not to individual columns: dbt sets
-- the tag on a column (see the `pii_class` meta + apply_pii_tags macro) and the
-- right policy follows automatically, including on models created later.
-- =============================================================================

USE ROLE UNITI_GOVERNANCE;
USE SCHEMA UNITI_ANALYTICS.GOVERNANCE;

CREATE TAG IF NOT EXISTS PII_CLASS
  ALLOWED_VALUES 'EMAIL', 'PHONE', 'NAME', 'ADDRESS', 'PAYMENT_CARD'
  COMMENT = 'Personal data category; drives masking';

-- UNITI_PII_READER and UNITI_TRANSFORMER (which needs clear text to build joins)
-- see unmasked values; every query by those roles is in ACCESS_HISTORY.
CREATE MASKING POLICY IF NOT EXISTS MASK_PII_STRING AS (val VARCHAR) RETURNS VARCHAR ->
  CASE
    WHEN val IS NULL
      OR IS_ROLE_IN_SESSION('UNITI_PII_READER') OR IS_ROLE_IN_SESSION('UNITI_TRANSFORMER') THEN val
    WHEN SYSTEM$GET_TAG_ON_CURRENT_COLUMN('UNITI_ANALYTICS.GOVERNANCE.PII_CLASS') = 'EMAIL'
      -- Keep the domain: lets analysts segment consumer vs business mailboxes.
      THEN '***@' || SPLIT_PART(val, '@', 2)
    WHEN SYSTEM$GET_TAG_ON_CURRENT_COLUMN('UNITI_ANALYTICS.GOVERNANCE.PII_CLASS') = 'PHONE'
      THEN REPEAT('*', GREATEST(LENGTH(val) - 4, 0)) || RIGHT(val, 4)
    WHEN SYSTEM$GET_TAG_ON_CURRENT_COLUMN('UNITI_ANALYTICS.GOVERNANCE.PII_CLASS') = 'PAYMENT_CARD'
      THEN 'XXXX'
    ELSE '** redacted **'
  END
  COMMENT = 'Tag-driven masking for string PII';

-- Hash variant for columns analysts must still join or count distinct on.
CREATE MASKING POLICY IF NOT EXISTS MASK_PII_HASH AS (val VARCHAR) RETURNS VARCHAR ->
  CASE
    WHEN val IS NULL
      OR IS_ROLE_IN_SESSION('UNITI_PII_READER') OR IS_ROLE_IN_SESSION('UNITI_TRANSFORMER') THEN val
    ELSE SHA2(LOWER(TRIM(val)) || '|uniti-selfcare', 256)
  END
  COMMENT = 'Deterministic pseudonymisation; join-safe';

ALTER TAG PII_CLASS SET MASKING POLICY MASK_PII_STRING;

-- -----------------------------------------------------------------------------
-- Row access: which customer segments each analyst role may see. Business and
-- wholesale revenue are commercially sensitive outside their own teams.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SEGMENT_ENTITLEMENTS (
    role_name VARCHAR NOT NULL,
    segment   VARCHAR NOT NULL,
    granted_by VARCHAR NOT NULL DEFAULT CURRENT_USER(),
    granted_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_segment_entitlements PRIMARY KEY (role_name, segment)
);

MERGE INTO SEGMENT_ENTITLEMENTS t
USING (
    SELECT * FROM VALUES
        ('UNITI_REPORTER',        'CONSUMER'),
        ('UNITI_B2B_ANALYST',     'CONSUMER'),
        ('UNITI_B2B_ANALYST',     'BUSINESS'),
        ('UNITI_WHOLESALE_ANALYST', 'WHOLESALE'),
        ('UNITI_FINANCE_ANALYST', 'CONSUMER'),
        ('UNITI_FINANCE_ANALYST', 'BUSINESS'),
        ('UNITI_FINANCE_ANALYST', 'WHOLESALE')
        AS v(role_name, segment)
) s
ON t.role_name = s.role_name AND t.segment = s.segment
WHEN NOT MATCHED THEN INSERT (role_name, segment) VALUES (s.role_name, s.segment);

CREATE ROW ACCESS POLICY IF NOT EXISTS RAP_SEGMENT AS (segment VARCHAR) RETURNS BOOLEAN ->
  IS_ROLE_IN_SESSION('UNITI_TRANSFORMER')
  OR IS_ROLE_IN_SESSION('UNITI_GOVERNANCE')
  OR EXISTS (
      SELECT 1
      FROM UNITI_ANALYTICS.GOVERNANCE.SEGMENT_ENTITLEMENTS e
      WHERE e.segment = segment
        AND IS_ROLE_IN_SESSION(e.role_name)
  )
  COMMENT = 'Restricts mart rows to segments the session roles are entitled to';

-- Analyst roles referenced above; each inherits REPORTER's object grants.
USE ROLE SECURITYADMIN;
CREATE ROLE IF NOT EXISTS UNITI_B2B_ANALYST;
CREATE ROLE IF NOT EXISTS UNITI_WHOLESALE_ANALYST;
CREATE ROLE IF NOT EXISTS UNITI_FINANCE_ANALYST;
GRANT ROLE UNITI_REPORTER TO ROLE UNITI_B2B_ANALYST;
GRANT ROLE UNITI_REPORTER TO ROLE UNITI_WHOLESALE_ANALYST;
GRANT ROLE UNITI_REPORTER TO ROLE UNITI_FINANCE_ANALYST;
GRANT ROLE UNITI_B2B_ANALYST       TO ROLE SYSADMIN;
GRANT ROLE UNITI_WHOLESALE_ANALYST TO ROLE SYSADMIN;
GRANT ROLE UNITI_FINANCE_ANALYST   TO ROLE SYSADMIN;

-- dbt attaches RAP_SEGMENT to each mart with a `segment` column via the
-- apply_segment_policy post-hook; it needs to reference the policy.
USE ROLE UNITI_GOVERNANCE;
GRANT APPLY ON ROW ACCESS POLICY UNITI_ANALYTICS.GOVERNANCE.RAP_SEGMENT TO ROLE UNITI_TRANSFORMER;
GRANT APPLY ON TAG UNITI_ANALYTICS.GOVERNANCE.PII_CLASS TO ROLE UNITI_TRANSFORMER;

-- -----------------------------------------------------------------------------
-- Audit helper: who read clear-text PII in the last 30 days.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE SECURE VIEW PII_ACCESS_AUDIT AS
SELECT ah.query_start_time,
       ah.user_name,
       q.role_name,
       obj.value:"objectName"::VARCHAR AS object_name,
       col.value:"columnName"::VARCHAR AS column_name
FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY ah
JOIN SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY q ON q.query_id = ah.query_id,
     LATERAL FLATTEN(ah.base_objects_accessed) obj,
     LATERAL FLATTEN(obj.value:"columns") col
JOIN SNOWFLAKE.ACCOUNT_USAGE.TAG_REFERENCES tr
  ON tr.tag_name = 'PII_CLASS'
 AND tr.domain = 'COLUMN'
 AND tr.object_database || '.' || tr.object_schema || '.' || tr.object_name = obj.value:"objectName"::VARCHAR
 AND tr.column_name = col.value:"columnName"::VARCHAR
WHERE ah.query_start_time > DATEADD(DAY, -30, CURRENT_TIMESTAMP())
  AND q.role_name IN ('UNITI_PII_READER', 'UNITI_TRANSFORMER');
```
