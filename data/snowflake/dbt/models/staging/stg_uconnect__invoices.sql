select
    business_key                                      as invoice_id,
    payload:InvoiceNumber::varchar                    as invoice_number,
    payload:AccountId::varchar                        as account_id,
    {{ enum_code('payload:Status::varchar') }}        as invoice_status,
    payload:PeriodStart::date                         as period_start,
    payload:PeriodEnd::date                           as period_end,
    payload:IssuedOn::date                            as issued_on,
    payload:DueOn::date                               as due_on,
    payload:PaidAt::timestamp_tz                      as paid_at,
    upper(payload:Currency::varchar)                  as currency,
    {{ minor_units('payload:Subtotal_MinorUnits') }}  as subtotal_minor,
    {{ minor_units('payload:TaxTotal_MinorUnits') }}  as tax_minor,
    {{ minor_units('payload:Total_MinorUnits') }}     as total_minor,
    {{ minor_units('payload:AmountPaid_MinorUnits') }} as amount_paid_minor,
    payload:TaxRateBasisPoints::integer               as tax_rate_bps,
    payload:CreatedAt::timestamp_tz                   as created_at,
    is_deleted
from {{ source('uconnect', 'invoices_current') }}
