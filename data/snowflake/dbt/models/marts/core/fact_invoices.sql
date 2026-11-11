-- Grain: one issued (non-draft) invoice. Balances are as of the model run.
with invoices as (
    select *
    from {{ ref('stg_uconnect__invoices') }}
    where not is_deleted
      and invoice_status <> 'DRAFT'
),

accounts as (
    select account_id, account_key, segment
    from {{ ref('dim_account') }}
    where account_id is not null
)

select
    i.invoice_id,
    i.invoice_number,
    a.account_key,
    a.segment,
    i.invoice_status,
    i.currency,
    date_trunc('month', i.period_start)                         as billing_month,
    i.period_start,
    i.period_end,
    to_number(to_char(i.issued_on, 'YYYYMMDD'))                 as issued_date_key,
    i.issued_on,
    i.due_on,
    i.paid_at,
    i.subtotal_minor,
    i.tax_minor,
    i.total_minor,
    i.amount_paid_minor,
    case
        when i.invoice_status = 'VOID' or i.total_minor < 0 then 0
        else i.total_minor - i.amount_paid_minor
    end                                                         as balance_due_minor,
    i.tax_rate_bps,
    i.invoice_status = 'VOID'                                   as is_void,
    i.invoice_status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')
        and i.due_on < current_date()                           as is_past_due,
    case
        when i.invoice_status in ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') and i.due_on < current_date()
        then datediff(day, i.due_on, current_date())
        else 0
    end                                                         as days_past_due,
    case
        when i.paid_at is not null then datediff(day, i.issued_on, i.paid_at::date)
    end                                                         as days_to_pay
from invoices i
left join accounts a on a.account_id = i.account_id
