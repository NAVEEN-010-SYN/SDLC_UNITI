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
