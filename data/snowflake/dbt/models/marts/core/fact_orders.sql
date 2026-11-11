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
