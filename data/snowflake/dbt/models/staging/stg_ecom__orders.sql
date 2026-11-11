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
