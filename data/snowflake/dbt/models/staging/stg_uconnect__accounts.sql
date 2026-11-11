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
