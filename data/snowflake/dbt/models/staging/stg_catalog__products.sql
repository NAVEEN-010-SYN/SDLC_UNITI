-- Daily full snapshots collapsed into validity ranges, so facts can price
-- against the catalogue as it was on the order date.
with snapshots as (
    select
        upper(payload:sku::varchar)                       as sku,
        payload:name::varchar                             as product_name,
        {{ enum_code('payload:productType::varchar') }}   as product_type,
        {{ enum_code('payload:family::varchar') }}        as product_family,
        payload:downloadMbps::integer                     as download_mbps,
        payload:uploadMbps::integer                       as upload_mbps,
        {{ minor_units('payload:monthlyPrice') }}         as list_monthly_minor,
        upper(payload:currency::varchar)                  as currency,
        payload:active::boolean                           as is_active,
        snapshot_on
    from {{ source('catalog', 'products_snapshot') }}
),

changes as (
    select
        *,
        hash(product_name, product_type, product_family, download_mbps, upload_mbps,
             list_monthly_minor, currency, is_active) as row_hash,
        lag(hash(product_name, product_type, product_family, download_mbps, upload_mbps,
                 list_monthly_minor, currency, is_active))
            over (partition by sku order by snapshot_on) as previous_hash
    from snapshots
)

select
    sku,
    product_name,
    product_type,
    product_family,
    download_mbps,
    upload_mbps,
    list_monthly_minor,
    currency,
    is_active,
    snapshot_on                                                       as valid_from,
    lead(snapshot_on) over (partition by sku order by snapshot_on)    as valid_to
from changes
where previous_hash is null or previous_hash <> row_hash
