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
