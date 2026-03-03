# Kinetica DML Reference

Standard INSERT, UPDATE, DELETE work. This covers Kinetica-specific behaviors,
upsert hints, LOAD DATA, and EXPORT.

## INSERT — Kinetica Differences

```sql
-- Standard insert
INSERT INTO "schema"."table" ("col1", "col2") VALUES ('a', 1), ('b', 2)

-- Insert from query
INSERT INTO "schema"."target" SELECT * FROM "schema"."source"
```

**Upsert hints (Kinetica-specific):**

```sql
-- Update existing rows on PK match, insert new ones
INSERT INTO /* KI_HINT_UPDATE_ON_EXISTING_PK */ "schema"."table"
SELECT * FROM "schema"."staging"

-- Silently skip rows with duplicate PKs
INSERT INTO /* KI_HINT_IGNORE_EXISTING_PK */ "schema"."table"
SELECT * FROM "schema"."staging"
```

Non-nullable columns omitted from column list get defaults (empty string or 0).

## UPDATE — Kinetica Differences

```sql
-- Standard update
UPDATE "schema"."table" SET "status" = 'closed' WHERE "age" > 30

-- Update with JOIN (via FROM clause)
UPDATE "schema"."orders" SET "status" = 'shipped'
FROM "schema"."shipments" AS "s"
WHERE "orders"."id" = "s"."order_id"
```

Note: Primary key updates via JOIN are NOT supported.

## DELETE

```sql
DELETE FROM "schema"."table" WHERE "created_at" < DATEADD('DAY', -90, NOW())
```

## TRUNCATE

```sql
TRUNCATE TABLE "schema"."table"
```

## LOAD DATA (Kinetica-Specific)

Bulk data loading from external sources — no PostgreSQL equivalent.

```sql
-- Load CSV from S3
LOAD DATA INTO "schema"."table"
FROM FILE PATHS 's3://bucket/path/data.csv'
FORMAT TEXT (DELIMITER = ',', INCLUDES HEADER = TRUE, QUOTE = '"')
WITH OPTIONS (
    DATA SOURCE = 'my_s3_source',
    ON ERROR = SKIP,           -- ABORT (default) or SKIP bad records
    BATCH SIZE = 50000,
    BAD RECORD TABLE = 'schema.bad_records'
)

-- Load Parquet from S3
LOAD DATA INTO "schema"."table"
FROM FILE PATHS 's3://bucket/path/*.parquet'
FORMAT PARQUET
WITH OPTIONS (DATA SOURCE = 'my_s3_source')

-- Load JSON
LOAD DATA INTO "schema"."table"
FROM FILE PATHS 's3://bucket/path/*.json'
FORMAT JSON
WITH OPTIONS (
    DATA SOURCE = 'my_s3_source',
    FLATTEN_COLUMNS = TRUE      -- expand nested JSON
)

-- Continuous Kafka ingestion
LOAD DATA INTO "schema"."events"
FROM FILE PATHS ''
FORMAT JSON
WITH OPTIONS (
    DATA SOURCE = 'my_kafka_source',
    SUBSCRIBE = TRUE,
    POLL_INTERVAL = '5'
)

-- CDC with increasing column
LOAD DATA INTO "schema"."table"
FROM REMOTE QUERY 'SELECT * FROM source_table'
WITH OPTIONS (
    DATA SOURCE = 'my_jdbc_source',
    SUBSCRIBE = TRUE,
    REMOTE_QUERY_INCREASING_COLUMN = 'updated_at'
)
```

**Format options:**
| Format | Options |
|--------|---------|
| `TEXT` | DELIMITER, QUOTE, ESCAPE, COMMENT, INCLUDES HEADER, NULL, SKIP_LINES |
| `JSON` | FLATTEN_COLUMNS |
| `PARQUET` | — |
| `AVRO` | — |
| `SHAPEFILE` | — |

**Key LOAD options:**
| Option | Description |
|--------|-------------|
| `DATA SOURCE` | Named data source reference |
| `BATCH SIZE` | Records per batch (default 50,000) |
| `ON ERROR` | ABORT (default) or SKIP |
| `BAD RECORD TABLE` | Table for failed records |
| `TRUNCATE_TABLE` | Clear target before loading |
| `TRUNCATE_STRINGS` | Truncate oversized text instead of error |
| `UPDATE_ON_EXISTING_PK` | Upsert behavior |
| `IGNORE_EXISTING_PK` | Skip duplicates |
| `SUBSCRIBE` | TRUE for continuous ingestion |
| `POLL_INTERVAL` | Seconds between checks (continuous) |
| `COLUMN FORMATS` | JSON map of column-specific parse formats |
| `FIELDS MAPPED BY NAME` | Match fields by column name |

## EXPORT (Kinetica-Specific)

```sql
-- Export table to file
EXPORT TABLE "schema"."table"
INTO FILE PATH '/kifs/exports/data.csv'
FORMAT TEXT (DELIMITER = ',')
WITH OPTIONS (SINGLE_FILE = TRUE)

-- Export query results
EXPORT QUERY (
    SELECT * FROM "schema"."table" WHERE "region" = 'US'
)
INTO FILE PATH 's3://bucket/exports/us_data.parquet'
FORMAT PARQUET
WITH OPTIONS (
    DATA SINK = 'my_s3_sink',
    COMPRESSION_TYPE = 'snappy'
)

-- Export to remote database
EXPORT TABLE "schema"."table"
INTO REMOTE TABLE 'target_table'
WITH OPTIONS (DATA SINK = 'my_jdbc_sink')
```

**Export options:**
| Option | Description |
|--------|-------------|
| `DATA SINK` | Named data sink reference |
| `SINGLE_FILE` | true/false/overwrite |
| `COMPRESSION_TYPE` | uncompressed, gzip, snappy |
| `FILE_EXTENSION` | Output file extension |
| `EXPORT_DDL` | Generate .ddl file alongside data |
| `BATCH_SIZE` | Records per batch |

## MERGE (Not Supported)

Kinetica does not have a `MERGE` statement. Use the `KI_HINT_UPDATE_ON_EXISTING_PK` hint on INSERT instead.
