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
