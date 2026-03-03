# Kinetica DDL Reference

Standard PostgreSQL DDL works as baseline. This covers Kinetica-specific
data types, column properties, table options, partitioning, and tier strategies.

## Kinetica Data Types

Standard types work (INT, BIGINT, VARCHAR, etc.). These are Kinetica-specific:

| Type | Aliases | Notes |
|------|---------|-------|
| `UNSIGNED BIGINT` | `UNSIGNED LONG` | No PostgreSQL equivalent |
| `DECIMAL(P,S)` | `NUMERIC` | Max precision 27, max scale 18 |
| `DATETIME` | — | Kinetica-specific timestamp type |
| `IPV4` | — | Shorthand for VARCHAR with IPV4 validation |
| `UUID` | — | UUID format string |
| `JSON` | — | JSON format string |
| `GEOMETRY` | `ST_GEOMETRY`, `WKT` | Geospatial — SRID 4326 only |
| `BLOB` | `BINARY`, `BYTES`, `VARBINARY` | Binary data |
| `BLOB(WKT)` | — | WKB geospatial binary |
| `VECTOR(N)` | — | N-dimensional vector for similarity search |

**Array types:** `BOOLEAN[N]`, `INTEGER[N]`, `BIGINT[N]`, `UNSIGNED BIGINT[N]`, `REAL[N]`, `DOUBLE[N]`, `VARCHAR[N]`

## Column Properties (Kinetica-Specific)

| Property | Purpose |
|----------|---------|
| `PRIMARY_KEY` | Designates primary key |
| `SHARD_KEY` | Controls data distribution across nodes |
| `DICT` | Dictionary-encoding for low-cardinality values |
| `TEXT_SEARCH` | Enables full-text searchability |
| `INIT_WITH_NOW` | Auto-populate DATE/TIME/DATETIME/TIMESTAMP on insert |
| `INIT_WITH_UUID` | Auto-generate UUID on insert |
| `UPDATE_WITH_NOW` | Auto-update timestamp on UPDATE |
| `IPV4` | Validates IPv4 address format |
| `NORMALIZE` | L2-normalizes vectors on insert/update |
| `COMPRESS(TYPE)` | Column compression |

## CREATE TABLE

```sql
CREATE [OR REPLACE] [REPLICATED] [TEMP] TABLE [IF NOT EXISTS] ["schema".]"table" (
    "id"          INT NOT NULL,
    "name"        VARCHAR(256),
    "created_at"  DATETIME INIT_WITH_NOW,
    "updated_at"  DATETIME UPDATE_WITH_NOW,
    "embedding"   VECTOR(1536) NORMALIZE,
    "location"    GEOMETRY,
    "tags"        VARCHAR[10],
    "metadata"    JSON,
    PRIMARY KEY ("id"),
    SHARD KEY ("id")
)
```

**Key options:**
- `OR REPLACE` — drops existing table with same name
- `REPLICATED` — copy on all nodes (good for small lookup tables, joins locally with any sharded table)
- `TEMP` — memory-only, non-persisted, faster ingest
- `SOFT PRIMARY KEY` — enforces uniqueness but allows NULLs

## SHARD KEY

Controls how data is distributed across nodes. Critical for join performance:
- Joins on shard key columns are **local** (fast)
- Joins on non-shard columns are **distributed** (slower)
- Replicated tables join locally with any sharded table

```sql
CREATE TABLE "schema"."events" (
    "event_id" BIGINT NOT NULL,
    "user_id"  INT NOT NULL,
    PRIMARY KEY ("event_id"),
    SHARD KEY ("user_id")  -- data partitioned by user
)
```

## Partitioning

**Range:**
```sql
PARTITION BY RANGE ("created_date")
PARTITIONS (
    "p_2024_q1" MIN ('2024-01-01') MAX ('2024-04-01'),
    "p_2024_q2" MIN ('2024-04-01') MAX ('2024-07-01')
)
```

**Interval (auto-expanding):**
```sql
PARTITION BY INTERVAL ("created_date")
PARTITIONS (STARTING AT ('2024-01-01') INTERVAL ('1' MONTH))
```

**List:**
```sql
PARTITION BY LIST ("region")
PARTITIONS (
    "p_us" VALUES ('US-EAST', 'US-WEST'),
    "p_eu" VALUES ('EU-WEST', 'EU-CENTRAL')
)
```

**List (automatic):**
```sql
PARTITION BY LIST ("region") AUTOMATIC
```

**Hash:**
```sql
PARTITION BY HASH ("user_id") PARTITIONS 16
```

**Series** (Kinetica-specific):
```sql
PARTITION BY SERIES ("track_id") PERCENT_FULL 80
```

## Tier Strategy

Controls data placement across GPU RAM, host RAM, and disk:

```sql
CREATE TABLE "schema"."hot_data" (...)
TIER STRATEGY (
    ( ( VRAM 1, RAM 1, PERSIST 1 ) )
)
```

Priority numbers: lower = preferred. VRAM (GPU), RAM (host), PERSIST (disk).

## Index Types

| Syntax | Purpose |
|--------|---------|
| `INDEX ("col")` | Standard attribute index |
| `LOW CARDINALITY INDEX ("col")` | Few distinct values |
| `CHUNK SKIP INDEX ("col")` | Skip chunks for equality filters |
| `GEOSPATIAL INDEX ("geom_col")` | Single WKT column or coordinate pair |
| `CAGRA INDEX ("vec_col")` | GPU-accelerated vector search |
| `HNSW INDEX ("vec_col")` | Hierarchical navigable small world (vector) |

```sql
CREATE TABLE "schema"."docs" (
    "id" INT NOT NULL,
    "embedding" VECTOR(1536),
    CAGRA INDEX ("embedding")
)
```

## Table Properties

```sql
USING TABLE PROPERTIES (
    CHUNK SIZE = 1000000,
    TTL = 1440,                    -- auto-expire after 1440 minutes (24 hours)
    PRIMARY_KEY_TYPE = 'memory',   -- or 'disk'
    COMPRESSION_CODEC = 'snappy'
)
```

TTL (Time-To-Live): `-1` for no expiration, value in minutes.

## ALTER TABLE

```sql
-- Add column
ALTER TABLE "schema"."table" ADD "new_col" VARCHAR(256) DEFAULT 'unknown'

-- Rename column
ALTER TABLE "schema"."table" RENAME COLUMN "old" TO "new"

-- Modify column type
ALTER TABLE "schema"."table" ALTER COLUMN "col" VARCHAR(512)

-- Drop column
ALTER TABLE "schema"."table" DROP COLUMN "col"

-- Set TTL
ALTER TABLE "schema"."table" SET TTL 2880

-- Set access mode
ALTER TABLE "schema"."table" SET ACCESS MODE READ_ONLY

-- Add index
ALTER TABLE "schema"."table" ADD GEOSPATIAL INDEX ("location")
ALTER TABLE "schema"."table" ADD CAGRA INDEX ("embedding")
```

## CREATE TABLE AS SELECT (CTAS)

```sql
-- Basic CTAS
CREATE TABLE "schema"."summary" AS (
    SELECT "region", COUNT(*) AS "count", SUM("revenue") AS "total"
    FROM "schema"."sales"
    GROUP BY "region"
)

-- CTAS with hints
CREATE TABLE "schema"."summary" AS (
    SELECT /* KI_HINT_GROUP_BY_PK, KI_HINT_INDEX(region), KI_SHARD_KEY(region) */
        "region", COUNT(*) AS "count"
    FROM "schema"."events"
    GROUP BY "region"
)
```

## Views

```sql
-- Standard view
CREATE [OR REPLACE] VIEW "schema"."my_view" AS (
    SELECT * FROM "schema"."table" WHERE "active" = 1
)

-- Materialized view (cached, must refresh)
CREATE [OR REPLACE] MATERIALIZED VIEW "schema"."mv" AS (
    SELECT "region", SUM("revenue") FROM "schema"."sales" GROUP BY "region"
)

REFRESH MATERIALIZED VIEW "schema"."mv"
```

## External Tables

```sql
-- Materialized (cached copy, default)
CREATE EXTERNAL TABLE "schema"."s3_data"
FILE PATHS 's3://bucket/path/*.parquet'
FORMAT PARQUET
WITH OPTIONS (DATA SOURCE = 'my_s3_source')

-- Logical (live query, always current)
CREATE LOGICAL EXTERNAL TABLE "schema"."live_data"
REMOTE QUERY 'SELECT * FROM remote_table'
WITH OPTIONS (DATA SOURCE = 'my_jdbc_source')
```

## Credentials

```sql
CREATE [OR REPLACE] CREDENTIAL "schema"."aws_creds"
  TYPE = 'aws_access_key',
  IDENTITY = 'AKIAIOSFODNN7EXAMPLE',
  SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

ALTER CREDENTIAL "schema"."aws_creds" SET SECRET = 'new_secret'
DROP CREDENTIAL "schema"."aws_creds"
SHOW CREDENTIAL *
```

Credential types: `aws_access_key`, `azure_ad`, `azure_oauth`, `azure_sas`,
`azure_storage_key`, `confluent`, `docker`, `gcs_service_account_id`,
`gcs_service_account_keys`, `hdfs`, `jdbc`, `kafka`, `nvidia_api_key`, `openai_api_key`.

## Data Sources

```sql
CREATE [OR REPLACE] [EXTERNAL] DATA SOURCE "schema"."my_s3"
  LOCATION = 's3://my-bucket/path/'
  WITH OPTIONS (
    CREDENTIAL = 'aws_creds',
    S3_REGION = 'us-east-1'
  )

-- JDBC data source
CREATE DATA SOURCE "schema"."pg_source"
  LOCATION = 'jdbc:postgresql://host:5432/db'
  WITH OPTIONS (CREDENTIAL = 'pg_creds')

-- Kafka data source
CREATE DATA SOURCE "schema"."kafka_in"
  LOCATION = 'kafka://broker1:9092,broker2:9092'
  WITH OPTIONS (
    CREDENTIAL = 'kafka_creds',
    KAFKA_TOPIC_NAME = 'events'
  )
```

Locations: `s3://`, `az://` (Azure Blob), `gs://` (GCS), `hdfs://`, `jdbc:`, `kafka://`, `KiFS://`.

```sql
ALTER DATA SOURCE "schema"."my_s3" SET LOCATION = 's3://new-bucket/'
DROP DATA SOURCE "schema"."my_s3"
SHOW DATA SOURCE *
```

## Data Sinks

```sql
CREATE [OR REPLACE] [EXTERNAL] DATA SINK "schema"."kafka_out"
  KAFKA 'broker1:9092'
  WITH OPTIONS (CREDENTIAL = 'kafka_creds')

-- HTTP webhook sink
CREATE DATA SINK "schema"."webhook"
  HTTP 'https://api.example.com/events'

-- GCS sink
CREATE DATA SINK "schema"."gcs_backup"
  GCS 'gs://my-bucket/backups/'
  WITH OPTIONS (CREDENTIAL = 'gcs_creds')
```

Sink types: `KAFKA`, `HTTP`/`HTTPS`, `TABLE`, `GCS`, `AZURE`, `S3`.

```sql
DROP DATA SINK "schema"."kafka_out"
SHOW DATA SINK *
```

## Streams (Change Data Capture)

Publish table changes to Kafka, webhooks, or local tables:

```sql
-- Simple CDC stream
CREATE STREAM "schema"."order_changes"
  ON TABLE "sales"."orders"
  REFRESH ON CHANGE
  WITH OPTIONS (DATASINK_NAME = 'kafka_out')

-- Filtered stream
CREATE STREAM "schema"."high_value"
  ON TABLE "sales"."orders"
  REFRESH ON CHANGE
  WHERE "amount" > 10000
  WITH OPTIONS (DATASINK_NAME = 'webhook')

-- Geofence stream (query-based)
CREATE STREAM "schema"."geofence_alerts"
  ON QUERY (
    SELECT * FROM "tracking"."positions" dt
    LEFT SEMI JOIN "geo"."zones" lt
    ON STXY_CONTAINSPOINT(lt."geom", dt."x", dt."y")
  )
  REFRESH EVERY 30 SECONDS
  WITH OPTIONS (DATASINK_NAME = 'kafka_out')
```

```sql
DROP STREAM "schema"."order_changes"
SHOW STREAM *
```

## Backup / Restore

```sql
-- Create a full backup
CREATE BACKUP "nightly_backup"
  DATA SINK = "gcs_backup"
  TYPE = 'full'
  OBJECTS (ALL = "sales")   -- entire schema
  WITH OPTIONS (CHECKSUM = true)

-- Create a full backup of specific objects
CREATE BACKUP "tables_backup"
  DATA SINK = "gcs_backup"
  TYPE = 'full'
  OBJECTS (TABLE = "sales"."orders", TABLE = "sales"."customers")

-- Incremental backup (after initial CREATE)
BACKUP "nightly_backup"
  DATA SINK = "gcs_backup"

-- Differential backup
BACKUP "nightly_backup"
  DATA SINK = "gcs_backup"
  TYPE = 'differential'

-- Restore
RESTORE BACKUP "nightly_backup"
  DATA SOURCE "gcs_source"
  OBJECTS (ALL = "sales")

-- Management
DROP BACKUP "nightly_backup"
SHOW BACKUP *
DESCRIBE BACKUP "nightly_backup"
```

Backed-up object types: TABLE, ALL (schema), CREDENTIAL, DATA SINK, DATA SOURCE,
PROCEDURE, ROLE, STREAM, USER, CONTEXT.

## Schemas

```sql
CREATE SCHEMA IF NOT EXISTS "my_schema"
ALTER SCHEMA "old_name" RENAME TO "new_name"
DROP SCHEMA IF EXISTS "my_schema" CASCADE
SET CURRENT SCHEMA "my_schema"
```

## SQL Procedures

```sql
CREATE OR REPLACE PROCEDURE "schema"."daily_rollup"
BEGIN
    TRUNCATE TABLE "schema"."daily_summary";
    INSERT INTO "schema"."daily_summary"
    SELECT DATE_TRUNC('day', "ts") AS "day", COUNT(*) AS "n"
    FROM "schema"."events"
    GROUP BY 1;
END
EXECUTE FOR EVERY 1 DAY STARTING AT '2024-01-01 00:00:00'
```

Limitations: No IF/ELSE, WHILE, FOR loops, variables, or exception handling. SQL batches only.
