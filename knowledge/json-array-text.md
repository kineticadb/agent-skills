# Kinetica JSON, Array & Text Search Reference

Standard PostgreSQL string functions work (`SUBSTRING`, `REPLACE`, `LENGTH`, `TRIM`,
`LPAD`, `RPAD`, `CONCAT`, `||`, `UPPER`, `LOWER`, `LIKE`).
This covers Kinetica-specific functions and differences.

## JSON Handling (Kinetica-Specific)

| Function | Description |
|----------|-------------|
| `JSON_EXTRACT_VALUE(json_col, 'path')` | Extract scalar value as **TEXT** |
| `JSON_EXTRACT(json_col, 'path')` | Extract JSON fragment (object/array) as JSON |

**CRITICAL**: `JSON_EXTRACT_VALUE` always returns TEXT. You **MUST CAST** for non-text operations:

```sql
-- WRONG — comparing text to number
WHERE JSON_EXTRACT_VALUE("payload", '$.count') > 100

-- CORRECT — cast first
WHERE CAST(JSON_EXTRACT_VALUE("payload", '$.count') AS INTEGER) > 100
```

**Path notation**: Standard JSONPath — `$.key`, `$.nested.key`, `$.array[0].attr`
(array indexing within JSONPath is **0-based**)

### Comparison with PostgreSQL

| Kinetica | PostgreSQL |
|----------|-----------|
| `JSON_EXTRACT_VALUE(col, '$.key')` | `col ->> 'key'` |
| `JSON_EXTRACT(col, '$.key')` | `col -> 'key'` |
| `JSON_EXTRACT_VALUE(col, '$.a.b')` | `col #>> '{a,b}'` |
| Must use `CAST()` explicitly | `jsonb` operators auto-coerce in some contexts |

```sql
-- Extract and aggregate JSON values
SELECT
    JSON_EXTRACT_VALUE("event", '$.user.name') AS "user_name",
    AVG(CAST(JSON_EXTRACT_VALUE("event", '$.metrics.latency_ms') AS DOUBLE)) AS "avg_latency"
FROM "schema"."events"
GROUP BY "user_name"
ORDER BY "avg_latency" DESC
LIMIT 100
```

## Array Handling

### Kinetica-Specific Array Functions

| Function | Description |
|----------|-------------|
| `ARRAY_CONTAINS(array, value)` | TRUE if array contains value. **Use instead of** PostgreSQL `value = ANY(array)` |
| `ARRAY_CONTAINS_ALL(arr1, arr2)` | All arr2 elements exist in arr1 |
| `ARRAY_CONTAINS_ANY(arr1, arr2)` | Any arr2 element exists in arr1 |
| `ARRAY_DISTINCT(array)` | Remove duplicates |
| `ARRAY_EXCEPT(arr1, arr2)` | Elements in arr1 not in arr2 |
| `ARRAY_INTERSECT(arr1, arr2)` | Elements in both arrays |
| `ARRAY_EMPTY(array)` | TRUE if empty |
| `ARRAY_NOT_EMPTY(array)` | TRUE if not empty |

### Standard Array Functions (PostgreSQL-compatible)

| Function | Description |
|----------|-------------|
| `UNNEST(array)` | Flatten array to rows |
| `ARRAY_APPEND(array, value)` | Append value |
| `ARRAY_CONCAT(arr1, arr2)` | Combine arrays |
| `ARRAY_ITEM(array, pos)` | Element at position |
| `ARRAY_LENGTH(array)` | Count items |
| `ARRAY_LOWER(array, dim)` | Lowest index |
| `ARRAY_UPPER(array, dim)` | Highest index |
| `ARRAY_NDIMS(array)` | Dimension count |
| `ARRAY_SLICE(array, from, to)` | Extract subarray |
| `ARRAY_TO_STRING(array, delim)` | Join elements to string |
| `STRING_TO_ARRAY(str, delim)` | Split string to array |
| `MAKE_ARRAY(value)` | Create single-element array |
| `UNNEST_JSON_ARRAY` | Transpose JSON array to columns |

**Indexing is 1-based**: `"my_array"[1]` = first element

### UNNEST Pattern

```sql
-- Flatten array and get distinct values
SELECT DISTINCT "p"."protocol"
FROM "schema"."logs", UNNEST("logs"."protocols_array") AS "p"("protocol")

-- Join unnested elements to another table
SELECT "d"."doc_id", "t"."tag_name"
FROM "schema"."documents" AS "d",
    UNNEST("d"."tags_array") AS "tags"("tag_id")
INNER JOIN "schema"."tag_definitions" AS "t" ON "tags"."tag_id" = "t"."id"

-- Filter by array contents
SELECT * FROM "schema"."events"
WHERE ARRAY_CONTAINS("categories", 'critical')
```

## Text Search (Kinetica-Specific)

| Function | Description | PostgreSQL Equivalent |
|----------|-------------|---------------------|
| `CONTAINS(text_col, search)` | Substring search, TRUE/FALSE | `strpos(col, str) > 0` or `LIKE '%...%'` |
| `REGEXP_LIKE(col, 'pattern' [, 'mode'])` | POSIX regex match | `col ~ 'pattern'` or `col ~* 'pattern'` |
| `DIFFERENCE(s1, s2)` | Soundex comparison (0-4, 4=best) | `difference()` (fuzzystrmatch extension) |
| `EDIT_DISTANCE(s1, s2)` | Levenshtein distance | `levenshtein()` (fuzzystrmatch extension) |
| `FILTER_BY_STRING(...)` | Specialized string filtering | No equivalent |
| `ILIKE` | Case-insensitive LIKE | Same |

**Case-insensitive search** — always use `LOWER()` on both sides for explicit control:
```sql
WHERE LOWER("description") LIKE LOWER('%search term%')
```

**Regex with case-insensitive flag:**
```sql
WHERE REGEXP_LIKE("log_message", 'error.*critical', 'i')
```

**Fuzzy matching:**
```sql
-- Find similar names (Soundex)
SELECT * FROM "schema"."customers"
WHERE DIFFERENCE("name", 'Smith') >= 3

-- Find close spellings (Levenshtein)
SELECT * FROM "schema"."products"
WHERE EDIT_DISTANCE("product_name", 'iPhone') <= 2
```

## TEXT_SEARCH Column Property

For full-text search on large text columns, enable the `TEXT_SEARCH` property:

```sql
CREATE TABLE "schema"."documents" (
    "id" INT NOT NULL,
    "content" VARCHAR TEXT_SEARCH,
    PRIMARY KEY ("id")
)
```

This enables indexing for `CONTAINS` and other text operations.
