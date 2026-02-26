# Kinetica SQL Functions Reference

PostgreSQL-compatible with Kinetica-specific extensions.
See kinetica-core-rules.md for critical rules (quoting, no nested aggs, etc.)

## Aggregate Functions
| Function | Description |
|----------|-------------|
| `COUNT(*)` / `COUNT(col)` | Count rows / non-null values |
| `SUM(col)` | Sum of values |
| `AVG(col)` | Average |
| `MIN(col)` / `MAX(col)` | Minimum / Maximum |
| `STDDEV(col)` | Standard deviation |
| `VAR(col)` | Variance |
| `COUNT(DISTINCT col)` | Distinct count |

## String Functions
| Function | Description |
|----------|-------------|
| `UPPER(s)` / `LOWER(s)` | Case conversion |
| `TRIM(s)` | Remove whitespace |
| `SUBSTRING(s, start, len)` | Extract substring |
| `CONCAT(s1, s2)` | Concatenate strings |
| `LENGTH(s)` | String length |
| `REPLACE(s, old, new)` | Replace substring |

## Date/Time Functions
| Function | Description |
|----------|-------------|
| `NOW()` | Current timestamp |
| `DATE_TRUNC('unit', ts)` | Truncate to unit boundary |
| `EXTRACT(unit FROM ts)` | Extract component |
| `DATETIME_BUCKET(ts, INTERVAL)` | Bucket into intervals |
| `DATEDIFF('unit', ts1, ts2)` | Difference between timestamps |

## Numeric Functions
| Function | Description |
|----------|-------------|
| `ROUND(n, decimals)` | Round to decimals |
| `CEIL(n)` / `FLOOR(n)` | Round up / down |
| `ABS(n)` | Absolute value |
| `MOD(n, m)` | Modulo |

## Conditional
| Function | Description |
|----------|-------------|
| `CASE WHEN ... THEN ... ELSE ... END` | Conditional logic |
| `COALESCE(a, b, c)` | First non-null value |
| `NULLIF(a, b)` | NULL if a equals b |
| `IF(cond, then, else)` | Inline conditional |

## Kinetica-Specific

| Feature | Description |
|---------|-------------|
| `SELECT * EXCLUDE (col1, col2)` | Exclude columns from wildcard |
| `CONTAINS(text_col, search)` | Substring search (TRUE/FALSE) |
| `REGEXP_LIKE(col, 'pattern', 'i')` | Regex match ('i' = case-insensitive) |
| `DIFFERENCE(s1, s2)` | Soundex comparison (0-4, 4 = best) |
| `EDIT_DISTANCE(s1, s2)` | Levenshtein distance |
