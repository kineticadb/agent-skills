# Time-Series Functions Reference

Use these with `toolbelt_sql` when questions involve trends, temporal patterns, or time bucketing.

## Time Bucketing
| Function | Description |
|----------|-------------|
| `DATETIME_BUCKET(ts, INTERVAL '1 HOUR')` | Bucket into fixed intervals |
| `DATE_TRUNC('day', ts)` | Truncate to day/week/month/year boundary |
| `EXTRACT(unit FROM ts)` | Extract YEAR, MONTH, DAY, HOUR, MINUTE, SECOND |

## Window Functions
| Function | Description |
|----------|-------------|
| `LAG(col, n) OVER (ORDER BY ts)` | Value n rows back (default 1) |
| `LEAD(col, n) OVER (ORDER BY ts)` | Value n rows ahead (default 1) |
| `FIRST_VALUE(col) OVER (ORDER BY ts)` | First value in window |
| `LAST_VALUE(col) OVER (ORDER BY ts)` | Last value in window |
| `ROW_NUMBER() OVER (ORDER BY ts)` | Sequential row number |
| `RANK() OVER (ORDER BY col)` | Rank with gaps for ties |
| `DENSE_RANK() OVER (ORDER BY col)` | Rank without gaps |

## Moving Aggregates
```sql
-- 7-day moving average
AVG(value) OVER (ORDER BY ts ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)

-- Cumulative sum
SUM(value) OVER (ORDER BY ts ROWS UNBOUNDED PRECEDING)

-- Moving min/max (30-day window)
MIN(value) OVER (ORDER BY ts ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
MAX(value) OVER (ORDER BY ts ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
```

## Date Arithmetic

**CRITICAL**: Do NOT subtract timestamps directly. Use `DATEDIFF`.

| Function | Description |
|----------|-------------|
| `DATEDIFF('unit', start, end)` | Difference in specified unit |
| `DATEADD('unit', amount, datetime)` | Add amount to datetime |
| `NOW()` | Current timestamp |
| `DAYNAME(date)` | Full day name ('Monday', etc.) |
| `DAYOFWEEK(date)` | 1=Sunday through 7=Saturday |

Units: MICROSECOND, MILLISECOND, SECOND, MINUTE, HOUR, DAY, WEEK, MONTH, QUARTER, YEAR

**INTERVAL syntax**: `INTERVAL '30' MINUTE`, `INTERVAL '1' DAY`

## ASOF Joins

Join time-series data based on closest preceding/succeeding timestamp:

`ASOF(left_time, right_time, range_begin, range_end, MIN|MAX)`
- `MIN`: closest record at or before
- `MAX`: closest record at or after

```sql
SELECT "t"."trade_id", "q"."price" AS "quote_price_at_trade"
FROM "trades" AS "t"
INNER JOIN "quotes" AS "q"
    ON "t"."symbol" = "q"."symbol"
    AND ASOF("t"."trade_ts", "q"."quote_ts", INTERVAL '0' SECOND, INTERVAL '10' SECOND, MIN)
```

## Common Intervals
- `INTERVAL '1 MINUTE'`, `'5 MINUTES'`, `'15 MINUTES'`
- `INTERVAL '1 HOUR'`, `'6 HOURS'`, `'12 HOURS'`
- `INTERVAL '1 DAY'`, `'7 DAYS'`, `'30 DAYS'`
- `INTERVAL '1 MONTH'`, `'3 MONTHS'`, `'1 YEAR'`
