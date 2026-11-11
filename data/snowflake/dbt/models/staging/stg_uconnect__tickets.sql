select
    business_key                                   as ticket_id,
    payload:TicketNumber::varchar                  as ticket_number,
    payload:AccountId::varchar                     as account_id,
    {{ enum_code('payload:Priority::varchar') }}   as priority,
    {{ enum_code('payload:Status::varchar') }}     as ticket_status,
    {{ enum_code('payload:Category::varchar') }}   as category,
    payload:AssignedTo::varchar                    as assigned_to,
    payload:CreatedAt::timestamp_tz                as created_at,
    payload:FirstRespondedAt::timestamp_tz         as first_responded_at,
    payload:ResolvedAt::timestamp_tz               as resolved_at,
    payload:ClosedAt::timestamp_tz                 as closed_at,
    is_deleted
from {{ source('uconnect', 'tickets_current') }}
