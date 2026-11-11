-- Turns the status change log into closed intervals [entered_at, exited_at).
-- The last interval for an unresolved ticket is open (exited_at is null).
with events as (
    select
        ticket_id,
        {{ enum_code('status') }} as ticket_status,
        changed_at
    from {{ source('uconnect', 'ticket_status_events') }}
)

select
    ticket_id,
    ticket_status,
    changed_at                                                        as entered_at,
    lead(changed_at) over (partition by ticket_id order by changed_at) as exited_at
from events
