{#
  In prod, models land in the exact schema configured (STAGING / MARTS) so the
  grants and policies in setup/ apply. Elsewhere they are prefixed with the
  target schema so developers and CI runs never collide.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if target.name == 'prod' and custom_schema_name is not none -%}
        {{ custom_schema_name | upper }}
    {%- elif custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ target.schema }}_{{ custom_schema_name }}
    {%- endif -%}
{%- endmacro %}

{# Normalises source enum spellings ("PendingCustomer", "pending customer") to PENDING_CUSTOMER. #}
{% macro enum_code(expr) -%}
    UPPER(REGEXP_REPLACE(REGEXP_REPLACE(TRIM({{ expr }}), '([a-z0-9])([A-Z])', '\\1_\\2'), '[\\s-]+', '_'))
{%- endmacro %}

{#
  Reads a money amount that must already be integer minor units. Anything with a
  fractional part fails the cast instead of being silently rounded.
#}
{% macro minor_units(expr) -%}
    CASE
        WHEN {{ expr }} IS NULL THEN NULL
        WHEN {{ expr }}::NUMBER(38, 6) = TRUNC({{ expr }}::NUMBER(38, 6)) THEN {{ expr }}::NUMBER(38, 0)
        -- Deliberate cast failure: aborts the model with the offending value in the error.
        ELSE TO_NUMBER('non-integer minor units: ' || {{ expr }}::VARCHAR)
    END
{%- endmacro %}
