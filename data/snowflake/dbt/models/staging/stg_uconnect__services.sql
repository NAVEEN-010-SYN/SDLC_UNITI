select
    business_key                                     as service_id,
    payload:AccountId::varchar                       as account_id,
    {{ enum_code('payload:ProductType::varchar') }}  as product_family,
    upper(payload:PlanCode::varchar)                 as plan_code,
    {{ enum_code('payload:Status::varchar') }}       as service_status,
    {{ minor_units('payload:MonthlyPrice_MinorUnits') }} as monthly_price_minor,
    upper(payload:MonthlyPrice_Currency::varchar)    as currency,
    payload:ActivatedOn::date                        as activated_on,
    payload:CancelledOn::date                        as cancelled_on,
    payload:ContractEndsOn::date                     as contract_ends_on,
    is_deleted
from {{ source('uconnect', 'services_current') }}
