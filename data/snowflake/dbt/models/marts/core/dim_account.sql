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
