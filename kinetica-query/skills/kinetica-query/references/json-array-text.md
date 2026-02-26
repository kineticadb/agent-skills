# JSON, Array & Text Search Reference

## Array Handling

| Function | Description |
|----------|-------------|
| `ARRAY_CONTAINS(array_col, value)` | TRUE if array contains value |
| `UNNEST(array_col)` | Flatten array to rows |
| `ARRAY_TO_STRING(array, delim)` | Join array elements into string |
| `ARRAY_UPPER(array, dim)` | Upper bound of array dimension |

- **Indexing is 1-based**: `my_array[1]` = first element
- Flatten example:
```sql
SELECT DISTINCT "p"."protocol"
FROM "schema"."logs", UNNEST("logs"."protocols_array") AS "p"("protocol")
```

## JSON Handling

| Function | Description |
|----------|-------------|
| `JSON_EXTRACT_VALUE(json_col, 'path')` | Extract scalar as TEXT |
| `JSON_EXTRACT(json_col, 'path')` | Extract JSON fragment |

**CRITICAL**: `JSON_EXTRACT_VALUE` always returns TEXT.
Cast if you need another type:
```sql
CAST(JSON_EXTRACT_VALUE("payload", '$.count') AS INTEGER)
```

**Path notation**: Standard JSONPath — `$.key`, `$.nested.key`, `$.array[0].attr` (0-based within paths)

### Comparison with PostgreSQL

| Kinetica | PostgreSQL |
|----------|-----------|
| `JSON_EXTRACT_VALUE(col, '$.key')` | `col ->> 'key'` |
| `JSON_EXTRACT(col, '$.key')` | `col -> 'key'` |

## Text Search

| Function | Description |
|----------|-------------|
| `CONTAINS(text_col, search)` | TRUE if text contains substring |
| `REGEXP_LIKE(text_col, 'pattern', 'mode')` | Regex match ('i' = case-insensitive) |
| `DIFFERENCE(str_a, str_b)` | Soundex comparison (0-4, 4 = best match) |
| `EDIT_DISTANCE(str_a, str_b)` | Levenshtein distance (lower = better) |

**Case-insensitive search**: Always use `LOWER()` on both sides:
```sql
WHERE LOWER("description") LIKE LOWER('%search_term%')
```

**Regex example**:
```sql
WHERE REGEXP_LIKE("log_message", 'error.*critical', 'i')
```

## Standard String Functions

`SUBSTRING`, `REPLACE`, `LENGTH`, `TRIM`, `LPAD`, `RPAD`, `CONCAT` (or `||`),
`UPPER`, `LOWER` — all PostgreSQL-compatible.
