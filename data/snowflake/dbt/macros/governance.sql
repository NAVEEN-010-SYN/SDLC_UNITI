{#
  Sets the PII_CLASS tag on every column whose schema.yml entry declares
  `meta: { pii_class: EMAIL|PHONE|NAME|ADDRESS|PAYMENT_CARD }`. The tag carries
  the masking policy (setup/03_governance.sql), so tagging is all that is needed.
#}
{% macro apply_pii_tags() -%}
    {%- if not execute -%}{{ return('') }}{%- endif -%}
    {%- set statements = [] -%}
    {%- for column_name, column in model.columns.items() -%}
        {%- set pii_class = column.meta.get('pii_class') -%}
        {%- if pii_class -%}
            {%- do statements.append(
                "ALTER TABLE " ~ this ~ " MODIFY COLUMN " ~ adapter.quote(column_name | upper)
                ~ " SET TAG UNITI_ANALYTICS.GOVERNANCE.PII_CLASS = '" ~ pii_class | upper ~ "'"
            ) -%}
        {%- endif -%}
    {%- endfor -%}
    {{ return(statements | join(';\n')) }}
{%- endmacro %}

{# Attaches the segment row access policy to marts that expose a `segment` column. #}
{% macro apply_segment_policy() -%}
    {%- if not execute -%}{{ return('') }}{%- endif -%}
    {%- if 'segment' not in model.columns -%}{{ return('') }}{%- endif -%}
    {#- An incremental run alters the existing table, which still carries the policy. -#}
    {%- if is_incremental() -%}{{ return('') }}{%- endif -%}
    ALTER TABLE {{ this }} ADD ROW ACCESS POLICY UNITI_ANALYTICS.GOVERNANCE.RAP_SEGMENT ON (segment)
{%- endmacro %}
