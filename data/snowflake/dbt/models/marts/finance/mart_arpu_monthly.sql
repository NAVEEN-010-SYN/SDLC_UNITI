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
