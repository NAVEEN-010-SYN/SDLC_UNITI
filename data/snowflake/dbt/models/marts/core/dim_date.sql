-- Calendar from 2020-01-01 for 15 years. date_key is YYYYMMDD for compact joins.
with days as (
    select dateadd(day, seq4(), '2020-01-01'::date) as calendar_date
    from table(generator(rowcount => 5479))
)

select
    to_number(to_char(calendar_date, 'YYYYMMDD'))   as date_key,
    calendar_date,
    date_trunc('month', calendar_date)              as month_start,
    last_day(calendar_date, 'month')                as month_end,
    date_trunc('quarter', calendar_date)            as quarter_start,
    year(calendar_date)                             as calendar_year,
    quarter(calendar_date)                          as calendar_quarter,
    month(calendar_date)                            as calendar_month,
    monthname(calendar_date)                        as month_name,
    dayofweekiso(calendar_date)                     as iso_day_of_week,
    dayname(calendar_date)                          as day_name,
    weekiso(calendar_date)                          as iso_week,
    dayofweekiso(calendar_date) between 1 and 5     as is_weekday,
    calendar_date = last_day(calendar_date, 'month') as is_month_end
from days
