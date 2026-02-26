# Kinetica Time-Series Query Examples

All examples use Kinetica-specific syntax: double-quoted identifiers,
DATEDIFF/DATEADD instead of timestamp arithmetic, CTEs for window+aggregate.

## Daily Trend

```sql
SELECT DATE_TRUNC('day', "created_at") AS "day",
    COUNT(*) AS "order_count",
    SUM("total") AS "daily_revenue"
FROM "sales"."orders"
WHERE "created_at" >= DATEADD('DAY', -30, NOW())
GROUP BY "day"
ORDER BY "day"
LIMIT 100
```

## Time Bucketing (15-minute intervals)

```sql
SELECT TIME_BUCKET(INTERVAL '15' MINUTE, "ts") AS "bucket",
    AVG("temperature") AS "avg_temp",
    MAX("temperature") AS "max_temp",
    MIN("temperature") AS "min_temp",
    COUNT(*) AS "readings"
FROM "iot"."sensor_readings"
WHERE "ts" >= DATEADD('DAY', -7, NOW())
GROUP BY "bucket"
ORDER BY "bucket"
LIMIT 100
```

## 7-Day Moving Average (CTE Pattern)

Must use CTE because LAG/window can't be nested inside aggregate:

```sql
WITH "daily" AS (
    SELECT DATE_TRUNC('day', "created_at") AS "day",
        SUM("amount") AS "daily_sales"
    FROM "sales"."transactions"
    GROUP BY "day"
)
SELECT "day", "daily_sales",
    AVG("daily_sales") OVER (
        ORDER BY "day" ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS "moving_avg_7d"
FROM "daily"
ORDER BY "day"
LIMIT 100
```

## Period-over-Period Comparison (CTE Required)

```sql
WITH "monthly" AS (
    SELECT DATE_TRUNC('month', "created_at") AS "month",
        SUM("revenue") AS "revenue"
    FROM "sales"."orders"
    GROUP BY "month"
),
"with_prev" AS (
    SELECT "month", "revenue",
        LAG("revenue") OVER (ORDER BY "month") AS "prev_revenue"
    FROM "monthly"
)
SELECT "month", "revenue", "prev_revenue",
    ROUND(("revenue" - "prev_revenue") * 100.0 / "prev_revenue", 2) AS "pct_change"
FROM "with_prev"
WHERE "prev_revenue" IS NOT NULL
ORDER BY "month"
LIMIT 100
```

## Peak Hours Analysis

```sql
SELECT EXTRACT(HOUR FROM "created_at") AS "hour_of_day",
    COUNT(*) AS "request_count",
    AVG("response_time_ms") AS "avg_response_ms"
FROM "api"."logs"
WHERE "created_at" >= DATEADD('DAY', -7, NOW())
GROUP BY "hour_of_day"
ORDER BY "hour_of_day"
LIMIT 100
```

## Latest Record Per Group

```sql
WITH "ranked" AS (
    SELECT *,
        ROW_NUMBER() OVER (PARTITION BY "device_id" ORDER BY "ts" DESC) AS "rn"
    FROM "iot"."sensor_data"
)
SELECT * EXCLUDE ("rn")
FROM "ranked"
WHERE "rn" = 1
LIMIT 100
```

## ASOF Join — Match Trade to Quote

```sql
SELECT "t"."trade_id", "t"."symbol", "t"."trade_ts",
    "t"."quantity", "t"."price" AS "trade_price",
    "q"."bid", "q"."ask", "q"."quote_ts"
FROM "market"."trades" AS "t"
INNER JOIN "market"."quotes" AS "q"
    ON "t"."symbol" = "q"."symbol"
    AND ASOF("t"."trade_ts", "q"."quote_ts",
             INTERVAL '0' SECOND, INTERVAL '10' SECOND, MIN)
LIMIT 100
```

## Gap Detection

```sql
WITH "with_gaps" AS (
    SELECT "sensor_id", "ts",
        LAG("ts") OVER (PARTITION BY "sensor_id" ORDER BY "ts") AS "prev_ts"
    FROM "iot"."readings"
)
SELECT "sensor_id", "prev_ts" AS "gap_start", "ts" AS "gap_end",
    DATEDIFF('MINUTE', "prev_ts", "ts") AS "gap_minutes"
FROM "with_gaps"
WHERE DATEDIFF('MINUTE', "prev_ts", "ts") > 60
ORDER BY "gap_minutes" DESC
LIMIT 100
```

## Cumulative Sum

```sql
WITH "daily" AS (
    SELECT DATE_TRUNC('day', "created_at") AS "day",
        SUM("amount") AS "daily_amount"
    FROM "finance"."transactions"
    WHERE "created_at" >= DATEADD('MONTH', -1, NOW())
    GROUP BY "day"
)
SELECT "day", "daily_amount",
    SUM("daily_amount") OVER (ORDER BY "day" ROWS UNBOUNDED PRECEDING) AS "running_total"
FROM "daily"
ORDER BY "day"
LIMIT 100
```

## Duration Calculation

```sql
-- Time spent in port per vessel
SELECT "TRACKID",
    DATEDIFF('HOUR', MIN("TIMESTAMP"), MAX("TIMESTAMP")) AS "hours_in_port"
FROM "vessel_tracking"."port_visits"
GROUP BY "TRACKID"
ORDER BY "hours_in_port" DESC
LIMIT 100
```

## Day-of-Week Analysis

```sql
-- Note: DAYOFWEEK is 1=Sunday...7=Saturday (different from PostgreSQL DOW)
SELECT DAYNAME("created_at") AS "day_name",
    DAYOFWEEK("created_at") AS "day_num",
    COUNT(*) AS "order_count",
    SUM("total") AS "revenue"
FROM "sales"."orders"
WHERE "created_at" >= DATEADD('MONTH', -3, NOW())
GROUP BY "day_name", "day_num"
ORDER BY "day_num"
```
