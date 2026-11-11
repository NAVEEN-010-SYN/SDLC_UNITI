-- =============================================================================
-- Governance: PII classification tags, tag-based masking, and segment-level row
-- access for the marts.
--
-- Masking is attached to the PII_CLASS tag, not to individual columns: dbt sets
-- the tag on a column (see the `pii_class` meta + apply_pii_tags macro) and the
-- right policy follows automatically, including on models created later.
-- =============================================================================

USE ROLE UNITI_GOVERNANCE;
USE SCHEMA UNITI_ANALYTICS.GOVERNANCE;

CREATE TAG IF NOT EXISTS PII_CLASS
  ALLOWED_VALUES 'EMAIL', 'PHONE', 'NAME', 'ADDRESS', 'PAYMENT_CARD'
  COMMENT = 'Personal data category; drives masking';

-- UNITI_PII_READER and UNITI_TRANSFORMER (which needs clear text to build joins)
-- see unmasked values; every query by those roles is in ACCESS_HISTORY.
CREATE MASKING POLICY IF NOT EXISTS MASK_PII_STRING AS (val VARCHAR) RETURNS VARCHAR ->
  CASE
    WHEN val IS NULL
      OR IS_ROLE_IN_SESSION('UNITI_PII_READER') OR IS_ROLE_IN_SESSION('UNITI_TRANSFORMER') THEN val
    WHEN SYSTEM$GET_TAG_ON_CURRENT_COLUMN('UNITI_ANALYTICS.GOVERNANCE.PII_CLASS') = 'EMAIL'
      -- Keep the domain: lets analysts segment consumer vs business mailboxes.
      THEN '***@' || SPLIT_PART(val, '@', 2)
    WHEN SYSTEM$GET_TAG_ON_CURRENT_COLUMN('UNITI_ANALYTICS.GOVERNANCE.PII_CLASS') = 'PHONE'
      THEN REPEAT('*', GREATEST(LENGTH(val) - 4, 0)) || RIGHT(val, 4)
    WHEN SYSTEM$GET_TAG_ON_CURRENT_COLUMN('UNITI_ANALYTICS.GOVERNANCE.PII_CLASS') = 'PAYMENT_CARD'
      THEN 'XXXX'
    ELSE '** redacted **'
  END
  COMMENT = 'Tag-driven masking for string PII';

-- Hash variant for columns analysts must still join or count distinct on.
CREATE MASKING POLICY IF NOT EXISTS MASK_PII_HASH AS (val VARCHAR) RETURNS VARCHAR ->
  CASE
    WHEN val IS NULL
      OR IS_ROLE_IN_SESSION('UNITI_PII_READER') OR IS_ROLE_IN_SESSION('UNITI_TRANSFORMER') THEN val
    ELSE SHA2(LOWER(TRIM(val)) || '|uniti-selfcare', 256)
  END
  COMMENT = 'Deterministic pseudonymisation; join-safe';

ALTER TAG PII_CLASS SET MASKING POLICY MASK_PII_STRING;

-- -----------------------------------------------------------------------------
-- Row access: which customer segments each analyst role may see. Business and
-- wholesale revenue are commercially sensitive outside their own teams.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS SEGMENT_ENTITLEMENTS (
    role_name VARCHAR NOT NULL,
    segment   VARCHAR NOT NULL,
    granted_by VARCHAR NOT NULL DEFAULT CURRENT_USER(),
    granted_at TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT pk_segment_entitlements PRIMARY KEY (role_name, segment)
);

MERGE INTO SEGMENT_ENTITLEMENTS t
USING (
    SELECT * FROM VALUES
        ('UNITI_REPORTER',        'CONSUMER'),
        ('UNITI_B2B_ANALYST',     'CONSUMER'),
        ('UNITI_B2B_ANALYST',     'BUSINESS'),
        ('UNITI_WHOLESALE_ANALYST', 'WHOLESALE'),
        ('UNITI_FINANCE_ANALYST', 'CONSUMER'),
        ('UNITI_FINANCE_ANALYST', 'BUSINESS'),
        ('UNITI_FINANCE_ANALYST', 'WHOLESALE')
        AS v(role_name, segment)
) s
ON t.role_name = s.role_name AND t.segment = s.segment
WHEN NOT MATCHED THEN INSERT (role_name, segment) VALUES (s.role_name, s.segment);

CREATE ROW ACCESS POLICY IF NOT EXISTS RAP_SEGMENT AS (segment VARCHAR) RETURNS BOOLEAN ->
  IS_ROLE_IN_SESSION('UNITI_TRANSFORMER')
  OR IS_ROLE_IN_SESSION('UNITI_GOVERNANCE')
  OR EXISTS (
      SELECT 1
      FROM UNITI_ANALYTICS.GOVERNANCE.SEGMENT_ENTITLEMENTS e
      WHERE e.segment = segment
        AND IS_ROLE_IN_SESSION(e.role_name)
  )
  COMMENT = 'Restricts mart rows to segments the session roles are entitled to';

-- Analyst roles referenced above; each inherits REPORTER's object grants.
USE ROLE SECURITYADMIN;
CREATE ROLE IF NOT EXISTS UNITI_B2B_ANALYST;
CREATE ROLE IF NOT EXISTS UNITI_WHOLESALE_ANALYST;
CREATE ROLE IF NOT EXISTS UNITI_FINANCE_ANALYST;
GRANT ROLE UNITI_REPORTER TO ROLE UNITI_B2B_ANALYST;
GRANT ROLE UNITI_REPORTER TO ROLE UNITI_WHOLESALE_ANALYST;
GRANT ROLE UNITI_REPORTER TO ROLE UNITI_FINANCE_ANALYST;
GRANT ROLE UNITI_B2B_ANALYST       TO ROLE SYSADMIN;
GRANT ROLE UNITI_WHOLESALE_ANALYST TO ROLE SYSADMIN;
GRANT ROLE UNITI_FINANCE_ANALYST   TO ROLE SYSADMIN;

-- dbt attaches RAP_SEGMENT to each mart with a `segment` column via the
-- apply_segment_policy post-hook; it needs to reference the policy.
USE ROLE UNITI_GOVERNANCE;
GRANT APPLY ON ROW ACCESS POLICY UNITI_ANALYTICS.GOVERNANCE.RAP_SEGMENT TO ROLE UNITI_TRANSFORMER;
GRANT APPLY ON TAG UNITI_ANALYTICS.GOVERNANCE.PII_CLASS TO ROLE UNITI_TRANSFORMER;

-- -----------------------------------------------------------------------------
-- Audit helper: who read clear-text PII in the last 30 days.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE SECURE VIEW PII_ACCESS_AUDIT AS
SELECT ah.query_start_time,
       ah.user_name,
       q.role_name,
       obj.value:"objectName"::VARCHAR AS object_name,
       col.value:"columnName"::VARCHAR AS column_name
FROM SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY ah
JOIN SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY q ON q.query_id = ah.query_id,
     LATERAL FLATTEN(ah.base_objects_accessed) obj,
     LATERAL FLATTEN(obj.value:"columns") col
JOIN SNOWFLAKE.ACCOUNT_USAGE.TAG_REFERENCES tr
  ON tr.tag_name = 'PII_CLASS'
 AND tr.domain = 'COLUMN'
 AND tr.object_database || '.' || tr.object_schema || '.' || tr.object_name = obj.value:"objectName"::VARCHAR
 AND tr.column_name = col.value:"columnName"::VARCHAR
WHERE ah.query_start_time > DATEADD(DAY, -30, CURRENT_TIMESTAMP())
  AND q.role_name IN ('UNITI_PII_READER', 'UNITI_TRANSFORMER');
