# Kinetica SQL Core Rules

Kinetica SQL is **PostgreSQL-compatible**. Use standard PostgreSQL syntax, functions,
and behavior as your baseline. The deviations below **override** PostgreSQL behavior.
When no Kinetica-specific rule exists, fall back to PostgreSQL.

## PostgreSQL Baseline — What Works As-Is

These PostgreSQL features work in Kinetica without modification:
- Standard `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`
- `INNER JOIN`, `LEFT OUTER JOIN`, `RIGHT OUTER JOIN`, `FULL OUTER JOIN`, `CROSS JOIN`
- `UNION [ALL]`, `INTERSECT [ALL]`, `EXCEPT [ALL]`
- Window functions: `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `LAG`, `LEAD`, `NTILE`, `FIRST_VALUE`, `LAST_VALUE`
- `CASE WHEN`, `COALESCE`, `NULLIF`, `CAST`
- Standard aggregate functions: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `STDDEV`, `VAR`
- CTEs with `WITH ... AS (...)` (but NOT `WITH RECURSIVE`)
- Subqueries (correlated and non-correlated)
- `LIKE`, `IN`, `BETWEEN`, `EXISTS`, `IS NULL`
- Standard math: `ROUND`, `ABS`, `CEIL`, `FLOOR`, `MOD`, `POWER`, `SQRT`, `LOG`, `EXP`
- Standard string: `UPPER`, `LOWER`, `TRIM`, `SUBSTRING`, `CONCAT`, `||`, `LENGTH`, `REPLACE`, `LPAD`, `RPAD`
- `EXTRACT(part FROM datetime)`, `DATE_TRUNC('unit', ts)`, `NOW()`

## Highest Priority Rules — Common Errors

1. **NEVER nest aggregate functions** — `SUM(COUNT(*))`, `AVG(LAG(...))`, `MAX(AVG(...))` will fail with "Aggregate expressions cannot be nested". Always use CTEs to separate window functions from aggregates.
2. **Case-sensitive identifiers** — `"UserID"` ≠ `"userid"`. Verify column names against DDL.
3. **DO NOT subtract timestamps** — `ts1 - ts2` fails. Use `DATEDIFF('unit', start, end)`.
4. **NEVER use backticks** — only ANSI double quotes (`"`) for identifiers.
5. **ALWAYS fully-qualify table names** — `"schema"."table"` format.
6. **ST_DISTANCE takes exactly 3 arguments** — `ST_DISTANCE(geom1, geom2, solution)`.
7. **No RECURSIVE CTEs** — `WITH RECURSIVE` is not supported.
8. **No trailing semicolons** — omit `;` at end of queries.
9. **Default LIMIT 100** — always append unless user specifies otherwise.

## Nested Aggregates — Mandatory CTE Pattern

This is the #1 source of errors. Kinetica **strictly prohibits** any nesting:

```sql
-- WRONG — will always fail
SELECT AVG(STXY_DISTANCE("X", "Y",
    ST_MAKEPOINT(LAG("X") OVER (...), LAG("Y") OVER (...)), 1))
FROM "tracking"."positions"

-- CORRECT — separate into CTEs
WITH "step1" AS (
    SELECT *,
        LAG("X") OVER (PARTITION BY "id" ORDER BY "ts") AS "prev_X",
        LAG("Y") OVER (PARTITION BY "id" ORDER BY "ts") AS "prev_Y"
    FROM "tracking"."positions"
),
"step2" AS (
    SELECT *,
        STXY_DISTANCE("X", "Y", ST_MAKEPOINT("prev_X", "prev_Y"), 1) AS "dist"
    FROM "step1"
    WHERE "prev_X" IS NOT NULL
)
SELECT AVG("dist") AS "avg_distance" FROM "step2"
LIMIT 100
```

## Date/Time — Kinetica Differences

**Use these instead of PostgreSQL timestamp arithmetic:**

| Function | Description | PostgreSQL Equivalent |
|----------|-------------|---------------------|
| `DATEDIFF('unit', start, end)` | Difference in unit | `EXTRACT(EPOCH FROM end - start)` |
| `DATEDIFF(end, begin)` | Difference in **days** only (2-arg form) | `end::date - begin::date` |
| `DATEADD('unit', amount, datetime)` | Add interval | `datetime + INTERVAL '...'` |
| `TIME_BUCKET(INTERVAL 'n' UNIT, ts)` | Bucket timestamps | `date_bin()` (PG14+) |
| `DATETIME_BUCKET(ts, INTERVAL 'n' UNIT)` | Alias for TIME_BUCKET | — |
| `DAYOFWEEK(date)` | 1=Sunday...7=Saturday | `EXTRACT(DOW)` is 0=Sunday |
| `DAYNAME(date)` | Full name ('Monday') | `to_char(date, 'Day')` |
| `EPOCH_MSECS_TO_DATETIME(ms)` | Epoch ms → datetime | `to_timestamp(ms/1000)` |
| `EPOCH_SECS_TO_DATETIME(secs)` | Epoch secs → datetime | `to_timestamp(secs)` |
| `MSECS_SINCE_EPOCH(ts)` | datetime → epoch ms | — |

Units: MICROSECOND, MILLISECOND, SECOND, MINUTE, HOUR, DAY, WEEK, MONTH, QUARTER, YEAR

**INTERVAL syntax:** `INTERVAL '30' MINUTE`, `INTERVAL '1' DAY`

## Kinetica-Specific Functions

| Function | Description |
|----------|-------------|
| `SELECT * EXCLUDE (col1, col2)` | Remove columns from wildcard |
| `IF(expr, true_val, false_val)` | Ternary (PostgreSQL uses CASE only) |
| `DECODE(expr, match1, val1, ..., default)` | Pattern matching |
| `NVL(expr, default)` / `NVL2(expr, not_null, null_val)` | Null handling |
| `REMOVE_NULLABLE(expr)` | Removes nullable wrapper from derived columns |
| `CONTAINS(text_col, search)` | Substring search (TRUE/FALSE) |
| `REGEXP_LIKE(col, 'pattern', 'i')` | Regex match. `'i'` = case-insensitive |
| `DIFFERENCE(s1, s2)` | Soundex comparison (0-4, 4=best) |
| `EDIT_DISTANCE(s1, s2)` | Levenshtein distance |
| `FILTER_BY_STRING(...)` | Specialized string filtering |
| `PRODUCT(col)` | Product of values (aggregate) |
| `RATIO_TO_REPORT(col)` | Ratio of value to sum (aggregate) |
| `ARRAY_AGG(col)` / `ARRAY_AGG_DISTINCT(col)` | Combine values into array |
| `GEODIST(lon1, lat1, lon2, lat2)` | Great-circle distance (meters) |
| `DIST(x1, y1, x2, y2)` | Euclidean distance (degrees) |
| `WIDTH_BUCKET(expr, min, max, count)` | Histogram bucket assignment |

## Type Conversion — Kinetica Shortcuts

| Function | Description |
|----------|-------------|
| `INT(expr)` | Cast to INTEGER |
| `LONG(expr)` | Cast to BIGINT |
| `DOUBLE(expr)` | Cast to DOUBLE |
| `FLOAT(expr)` | Cast to REAL |
| `DECIMAL(expr)` | Cast to DECIMAL (not NUMERIC) |
| `STRING(expr)` | Cast to VARCHAR |
| `ULONG(expr)` | Cast to UNSIGNED BIGINT |
| `VECTOR(expr, dim)` | Cast stringified array to VECTOR |

Note: `DECIMAL` not `NUMERIC` — max precision 27, max scale 18.

## GROUP BY Extensions

- `ROLLUP`, `CUBE`, `GROUPING SETS` — supported
- `GROUPING(col)` — distinguishes aggregated nulls from generated nulls

## PIVOT / UNPIVOT

```sql
-- Denormalize
SELECT * FROM "table"
PIVOT (SUM("amount") FOR "category" IN ('A', 'B', 'C'))

-- Normalize
SELECT * FROM "table"
UNPIVOT ("value" FOR "category" IN ("col_a", "col_b", "col_c"))
```

## Query Hints (Kinetica-Specific)

| Hint | Purpose |
|------|---------|
| `/* KI_HINT_UPDATE_ON_EXISTING_PK */` | Upsert: update existing rows on PK match |
| `/* KI_HINT_IGNORE_EXISTING_PK */` | Skip duplicate PK rows on INSERT |
| `/* KI_HINT_GROUP_BY_PK */` | Create PK on GROUP BY columns (CTAS) |
| `/* KI_HINT_INDEX(col1, col2) */` | Create indexes on columns (CTAS) |
| `/* KI_SHARD_KEY(col) */` | Define shard key on result (CTAS) |
| `/* KI_HINT_PROJECT_MATERIALIZED_VIEW */` | Use materialized view |
| `/* KI_HINT_SAVE_UDF_STATS */` | Save UDF execution stats |

## ITER Virtual Table

Generate row sequences (no PostgreSQL equivalent):
```sql
SELECT * FROM "table", ITER WHERE ITER.i < 10
```

## information_schema

```sql
SELECT "column_name", "data_type"
FROM "information_schema"."columns"
WHERE "table_schema" = 'my_schema' AND "table_name" = 'my_table'
```

## Self-Correction Checklist

1. Any nested aggregates or window-inside-aggregate patterns? → Use CTE
2. Timestamp subtraction? → Use DATEDIFF
3. ST_DISTANCE has 3 args?
4. All identifiers double-quoted and case-correct?
5. LIMIT applied?
6. Column names verified against schema?
