-- Net collected cash on an invoice must never exceed its total: an overpayment
-- means a double capture or a missing refund record upstream.
select
    i.invoice_id,
    i.invoice_number,
    i.total_minor,
    sum(p.net_collected_minor) as collected_minor
from {{ ref('fact_invoices') }} i
join {{ ref('fact_payments') }} p on p.invoice_id = i.invoice_id
where not i.is_void
group by i.invoice_id, i.invoice_number, i.total_minor
having sum(p.net_collected_minor) > i.total_minor
