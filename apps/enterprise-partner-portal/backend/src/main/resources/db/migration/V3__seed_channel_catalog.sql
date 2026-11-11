-- Channel price list (GBP, minor units). Floor prices are the lowest net monthly price Uniti
-- accepts after all discounts.

INSERT INTO catalog_product (id, sku, name, category, bandwidth_mbps, monthly_price_minor, install_price_minor,
                             floor_monthly_price_minor, min_term_months, per_site, currency, active)
VALUES
    (gen_random_uuid(), 'FBB-BUS-100',  'Business Fibre 100 Mbps',      'BROADBAND', 100,  3500,  9900,  2600, 12, true,  'GBP', true),
    (gen_random_uuid(), 'FBB-BUS-500',  'Business Fibre 500 Mbps',      'BROADBAND', 500,  5500,  9900,  4000, 12, true,  'GBP', true),
    (gen_random_uuid(), 'FBB-BUS-1000', 'Business Fibre 1 Gbps',        'BROADBAND', 1000, 7900,  9900,  5800, 12, true,  'GBP', true),
    (gen_random_uuid(), 'FBB-BUS-2000', 'Business Fibre 2 Gbps',        'BROADBAND', 2000, 12900, 14900, 9500, 24, true,  'GBP', true),
    (gen_random_uuid(), 'VOI-SIP-CH',   'Hosted SIP channel',           'VOICE',     NULL, 450,   0,     320,  12, false, 'GBP', true),
    (gen_random_uuid(), 'VOI-HV-SEAT',  'Hosted Voice seat',            'VOICE',     NULL, 1200,  1500,  850,  12, false, 'GBP', true),
    (gen_random_uuid(), 'SDW-VC-EDGE',  'SD-WAN Edge (VeloCloud)',      'SDWAN',     NULL, 18500, 25000, 14000, 36, true, 'GBP', true),
    (gen_random_uuid(), 'SDW-FG-EDGE',  'SD-WAN Edge (Fortinet)',       'SDWAN',     NULL, 16500, 25000, 12500, 36, true, 'GBP', true),
    (gen_random_uuid(), 'HST-EMAIL',    'Hosted email mailbox',         'HOSTED',    NULL, 400,   0,     280,  12, false, 'GBP', true),
    (gen_random_uuid(), 'HST-WEB-PRO',  'Managed web hosting (Pro)',    'HOSTED',    NULL, 2500,  5000,  1800, 12, true,  'GBP', true),
    (gen_random_uuid(), 'ADD-STATIC-8', 'Static IPv4 block (/29)',      'ADD_ON',    NULL, 1000,  0,     700,  12, true,  'GBP', true),
    (gen_random_uuid(), 'ADD-4G-BKP',   '4G backup with failover',      'ADD_ON',    NULL, 2000,  4900,  1400, 12, true,  'GBP', true);
