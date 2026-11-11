-- =============================================================================
-- Landing layer: storage integration, stages, raw tables and Snowpipes.
--
-- Sources publish newline-delimited JSON to s3://uniti-datalake-<env>/landing/<source>/<entity>/
-- (Debezium for Uconnect SQL Server, Mongo change streams for eCom, nightly
-- catalogue snapshots). Every raw table keeps the untouched payload plus load
-- metadata; parsing happens in streams/tasks and dbt staging, never here.
-- =============================================================================

USE ROLE ACCOUNTADMIN;

CREATE STORAGE INTEGRATION IF NOT EXISTS UNITI_DATALAKE_S3
  TYPE = EXTERNAL_STAGE
  STORAGE_PROVIDER = 'S3'
  ENABLED = TRUE
  STORAGE_AWS_ROLE_ARN = '&{datalake_role_arn}'
  STORAGE_ALLOWED_LOCATIONS = ('s3://uniti-datalake-&{env}/landing/');
GRANT USAGE ON INTEGRATION UNITI_DATALAKE_S3 TO ROLE UNITI_LOADER;

USE ROLE UNITI_LOADER;
USE WAREHOUSE UNITI_LOADING_WH;
USE SCHEMA UNITI_RAW.INGEST;

CREATE FILE FORMAT IF NOT EXISTS FF_NDJSON
  TYPE = JSON STRIP_OUTER_ARRAY = FALSE COMPRESSION = AUTO
  IGNORE_UTF8_ERRORS = FALSE ALLOW_DUPLICATE = FALSE;

CREATE STAGE IF NOT EXISTS STG_LANDING
  STORAGE_INTEGRATION = UNITI_DATALAKE_S3
  URL = 's3://uniti-datalake-&{env}/landing/'
  FILE_FORMAT = FF_NDJSON
  DIRECTORY = (ENABLE = TRUE AUTO_REFRESH = TRUE);

-- -----------------------------------------------------------------------------
-- Raw tables share one shape: payload + operation + source position + load audit.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS UNITI_RAW.ECOM.ORDERS_CDC (
    payload         VARIANT       NOT NULL,
    op              VARCHAR(1)    NOT NULL COMMENT 'c=create u=update d=delete r=snapshot read',
    source_ts       TIMESTAMP_TZ  NOT NULL COMMENT 'Commit time in the source system',
    source_position VARCHAR       NOT NULL COMMENT 'Resume token / LSN for ordering',
    _file_name      VARCHAR       NOT NULL,
    _file_row       NUMBER        NOT NULL,
    _loaded_at      TIMESTAMP_TZ  NOT NULL DEFAULT CURRENT_TIMESTAMP()
) CHANGE_TRACKING = TRUE;

CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.ACCOUNTS_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.INVOICES_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.PAYMENTS_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.SERVICES_CDC  LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.TICKETS_CDC   LIKE UNITI_RAW.ECOM.ORDERS_CDC;
CREATE TABLE IF NOT EXISTS UNITI_RAW.ICONNECT.ORDERS_CDC    LIKE UNITI_RAW.ECOM.ORDERS_CDC;

CREATE TABLE IF NOT EXISTS UNITI_RAW.CATALOG.PRODUCTS_SNAPSHOT (
    payload     VARIANT      NOT NULL,
    snapshot_on DATE         NOT NULL,
    _file_name  VARCHAR      NOT NULL,
    _loaded_at  TIMESTAMP_TZ NOT NULL DEFAULT CURRENT_TIMESTAMP()
);

-- -----------------------------------------------------------------------------
-- Snowpipes. Envelope fields come from the CDC producer; the copy is a pure
-- projection so a pipe never fails on a payload schema change.
-- -----------------------------------------------------------------------------
CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_ECOM_ORDERS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.ECOM.ORDERS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT $1:after, $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:position::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/ecom/orders/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_ACCOUNTS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.ACCOUNTS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/accounts/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_INVOICES AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.INVOICES_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/invoices/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_PAYMENTS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.PAYMENTS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/payments/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_SERVICES AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.SERVICES_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/services/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_UCONNECT_TICKETS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.UCONNECT.TICKETS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/uconnect/tickets/
)
ON_ERROR = SKIP_FILE;

CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_ICONNECT_ORDERS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.ICONNECT.ORDERS_CDC (payload, op, source_ts, source_position, _file_name, _file_row)
FROM (
    SELECT COALESCE($1:after, $1:before), $1:op::VARCHAR, $1:ts::TIMESTAMP_TZ, $1:lsn::VARCHAR,
           METADATA$FILENAME, METADATA$FILE_ROW_NUMBER
    FROM @UNITI_RAW.INGEST.STG_LANDING/iconnect/orders/
)
ON_ERROR = SKIP_FILE;

-- Catalogue is a full daily snapshot; the partition date comes from the path
-- (catalog/products/snapshot_on=YYYY-MM-DD/part-0000.json).
CREATE PIPE IF NOT EXISTS UNITI_RAW.INGEST.PIPE_CATALOG_PRODUCTS AUTO_INGEST = TRUE AS
COPY INTO UNITI_RAW.CATALOG.PRODUCTS_SNAPSHOT (payload, snapshot_on, _file_name)
FROM (
    SELECT $1,
           TO_DATE(REGEXP_SUBSTR(METADATA$FILENAME, 'snapshot_on=(\\d{4}-\\d{2}-\\d{2})', 1, 1, 'e')),
           METADATA$FILENAME
    FROM @UNITI_RAW.INGEST.STG_LANDING/catalog/products/
)
ON_ERROR = ABORT_STATEMENT;

-- SQS ARN to configure on the bucket's event notifications:
--   SELECT "notification_channel" FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())) after SHOW PIPES;
-- Backfill after creating a pipe over existing files:
--   ALTER PIPE UNITI_RAW.INGEST.PIPE_ECOM_ORDERS REFRESH;
