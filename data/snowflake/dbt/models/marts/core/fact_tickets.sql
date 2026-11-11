-- Grain: one support ticket, with first-response and resolution SLA outcomes.
--
-- SLA rules (agreed with Support Operations):
--   * Clocks run 24x7 from created_at; targets per priority come from the
--     ticket_sla_targets seed.
--   * The resolution clock pauses while the ticket is PENDING_CUSTOMER.
--   * The first-response clock never pauses.
--   * Open tickets are measured against now(); `*_breached` can flip from
--     false to true between runs, so `is_*_at_risk` flags the last 20%.
with tickets as (
    select *
    from {{ ref('stg_uconnect__tickets') }}
    where not is_deleted
),

targets as (
    select priority, first_response_minutes, resolution_minutes
    from {{ ref('ticket_sla_targets') }}
),

clock_end as (
    select
        ticket_id,
        coalesce(resolved_at, closed_at, current_timestamp()) as resolution_clock_end
    from tickets
),

paused as (
    -- Clip each PENDING_CUSTOMER interval to the part that falls before the
    -- resolution clock stopped.
    select
        i.ticket_id,
        sum(greatest(
            datediff(
                minute,
                i.entered_at,
                least(coalesce(i.exited_at, c.resolution_clock_end), c.resolution_clock_end)
            ),
            0
        )) as paused_minutes
    from {{ ref('stg_uconnect__ticket_status_intervals') }} i
    join clock_end c on c.ticket_id = i.ticket_id
    where i.ticket_status = 'PENDING_CUSTOMER'
      and i.entered_at < c.resolution_clock_end
    group by i.ticket_id
),

measured as (
    select
        t.*,
        tg.first_response_minutes                                      as first_response_target_minutes,
        tg.resolution_minutes                                          as resolution_target_minutes,
        coalesce(p.paused_minutes, 0)                                  as paused_minutes,
        datediff(minute, t.created_at, coalesce(t.first_responded_at, current_timestamp()))
                                                                       as first_response_elapsed_minutes,
        datediff(minute, t.created_at, c.resolution_clock_end) - coalesce(p.paused_minutes, 0)
                                                                       as resolution_elapsed_minutes
    from tickets t
    join clock_end c      on c.ticket_id = t.ticket_id
    left join targets tg  on tg.priority = t.priority
    left join paused p    on p.ticket_id = t.ticket_id
)

select
    m.ticket_id,
    m.ticket_number,
    a.account_key,
    a.segment,
    m.priority,
    m.ticket_status,
    m.category,
    to_number(to_char(m.created_at, 'YYYYMMDD'))                       as created_date_key,
    m.created_at,
    m.first_responded_at,
    m.resolved_at,
    m.closed_at,
    m.ticket_status in ('RESOLVED', 'CLOSED')                          as is_resolved,
    m.first_response_target_minutes,
    m.first_response_elapsed_minutes,
    m.first_response_elapsed_minutes > m.first_response_target_minutes as is_first_response_breached,
    m.resolution_target_minutes,
    m.paused_minutes,
    m.resolution_elapsed_minutes,
    m.resolution_elapsed_minutes > m.resolution_target_minutes         as is_resolution_breached,
    dateadd(minute, m.resolution_target_minutes + m.paused_minutes, m.created_at)
                                                                       as resolution_due_at,
    m.resolved_at is null
        and m.ticket_status not in ('RESOLVED', 'CLOSED')
        and m.resolution_elapsed_minutes <= m.resolution_target_minutes
        and m.resolution_elapsed_minutes * 5 >= m.resolution_target_minutes * 4
                                                                       as is_resolution_at_risk,
    greatest(m.resolution_elapsed_minutes - m.resolution_target_minutes, 0)
                                                                       as resolution_overrun_minutes
from measured m
left join {{ ref('dim_account') }} a on a.account_id = m.account_id
