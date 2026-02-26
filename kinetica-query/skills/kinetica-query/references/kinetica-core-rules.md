# Kinetica SQL Core Rules

Kinetica SQL is PostgreSQL-compatible with specific deviations. These rules
are CRITICAL — violating them causes hard errors.

## Highest Priority Rules

1. **NEVER nest aggregate functions** — `SUM(COUNT(*))`, `AVG(LAG(...))` will fail.
   Always use CTEs or subqueries to separate window functions from aggregates.
2. **ONLY use columns that exist in the schema** — verify against DDL. Case-sensitive.
3. **DO NOT subtract timestamps** — use `DATEDIFF('unit', start, end)` instead.
4. **NEVER use backticks** — use ANSI double quotes (`"`) for all identifiers.
5. **ALWAYS fully-qualify table names** — `"schema"."table"` format.
6. **ST_DISTANCE takes exactly 3 arguments** — `ST_DISTANCE(geom1, geom2, solution)`.
7. **No RECURSIVE CTEs** — `WITH RECURSIVE` is not supported.
8. **No trailing semicolons** — omit `;` at end of queries.
9. **Default LIMIT 100** — unless user requests all records.

## Identifier Quoting

- Double-quote ALL identifiers: schema names, table names, column names, aliases
- Identifiers are CASE-SENSITIVE: `"UserID"` ≠ `"userid"`
- Example: `SELECT "c"."customer_name" FROM "sales"."customers" AS "c"`

## Aggregate + Window Function Separation

```sql
-- WRONG: nested aggregate
SELECT AVG(LAG("value") OVER (...)) FROM ...

-- CORRECT: use CTE
WITH "lagged" AS (
    SELECT *, LAG("value") OVER (ORDER BY "ts") AS "prev_value"
    FROM "schema"."table"
)
SELECT AVG("prev_value") FROM "lagged"
```

## Date/Time Handling

| Function | Description |
|----------|-------------|
| `DATEDIFF('unit', start, end)` | Timestamp difference (HOUR, DAY, MINUTE, etc.) |
| `DATEADD('unit', amount, datetime)` | Add interval to datetime |
| `EXTRACT(part FROM datetime)` | Extract YEAR, MONTH, DAY, HOUR, DOW, etc. |
| `TIME_BUCKET(INTERVAL 'n' UNIT, col)` | Bucket into fixed intervals |
| `DAYNAME(date)` | Full day name ('Monday', etc.) |
| `DAYOFWEEK(date)` | 1=Sunday through 7=Saturday |

Units for DATEDIFF/DATEADD: MICROSECOND, MILLISECOND, SECOND, MINUTE, HOUR, DAY, WEEK, MONTH, QUARTER, YEAR

**INTERVAL syntax:** `INTERVAL '30' MINUTE`, `INTERVAL '1' DAY`

## Column Validation

- Before including ANY column, verify it exists in the provided DDL
- If a column doesn't exist, use the closest available + SQL comment explaining
- Use `COALESCE(column, default)` for nullable columns

## Other Notable Features

| Feature | Description |
|---------|-------------|
| `SELECT * EXCLUDE (col1, col2)` | Exclude columns from wildcard select |
| Standard CTEs | `WITH ... AS (...)` — no RECURSIVE |
| `information_schema.columns` | Query for column_name, data_type only |
