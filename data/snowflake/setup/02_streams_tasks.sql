-- =============================================================================
-- Incremental load: streams on the append-only CDC tables feed tasks that keep a
-- "latest state per business key" table (<ENTITY>_CURRENT). dbt staging models
-- read the _CURRENT tables, so they never have to deduplicate CDC history.
--
-- Ordering rule: the newest (source_ts, source_position) wins; an out-of-order
-- late event never overwrites a newer state. Deletes become tombstones
-- (is_deleted = TRUE) so downstream facts can still join historical keys.
-- =============================================================================

USE ROLE UNITI_LOADER;
USE WAREHOUSE UNITI_LOADING_WH;

CREATE OR REPLACE PROCEDURE UNITI_RAW.INGEST.MERGE_LATEST(
    STREAM_NAME VARCHAR, TARGET_TABLE VARCHAR, KEY_EXPR VARCHAR)
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    merged INTEGER DEFAULT 0;
    stmt VARCHAR;
BEGIN
    stmt := 'CREATE TABLE IF NOT EXISTS ' || TARGET_TABLE || ' (
                 business_key    VARCHAR       NOT NULL PRIMARY KEY,
                 payload         VARIANT       NOT NULL,
                 is_deleted      BOOLEAN       NOT NULL,
                 source_ts       TIMESTAMP_TZ  NOT NULL,
                 source_position VARCHAR       NOT NULL,
                 _merged_at      TIMESTAMP_TZ  NOT NULL)';
    EXECUTE IMMEDIATE :stmt;

    -- Consuming the stream inside one DML statement advances its offset atomically.
    stmt := 'MERGE INTO ' || TARGET_TABLE || ' t
             USING (
                 SELECT ' || KEY_EXPR || ' AS business_key, payload, op = ''d'' AS is_deleted,
                        source_ts, source_position
                 FROM ' || STREAM_NAME || '
                 WHERE METADATA$ACTION = ''INSERT'' AND ' || KEY_EXPR || ' IS NOT NULL
                 QUALIFY ROW_NUMBER() OVER (
                     PARTITION BY ' || KEY_EXPR || '
                     ORDER BY source_ts DESC, source_position DESC) = 1
             ) s
             ON t.business_key = s.business_key
             WHEN MATCHED AND (s.source_ts > t.source_ts
                               OR (s.source_ts = t.source_ts AND s.source_position > t.source_position)) THEN UPDATE SET
                 payload = s.payload, is_deleted = s.is_deleted, source_ts = s.source_ts,
                 source_position = s.source_position, _merged_at = CURRENT_TIMESTAMP()
             WHEN NOT MATCHED THEN INSERT
                 (business_key, payload, is_deleted, source_ts, source_position, _merged_at)
                 VALUES (s.business_key, s.payload, s.is_deleted, s.source_ts, s.source_position, CURRENT_TIMESTAMP())';
    EXECUTE IMMEDIATE :stmt;
    merged := SQLROWCOUNT;
    RETURN TARGET_TABLE || ': ' || merged || ' row(s) merged';
END;
$$;

-- -----------------------------------------------------------------------------
-- Streams (append-only: CDC tables are never updated in place)
-- -----------------------------------------------------------------------------
CREATE STREAM IF NOT EXISTS UNITI_RAW.ECOM.ORDERS_STREAM       ON TABLE UNITI_RAW.ECOM.ORDERS_CDC       APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.ACCOUNTS_STREAM ON TABLE UNITI_RAW.UCONNECT.ACCOUNTS_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.INVOICES_STREAM ON TABLE UNITI_RAW.UCONNECT.INVOICES_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.PAYMENTS_STREAM ON TABLE UNITI_RAW.UCONNECT.PAYMENTS_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.SERVICES_STREAM ON TABLE UNITI_RAW.UCONNECT.SERVICES_CDC APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.TICKETS_STREAM  ON TABLE UNITI_RAW.UCONNECT.TICKETS_CDC  APPEND_ONLY = TRUE;
CREATE STREAM IF NOT EXISTS UNITI_RAW.ICONNECT.ORDERS_STREAM   ON TABLE UNITI_RAW.ICONNECT.ORDERS_CDC   APPEND_ONLY = TRUE;

-- Ticket status transitions are kept as history (not latest-state) because the
-- SLA clock needs every PENDING_CUSTOMER interval.
CREATE STREAM IF NOT EXISTS UNITI_RAW.UCONNECT.TICKETS_HISTORY_STREAM
    ON TABLE UNITI_RAW.UCONNECT.TICKETS_CDC APPEND_ONLY = TRUE;

CREATE TABLE IF NOT EXISTS UNITI_RAW.UCONNECT.TICKET_STATUS_EVENTS (
    ticket_id   VARCHAR      NOT NULL,
    status      VARCHAR      NOT NULL,
    priority    VARCHAR      NOT NULL,
    changed_at  TIMESTAMP_TZ NOT NULL,
    source_position VARCHAR  NOT NULL,
    CONSTRAINT uq_ticket_status_event UNIQUE (ticket_id, source_position)
);

-- -----------------------------------------------------------------------------
-- Tasks: serverless, each guarded by SYSTEM$STREAM_HAS_DATA so an idle source
-- costs nothing. Five-minute cadence matches the Kibana/Dynatrace freshness SLO.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_ECOM_ORDERS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.ECOM.ORDERS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.ECOM.ORDERS_STREAM', 'UNITI_RAW.ECOM.ORDERS_CURRENT', 'payload:orderNumber::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_ACCOUNTS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.ACCOUNTS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.ACCOUNTS_STREAM', 'UNITI_RAW.UCONNECT.ACCOUNTS_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_INVOICES
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.INVOICES_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.INVOICES_STREAM', 'UNITI_RAW.UCONNECT.INVOICES_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_PAYMENTS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.PAYMENTS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.PAYMENTS_STREAM', 'UNITI_RAW.UCONNECT.PAYMENTS_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_SERVICES
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.SERVICES_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.SERVICES_STREAM', 'UNITI_RAW.UCONNECT.SERVICES_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_UCONNECT_TICKETS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.TICKETS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.UCONNECT.TICKETS_STREAM', 'UNITI_RAW.UCONNECT.TICKETS_CURRENT', 'payload:Id::VARCHAR');

CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_ICONNECT_ORDERS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.ICONNECT.ORDERS_STREAM')
AS CALL UNITI_RAW.INGEST.MERGE_LATEST('UNITI_RAW.ICONNECT.ORDERS_STREAM', 'UNITI_RAW.ICONNECT.ORDERS_CURRENT', 'payload:Id::VARCHAR');

-- Only rows whose status actually changed are recorded; a ticket edit that keeps
-- the status (e.g. a new comment) produces no event.
CREATE OR REPLACE TASK UNITI_RAW.INGEST.TSK_TICKET_STATUS_EVENTS
    SCHEDULE = '5 MINUTE'
    USER_TASK_MANAGED_INITIAL_WAREHOUSE_SIZE = 'XSMALL'
    SUSPEND_TASK_AFTER_NUM_FAILURES = 3
    WHEN SYSTEM$STREAM_HAS_DATA('UNITI_RAW.UCONNECT.TICKETS_HISTORY_STREAM')
AS
INSERT INTO UNITI_RAW.UCONNECT.TICKET_STATUS_EVENTS (ticket_id, status, priority, changed_at, source_position)
WITH batch AS (
    SELECT payload:Id::VARCHAR                AS ticket_id,
           payload:Status::VARCHAR            AS status,
           payload:Priority::VARCHAR          AS priority,
           source_ts                          AS changed_at,
           source_position,
           LAG(payload:Status::VARCHAR) OVER (
               PARTITION BY payload:Id ORDER BY source_ts, source_position) AS previous_in_batch
    FROM UNITI_RAW.UCONNECT.TICKETS_HISTORY_STREAM
    WHERE METADATA$ACTION = 'INSERT' AND op <> 'd'
),
last_persisted AS (
    SELECT ticket_id, status AS last_status
    FROM UNITI_RAW.UCONNECT.TICKET_STATUS_EVENTS
    WHERE ticket_id IN (SELECT ticket_id FROM batch)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY changed_at DESC, source_position DESC) = 1
)
SELECT b.ticket_id, b.status, b.priority, b.changed_at, b.source_position
FROM batch b
LEFT JOIN last_persisted l ON l.ticket_id = b.ticket_id
WHERE COALESCE(b.previous_in_batch, l.last_status) IS DISTINCT FROM b.status;

ALTER TASK UNITI_RAW.INGEST.TSK_ECOM_ORDERS          RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_ACCOUNTS    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_INVOICES    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_PAYMENTS    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_SERVICES    RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_UCONNECT_TICKETS     RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_ICONNECT_ORDERS      RESUME;
ALTER TASK UNITI_RAW.INGEST.TSK_TICKET_STATUS_EVENTS RESUME;

-- -----------------------------------------------------------------------------
-- Freshness alert: any pipe with load errors, or a stream at risk of going stale
-- (stale streams lose their offset and require a full reload).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE ALERT UNITI_RAW.INGEST.ALR_INGEST_HEALTH
    WAREHOUSE = UNITI_LOADING_WH
    SCHEDULE = '30 MINUTE'
    IF (EXISTS (
        SELECT 1
        FROM SNOWFLAKE.ACCOUNT_USAGE.COPY_HISTORY
        WHERE table_catalog_name = 'UNITI_RAW'
          AND pipe_name IS NOT NULL
          AND status <> 'Loaded'
          AND last_load_time > DATEADD(HOUR, -3, CURRENT_TIMESTAMP())
        UNION ALL
        SELECT 1
        FROM UNITI_RAW.INFORMATION_SCHEMA.TABLES t
        WHERE t.table_schema IN ('ECOM', 'UCONNECT', 'ICONNECT')
          AND t.table_name LIKE '%\\_CURRENT' ESCAPE '\\'
          AND t.last_altered < DATEADD(HOUR, -6, CURRENT_TIMESTAMP())
    ))
    THEN CALL SYSTEM$SEND_EMAIL(
        'UNITI_DATA_ALERTS',
        'data-platform-oncall@uniti.com',
        'Snowflake ingestion degraded',
        'A Snowpipe reported load errors or a _CURRENT table has not merged for 6h. See runbook: observability/runbooks/selfcare-incident-runbook.md#data-freshness');
ALTER ALERT UNITI_RAW.INGEST.ALR_INGEST_HEALTH RESUME;
