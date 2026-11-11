-- Money is only summable within one currency. An account billed in more than one
-- currency would silently corrupt ARPU, so fail loudly instead.
select account_key, count(distinct currency) as currencies
from {{ ref('fact_invoices') }}
group by account_key
having count(distinct currency) > 1
