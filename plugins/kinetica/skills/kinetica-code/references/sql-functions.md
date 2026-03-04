# Kinetica-Specific SQL Functions

Standard PostgreSQL functions work as expected. This reference covers only
functions that are **unique to Kinetica** or **differ from PostgreSQL**.

## Date/Time — Kinetica Deviations

These replace PostgreSQL's timestamp arithmetic. See core rules for the full list.

| Function | What's Different |
|----------|-----------------|
| `DATEDIFF('unit', start, end)` | **Use instead of** `ts1 - ts2`. Unit is first arg (string). |
| `DATEDIFF(end, begin)` | 2-arg form returns **days only** |
| `DATEADD('unit', amount, dt)` | **Use instead of** `dt + INTERVAL '...'` for programmatic intervals |
| `TIMESTAMPADD(unit, amount, dt)` | Alias for DATEADD |
| `TIMESTAMPDIFF(unit, begin, end)` | Alias for DATEDIFF |
| `TIME_BUCKET(INTERVAL, ts [, offset [, base]])` | Bucket timestamps into intervals. PostgreSQL equivalent: `date_bin()` (PG14+) |
| `DATETIME_BUCKET(ts, INTERVAL)` | Alias for TIME_BUCKET (arg order swapped) |
| `DATE_BUCKET(width, ds [, offset [, base]])` | Bucket dates |
| `DAYOFWEEK(dt)` | 1=Sunday...7=Saturday. **Different from** PostgreSQL DOW (0=Sunday) |
| `DAYNAME(dt)` | Returns 'Monday' etc. PostgreSQL uses `to_char(dt, 'Day')` |
| `EPOCH_MSECS_TO_DATETIME(ms)` | Convert epoch milliseconds to datetime |
| `EPOCH_SECS_TO_DATETIME(secs)` | Convert epoch seconds to datetime |
| `MSECS_SINCE_EPOCH(ts)` | Convert datetime to epoch milliseconds |
| `SECS_SINCE_EPOCH(ts)` | Convert datetime to epoch seconds |
| `UNIX_TIMESTAMP(ts)` | Alias for SECS_SINCE_EPOCH |
| `DATE_TO_EPOCH_MSECS(y,m,d,h,mi,s,ms)` | Component-based epoch conversion |
| `DATE_TO_EPOCH_SECS(y,m,d,h,mi,s)` | Component-based epoch conversion |
| `TIMESTAMP_FROM_DATE_TIME(date, time)` | Combine date and time into timestamp |
| `WEEK_TO_EPOCH_MSECS(year, week)` | Week number to epoch ms |
| `WEEK_TO_EPOCH_SECS(year, week)` | Week number to epoch secs |

## String — Kinetica-Specific

| Function | Description |
|----------|-------------|
| `CONTAINS(text_col, search)` | Substring search, returns TRUE/FALSE |
| `REGEXP_LIKE(col, 'pattern' [, 'mode'])` | POSIX regex. `'i'` = case-insensitive. **Use instead of** `~` / `~*` operators |
| `DIFFERENCE(s1, s2)` | Soundex comparison (0-4, 4=best match) |
| `EDIT_DISTANCE(s1, s2)` | Levenshtein distance (lower=closer) |
| `FILTER_BY_STRING(...)` | Accelerated string filtering (see below) |
| `ILIKE` | Case-insensitive LIKE — supported |

## Aggregate — Kinetica Extensions

| Function | Description |
|----------|-------------|
| `PRODUCT(col)` | Product of all values |
| `RATIO_TO_REPORT(col)` | Ratio of each value to total sum |
| `ARRAY_AGG(col)` | Combine values into array |
| `ARRAY_AGG_DISTINCT(col)` | Combine unique values into array |
| `MEAN(col)` | Alias for AVG |
| `APPROX_COUNT_DISTINCT(expr)` | Approximate count distinct — faster than `COUNT(DISTINCT ...)` |
| `APPROX_MEDIAN(expr)` | Approximate median (~2% accuracy) |
| `APPROX_PERCENTILE(expr, p)` | Approximate percentile (p: 0.0–100.0) |
| `ARG_MAX(agg_expr, ret_expr)` | Value of `ret_expr` where `agg_expr` is maximum |
| `ARG_MIN(agg_expr, ret_expr)` | Value of `ret_expr` where `agg_expr` is minimum |
| `FIRST(ret_expr, order_expr)` | Equivalent to ARG_MIN |
| `LAST(ret_expr, order_expr)` | Equivalent to ARG_MAX |

## Null Handling — Kinetica Extensions

| Function | Description | PostgreSQL Equivalent |
|----------|-------------|---------------------|
| `NVL(expr, default)` | Return default if null | `COALESCE(expr, default)` |
| `NVL2(expr, not_null, null_val)` | Ternary null check | No direct equivalent |
| `IFNULL(expr, alt)` | Alias for NVL | `COALESCE` |
| `REMOVE_NULLABLE(expr)` | Remove nullable wrapper from derived columns | No equivalent |

## Conditional — Kinetica Extensions

| Function | Description |
|----------|-------------|
| `IF(expr, true_val, false_val)` | Ternary function. PostgreSQL uses CASE only |
| `DECODE(expr, match1, val1, ..., default)` | Oracle-style pattern matching |

## Type Conversion — Kinetica Shortcuts

| Function | Target Type |
|----------|-------------|
| `INT(expr)` | INTEGER |
| `LONG(expr)` | BIGINT |
| `DOUBLE(expr)` | DOUBLE |
| `FLOAT(expr)` | REAL |
| `DECIMAL(expr)` | DECIMAL (max precision 27, scale 18) |
| `STRING(expr)` | VARCHAR |
| `ULONG(expr)` | UNSIGNED BIGINT |
| `CHAR1(expr)`...`CHAR256(expr)` | VARCHAR(n) |
| `VECTOR(expr, dim)` | VECTOR type |

Standard `CAST(expr AS type)` and `CONVERT(expr, type)` also work.

**Date/Time formatting:**
| Function | Description |
|----------|-------------|
| `TO_CHAR(dt, format)` | Format datetime as string |
| `TO_DATE(str, format)` | Parse string to date |
| `TO_DATETIME(str, format)` | Parse string to datetime |
| `TO_TIME(str, format)` | Parse string to time |
| `TO_TIMESTAMP(str, format)` | Parse string to timestamp |

Format codes: YYYY, MM, DD, HH24, HH12, MI, SS, MS, AM/PM

## Geospatial Distance (Non-ST_ Functions)

| Function | Description |
|----------|-------------|
| `GEODIST(lon1, lat1, lon2, lat2)` | Great-circle distance in **meters** |
| `DIST(x1, y1, x2, y2)` | Euclidean distance in **degrees** |

## Math — Kinetica Extensions

| Function | Description |
|----------|-------------|
| `WIDTH_BUCKET(expr, min, max, count)` | Assign value to histogram bucket |

## SELECT Extensions

| Feature | Description |
|---------|-------------|
| `SELECT * EXCLUDE (col1, col2)` | Remove columns from wildcard. No PostgreSQL equivalent. |
| `SELECT TOP n ...` | Returns up to n records (max 20,000 default) |

## Window Function Notes

Standard PostgreSQL window functions work (`LAG`, `LEAD`, `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE`, `CUME_DIST`, `PERCENT_RANK`, `FIRST_VALUE`, `LAST_VALUE`).

Kinetica additions:
- `IGNORE NULLS` / `RESPECT NULLS` on `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE`
- Frame bounds: `UNBOUNDED PRECEDING/FOLLOWING`, `CURRENT ROW`, `n PRECEDING/FOLLOWING`
- Both `RANGE` and `ROWS` framing supported

**Critical reminder**: Window functions cannot be nested inside aggregate functions. Always use CTEs.

## FILTER_BY_STRING — Accelerated String Filtering

Table function for fast string matching on fixed-width VARCHAR or TEXT_SEARCH columns:

```sql
SELECT * FROM TABLE(
    FILTER_BY_STRING(
        TABLE_NAME => INPUT_TABLE("schema"."table"),
        COLUMN_NAMES => 'col1,col2',     -- omit for 'search' mode
        MODE => 'contains',               -- contains|equals|regex|starts_with|search
        EXPRESSION => 'pattern',
        OPTIONS => KV_PAIRS(case_sensitive = 'true')
    )
)
```

Modes: `contains` (substring), `equals` (exact), `regex` (POSIX), `starts_with` (prefix), `search` (full-text on TEXT_SEARCH columns — omit COLUMN_NAMES, supports boolean operators and wildcards).
