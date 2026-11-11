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
