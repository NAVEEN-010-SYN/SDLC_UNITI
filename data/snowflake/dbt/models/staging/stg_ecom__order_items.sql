-- One row per order line. Monetary unit prices stay in minor units; extended
-- amounts are computed in the fact so quantity changes never desync them.
select
    o.business_key                                       as order_number,
    item.index + 1                                       as line_number,
    upper(item.value:sku::varchar)                       as sku,
    {{ enum_code('item.value:productType::varchar') }}   as product_type,
    item.value:quantity::integer                         as quantity,
    {{ minor_units('item.value:unitMonthly') }}          as unit_monthly_minor,
    {{ minor_units('item.value:unitOneTime') }}          as unit_one_time_minor,
    {{ minor_units('item.value:unitInstallation') }}     as unit_installation_minor
from {{ source('ecom', 'orders_current') }} o,
     lateral flatten(input => o.payload:items) item
where not o.is_deleted
