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
