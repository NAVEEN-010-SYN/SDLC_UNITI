-- Type-2 product dimension: one row per SKU per catalogue version.
-- Join facts on sku and the fact date between valid_from and valid_to.
select
    {{ dbt_utils.generate_surrogate_key(['sku', 'valid_from']) }} as product_key,
    sku,
    product_name,
    product_type,
    product_family,
    download_mbps,
    upload_mbps,
    case
        when download_mbps is null then null
        when download_mbps < 500  then 'UNDER_500M'
        when download_mbps < 1000 then '500M'
        when download_mbps < 2000 then '1G'
        else '2G_PLUS'
    end                                                    as speed_tier,
    list_monthly_minor,
    currency,
    is_active,
    valid_from,
    coalesce(valid_to, '9999-12-31'::date)                 as valid_to,
    valid_to is null                                       as is_current
from {{ ref('stg_catalog__products') }}
