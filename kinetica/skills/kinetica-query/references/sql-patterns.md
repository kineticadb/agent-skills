# Kinetica SQL Patterns

Standard PostgreSQL query patterns work. This covers patterns that are
**Kinetica-specific** or require Kinetica-specific workarounds.

## CTE Pattern for Window + Aggregate (MANDATORY)

The most important Kinetica pattern. You MUST use this whenever combining
window functions with aggregates:

```sql
WITH "windowed" AS (
    SELECT *,
        LAG("value") OVER (PARTITION BY "group" ORDER BY "ts") AS "prev_value",
        ROW_NUMBER() OVER (PARTITION BY "group" ORDER BY "ts") AS "rn"
    FROM "schema"."table"
),
"calculated" AS (
    SELECT *,
        "value" - "prev_value" AS "delta"
    FROM "windowed"
    WHERE "prev_value" IS NOT NULL
)
SELECT "group", AVG("delta") AS "avg_change", COUNT(*) AS "n"
FROM "calculated"
GROUP BY "group"
ORDER BY "avg_change" DESC
LIMIT 100
```

## CTAS — CREATE TABLE AS SELECT

```sql
CREATE TABLE "schema"."new_table" AS (
    SELECT "region", SUM("revenue") AS "total_revenue"
    FROM "schema"."sales"
    GROUP BY "region"
)

-- With hints for PK, indexes, shard key
CREATE TABLE "schema"."summary" AS (
    SELECT /* KI_HINT_GROUP_BY_PK, KI_HINT_INDEX(region) */
        "region", COUNT(*) AS "count"
    FROM "schema"."events"
    GROUP BY "region"
)
```

Note: Primary keys, foreign keys are NOT transferred. Shard keys transfer only if included in SELECT.

## Upsert Pattern

```sql
-- Update existing rows, insert new ones (match on PK)
INSERT INTO /* KI_HINT_UPDATE_ON_EXISTING_PK */ "schema"."table"
SELECT * FROM "schema"."staging_table"

-- Skip rows with duplicate PKs
INSERT INTO /* KI_HINT_IGNORE_EXISTING_PK */ "schema"."table"
SELECT * FROM "schema"."staging_table"
```

## ASOF Join — Temporal Proximity

Match records to the closest time within a window:

```sql
SELECT "t"."trade_id", "q"."price" AS "quote_price"
FROM "trades" AS "t"
INNER JOIN "quotes" AS "q"
    ON "t"."symbol" = "q"."symbol"
    AND ASOF("t"."trade_ts", "q"."quote_ts",
             INTERVAL '0' SECOND, INTERVAL '10' SECOND, MIN)
LIMIT 100
```

`ASOF(left_ts, right_ts, range_begin, range_end, MIN|MAX)`:
- MIN: closest record at or before left timestamp
- MAX: closest record at or after left timestamp

## Sequential Distance Calculation

Common pattern for geospatial tracking data:

```sql
WITH "positions" AS (
    SELECT "TRACKID", "TIMESTAMP", "X", "Y",
        LAG("X") OVER (PARTITION BY "TRACKID" ORDER BY "TIMESTAMP") AS "prev_X",
        LAG("Y") OVER (PARTITION BY "TRACKID" ORDER BY "TIMESTAMP") AS "prev_Y"
    FROM "tracking"."ais_tracks"
)
SELECT "TRACKID",
    SUM(CASE
        WHEN "prev_X" IS NOT NULL
        THEN STXY_DISTANCE("X", "Y", ST_MAKEPOINT("prev_X", "prev_Y"), 1)
        ELSE 0
    END) AS "total_distance_m"
FROM "positions"
GROUP BY "TRACKID"
ORDER BY "total_distance_m" DESC
LIMIT 100
```

## Time-Series Bucketing

```sql
SELECT TIME_BUCKET(INTERVAL '1' HOUR, "event_ts") AS "hour",
    COUNT(*) AS "event_count",
    AVG("value") AS "avg_value"
FROM "schema"."events"
WHERE "event_ts" >= DATEADD('DAY', -7, NOW())
GROUP BY "hour"
ORDER BY "hour"
```

## EXCLUDE Pattern

```sql
-- Select all columns except sensitive ones
SELECT * EXCLUDE ("ssn", "password_hash")
FROM "users"."accounts"
LIMIT 100
```

## JSON Extraction (Must CAST)

```sql
SELECT
    CAST(JSON_EXTRACT_VALUE("payload", '$.metrics.latency_ms') AS DOUBLE) AS "latency",
    JSON_EXTRACT_VALUE("payload", '$.user.name') AS "user_name"
FROM "schema"."events"
WHERE CAST(JSON_EXTRACT_VALUE("payload", '$.metrics.latency_ms') AS DOUBLE) > 100
LIMIT 100
```

## Array Flattening

```sql
SELECT DISTINCT "p"."protocol"
FROM "schema"."logs", UNNEST("logs"."protocols_array") AS "p"("protocol")
```

## Vector Similarity Search

```sql
SELECT "id", "title",
    COSINE_DISTANCE("embedding", VECTOR('[0.1, 0.2, ...]', 1536)) AS "dist"
FROM "schema"."documents"
ORDER BY "dist" ASC
LIMIT 10
```

## PIVOT Reporting

```sql
SELECT * FROM (
    SELECT "region", "quarter", "revenue"
    FROM "schema"."sales"
)
PIVOT (SUM("revenue") FOR "quarter" IN ('Q1', 'Q2', 'Q3', 'Q4'))
ORDER BY "region"
```

## Schema Discovery

```sql
SELECT "column_name", "data_type"
FROM "information_schema"."columns"
WHERE "table_schema" = 'my_schema' AND "table_name" = 'my_table'
```

## LOAD DATA

```sql
-- Load from S3
LOAD DATA INTO "schema"."table"
FROM FILE PATHS 's3://bucket/path/data.csv'
FORMAT TEXT (DELIMITER = ',', INCLUDES HEADER = TRUE)
WITH OPTIONS (
    DATA SOURCE = 'my_s3_source',
    ON ERROR = SKIP,
    BATCH SIZE = 50000
)

-- Load from Kafka (continuous)
LOAD DATA INTO "schema"."events"
FROM FILE PATHS ''
FORMAT JSON
WITH OPTIONS (
    DATA SOURCE = 'my_kafka_source',
    SUBSCRIBE = TRUE,
    POLL_INTERVAL = '5'
)
```

## EXPORT

```sql
EXPORT QUERY (SELECT * FROM "schema"."table" WHERE "region" = 'US')
INTO FILE PATH '/tmp/export.csv'
FORMAT TEXT (DELIMITER = ',')
WITH OPTIONS (SINGLE_FILE = TRUE)
```
