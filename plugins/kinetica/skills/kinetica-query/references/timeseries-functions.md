# Kinetica Time-Series Reference

Standard PostgreSQL window functions and date/time extraction work.
This covers Kinetica-specific time-series features and deviations.

## CRITICAL: Timestamp Arithmetic

Kinetica does NOT support direct timestamp subtraction (`ts1 - ts2`).
Always use `DATEDIFF`:

```sql
-- WRONG — will fail
SELECT "end_time" - "start_time" AS "duration" FROM "schema"."events"

-- CORRECT
SELECT DATEDIFF('HOUR', "start_time", "end_time") AS "duration_hours"
FROM "schema"."events"
```

## Date/Time Functions — Kinetica Differences

| Function | Description | PostgreSQL Equivalent |
|----------|-------------|---------------------|
| `DATEDIFF('unit', start, end)` | Difference in unit | `EXTRACT(EPOCH FROM end-start)` |
| `DATEDIFF(end, begin)` | Difference in **days** (2-arg) | `end::date - begin::date` |
| `DATEADD('unit', amount, dt)` | Add interval | `dt + INTERVAL '...'` |
| `TIME_BUCKET(INTERVAL, ts [, offset [, base]])` | Bucket timestamps | `date_bin()` (PG14+) |
| `DATETIME_BUCKET(ts, INTERVAL)` | Alias (arg order swapped) | — |
| `DATE_BUCKET(width, ds [, offset [, base]])` | Bucket dates | — |
| `DAYOFWEEK(dt)` | **1=Sunday...7=Saturday** | `EXTRACT(DOW)` is 0=Sunday |
| `DAYNAME(dt)` | 'Monday', 'Tuesday'... | `to_char(dt, 'Day')` |
| `EPOCH_MSECS_TO_DATETIME(ms)` | Epoch ms → datetime | — |
| `EPOCH_SECS_TO_DATETIME(secs)` | Epoch secs → datetime | `to_timestamp(secs)` |
| `MSECS_SINCE_EPOCH(ts)` | datetime → epoch ms | — |
| `SECS_SINCE_EPOCH(ts)` | datetime → epoch secs | — |
| `UNIX_TIMESTAMP(ts)` | Alias for SECS_SINCE_EPOCH | — |
| `TIMESTAMP_FROM_DATE_TIME(d, t)` | Combine date + time | — |
| `DATE_TO_EPOCH_MSECS(y,m,d,h,mi,s,ms)` | Components → epoch ms | — |
| `TIMESTAMPADD(unit, n, dt)` | Alias for DATEADD | — |
| `TIMESTAMPDIFF(unit, start, end)` | Alias for DATEDIFF | — |

Units: `MICROSECOND`, `MILLISECOND`, `SECOND`, `MINUTE`, `HOUR`, `DAY`, `WEEK`, `MONTH`, `QUARTER`, `YEAR`

**INTERVAL syntax:** `INTERVAL '30' MINUTE`, `INTERVAL '1' DAY`
Also supports: `dt + INTERVAL '7' DAY`, `dt - INTERVAL '1' HOUR`

## ASOF Joins (Kinetica-Specific)

Join time-series data to the closest matching record within a time window.
**No PostgreSQL equivalent** — would require complex `LATERAL` joins.

**Syntax:** `ASOF(left_ts, right_ts, range_begin, range_end, MIN|MAX)`
- `MIN`: find closest record at or **before** left timestamp
- `MAX`: find closest record at or **after** left timestamp
- Range args are `INTERVAL` types defining the search window

```sql
-- Find the latest quote within 10 seconds before each trade
SELECT "t"."trade_id", "t"."trade_ts",
    "q"."price" AS "quote_price", "q"."quote_ts"
FROM "trades" AS "t"
INNER JOIN "quotes" AS "q"
    ON "t"."symbol" = "q"."symbol"
    AND ASOF("t"."trade_ts", "q"."quote_ts",
             INTERVAL '0' SECOND, INTERVAL '10' SECOND, MIN)
LIMIT 100
```

```sql
-- Match sensor readings to the nearest weather observation within 5 minutes
SELECT "s"."sensor_id", "s"."reading", "w"."temperature"
FROM "schema"."sensor_data" AS "s"
INNER JOIN "schema"."weather" AS "w"
    ON "s"."station_id" = "w"."station_id"
    AND ASOF("s"."ts", "w"."observation_ts",
             INTERVAL '5' MINUTE, INTERVAL '5' MINUTE, MIN)
```

Note: Materialized view restrictions apply to ASOF joins (workaround: `KI_HINT_PROJECT_MATERIALIZED_VIEW`).

## Time Bucketing Patterns

```sql
-- Hourly aggregation
SELECT TIME_BUCKET(INTERVAL '1' HOUR, "event_ts") AS "hour",
    COUNT(*) AS "events", AVG("value") AS "avg_value"
FROM "schema"."events"
WHERE "event_ts" >= DATEADD('DAY', -7, NOW())
GROUP BY "hour"
ORDER BY "hour"

-- 15-minute buckets
SELECT TIME_BUCKET(INTERVAL '15' MINUTE, "ts") AS "bucket",
    SUM("bytes") AS "total_bytes"
FROM "schema"."network_traffic"
GROUP BY "bucket"
ORDER BY "bucket"

-- Daily using DATE_TRUNC
SELECT DATE_TRUNC('day', "created_at") AS "day",
    COUNT(*) AS "orders", SUM("total") AS "revenue"
FROM "schema"."orders"
GROUP BY "day"
ORDER BY "day"
```

## Window Functions — Kinetica Notes

Standard PostgreSQL window functions work. Kinetica additions:
- `IGNORE NULLS` / `RESPECT NULLS` on `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`

**CRITICAL REMINDER**: Window functions CANNOT be nested inside aggregate functions.
Always use CTEs:

```sql
-- Period-over-period comparison
WITH "daily" AS (
    SELECT DATE_TRUNC('day', "ts") AS "day",
        SUM("revenue") AS "daily_revenue"
    FROM "schema"."sales"
    GROUP BY "day"
),
"with_lag" AS (
    SELECT *,
        LAG("daily_revenue") OVER (ORDER BY "day") AS "prev_day_revenue"
    FROM "daily"
)
SELECT "day", "daily_revenue", "prev_day_revenue",
    ROUND(("daily_revenue" - "prev_day_revenue") * 100.0 / "prev_day_revenue", 2) AS "pct_change"
FROM "with_lag"
WHERE "prev_day_revenue" IS NOT NULL
ORDER BY "day"
LIMIT 100
```

## Moving Aggregates

```sql
-- 7-day moving average
AVG("value") OVER (ORDER BY "ts" ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)

-- Cumulative sum
SUM("value") OVER (ORDER BY "ts" ROWS UNBOUNDED PRECEDING)

-- Moving min/max
MIN("value") OVER (ORDER BY "ts" ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
```

## Complex Duration Calculations

```sql
-- Duration in hours between first and last event per track
SELECT "TRACKID",
    DATEDIFF('HOUR', MIN("TIMESTAMP"), MAX("TIMESTAMP")) AS "hours"
FROM "tracking"."positions"
GROUP BY "TRACKID"

-- Multi-unit: total hours including partial days
SELECT "TRACKID",
    DATEDIFF('DAY', MIN("TIMESTAMP"), MAX("TIMESTAMP")) * 24 +
    DATEDIFF('HOUR',
        DATEADD('DAY', DATEDIFF('DAY', MIN("TIMESTAMP"), MAX("TIMESTAMP")), MIN("TIMESTAMP")),
        MAX("TIMESTAMP")
    ) AS "total_hours"
FROM "tracking"."positions"
GROUP BY "TRACKID"
```

## Gap Detection

```sql
WITH "with_gaps" AS (
    SELECT "sensor_id", "ts",
        LAG("ts") OVER (PARTITION BY "sensor_id" ORDER BY "ts") AS "prev_ts"
    FROM "schema"."readings"
)
SELECT "sensor_id", "prev_ts" AS "gap_start", "ts" AS "gap_end",
    DATEDIFF('MINUTE', "prev_ts", "ts") AS "gap_minutes"
FROM "with_gaps"
WHERE DATEDIFF('MINUTE', "prev_ts", "ts") > 60
ORDER BY "gap_minutes" DESC
LIMIT 100
```
