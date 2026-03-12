---
name: kinetica-query
description: "Kinetica SQL query knowledge. Activate when the user is writing analytical queries for Kinetica, asking about Kinetica-specific functions, or working with geospatial, time-series, graph, or vector data."
---

# Kinetica SQL Dialect

Kinetica is a GPU-accelerated database with a PostgreSQL-compatible SQL dialect.
It handles billions of rows, vector search, geospatial, time-series, and graph analytics.

## Kinetica REST API Access (curl)

When you need to call Kinetica's REST API directly via `curl`, follow these rules exactly.

### Authentication

Read credentials from the `.env` file or environment variables set during Connection Setup.

**Loading `.env` safely** — do NOT use `source .env`; it expands `!` `$` and backticks. Read line-by-line instead:
```bash
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]] && continue
  key="${line%%=*}"
  val="${line#*=}"
  # Strip matching surrounding quotes (single or double)
  if [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]] || \
     [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
    val="${val:1:${#val}-2}"
  fi
  export "$key=$val"
done < .env
```

> **CRITICAL — never paste credentials into Bash commands.** The Bash tool escapes `!` and other
> characters at the transport layer, corrupting passwords. Always load credentials from the `.env`
> file using the loader above within the **same** Bash call as the `curl` command.

**OAuth Bearer token (preferred when available):**
```bash
# Load credentials (must be in same Bash call — env vars don't persist)
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  if [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]] || \
     [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
    val="${val:1:${#val}-2}"
  fi
  export "$key=$val"
done < .env

curl -X POST -k \
  -H "Authorization: Bearer $KINETICA_DB_SKILL_OAUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'
```

**Basic Auth via Authorization header (preferred for username/password):**
```bash
# Load credentials + base64-encode (must be in same Bash call — env vars don't persist)
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  if [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]] || \
     [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
    val="${val:1:${#val}-2}"
  fi
  export "$key=$val"
done < .env

AUTH=$(printf '%s:%s' "$KINETICA_DB_SKILL_USER" "$KINETICA_DB_SKILL_PASS" | base64)

curl -X POST -k \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'
```

### Required curl flags

| Flag | Why |
|------|-----|
| `-X POST` | All Kinetica API endpoints require POST |
| `-k` (or `--insecure`) | Accept self-signed TLS certs (common in Kinetica deployments) |
| `-H "Content-Type: application/json"` | Required for all endpoints |

### Common endpoints

| Endpoint | Example body |
|----------|-------------|
| `/execute/sql` | `{"statement": "SELECT 1", "offset": 0, "limit": 100, "encoding": "json", "options": {}}` |
| `/show/table` | `{"table_name": "*", "options": {"get_sizes": "true"}}` |
| `/show/graph` | `{"graph_name": "*", "options": {}}` |
| `/insert/records/json?table_name=T` | `[{"col1": "val1"}]` (array of records as body) |

### Example: Execute SQL

```bash
# Load credentials + base64-encode (must be in same Bash call — env vars don't persist)
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ "$line" =~ ^[[:space:]]*# ]] || [[ -z "$line" ]] && continue
  key="${line%%=*}"; val="${line#*=}"
  if [[ "${val:0:1}" == "'" && "${val: -1}" == "'" ]] || \
     [[ "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
    val="${val:1:${#val}-2}"
  fi
  export "$key=$val"
done < .env

AUTH=$(printf '%s:%s' "$KINETICA_DB_SKILL_USER" "$KINETICA_DB_SKILL_PASS" | base64)

curl -X POST -k \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/execute/sql" \
  -d '{"statement": "SELECT * FROM my_table LIMIT 5", "offset": 0, "limit": 100, "encoding": "json", "options": {}}'
```

### Parsing Responses

Every Kinetica REST response shares this envelope structure:

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"OK"` on success, `"ERROR"` on failure |
| `message` | string | Empty on success; error description on failure |
| `data_type` | string | Schema identifier for the response payload |
| `data` | object | Binary-encoded payload (usually ignore this) |
| `data_str` | string | **Response metadata** — a JSON-encoded string; must be parsed a second time |

> **Key point:** `data_str` is a JSON *string*, not a JSON object. Parse it via `fromjson` in jq (`JSON.parse()` in JS, `json.loads()` in Python). For SQL results, column data is one level deeper inside a `json_encoded_response` field within the parsed `data_str`.

**Parsed response structure (SQL query):**
```
Response (top level)
├─ status: "OK"
└─ data_str: (JSON string → parse to get metadata)
    ├─ total_number_of_records: 3
    ├─ has_more_records: false
    └─ json_encoded_response: (JSON string → parse to get column data)
        ├─ column_headers: ["id", "name", "value"]
        ├─ column_1: [1, 2, 3]
        ├─ column_2: ["Alice", "Bob", "Carol"]
        └─ column_3: [10.5, 20.3, 30.1]
```

#### Extracting data with `jq`

**Basic — parse `data_str` metadata:**
```bash
curl ... | jq '.data_str | fromjson'
```

**SQL results — column headers and row count:**
```bash
curl ... | jq '(.data_str | fromjson) as $meta | ($meta.json_encoded_response | fromjson) as $d | {headers: $d.column_headers, rows: $meta.total_number_of_records}'
```

**Show table — extract table names:**
```bash
curl ... | jq '.data_str | fromjson | .table_names'
```

**Error checking — guard before parsing:**
```bash
curl ... | jq 'if .status == "ERROR" then {error: .message} else (.data_str | fromjson) end'
```

### Gotchas

- **Always POST** — GET requests will fail or return unexpected results
- **Never use `-u`** — it requires inlining credentials in the command string, which corrupts `!` and other characters at the Bash tool transport layer
- **Include `options: {}`** — most endpoints require the options field even if empty
- **Use the full URL** — include `/_gpudb/` prefix if connecting through a reverse proxy (e.g., `https://host/_gpudb/show/table`)
- **`data_str` is multi-layered** — the value is a JSON *string* containing metadata; for SQL results, column data is nested inside `json_encoded_response` (another JSON string requiring a second parse)

**Critical**: Kinetica SQL has important deviations from standard PostgreSQL.
Read [references/kinetica-core-rules.md](references/kinetica-core-rules.md) before writing any query.

## Key Differences from PostgreSQL

- No nested aggregate functions — use subqueries or CTEs instead
- No backticks — use double quotes for identifiers
- `DATEDIFF` / `DATEADD` instead of timestamp arithmetic
- Case-sensitive identifiers — always match exact column names
- `DECIMAL` not `NUMERIC`

## Domain Capabilities

### SQL Core
See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) — **read this first**.
See [references/sql-functions.md](references/sql-functions.md) for Kinetica-specific functions.
See [references/sql-patterns.md](references/sql-patterns.md) for common query patterns.

### DDL & DML
CREATE TABLE with shard keys, partitioning, tier strategies, vector indexes.
LOAD DATA for bulk ingestion, EXPORT for data extraction, upsert hints.
See [references/ddl-reference.md](references/ddl-reference.md) and [references/dml-reference.md](references/dml-reference.md).

### Geospatial
ST_* and accelerated STXY_* functions, H3 spatial indexing, SRID 4326 only,
solution parameter (Euclidean/Haversine/Vincenty).
See [references/geospatial-functions.md](references/geospatial-functions.md) and [references/geospatial-examples.md](references/geospatial-examples.md).

### Time-Series
TIME_BUCKET, DATEDIFF/DATEADD, window functions, ASOF joins for temporal proximity.
See [references/timeseries-functions.md](references/timeseries-functions.md) and [references/timeseries-examples.md](references/timeseries-examples.md).

### Vector Search & Embeddings
Vector distance functions (L2, Cosine, Inner Product), GENERATE_EMBEDDINGS UDF,
and semantic search patterns.
See [references/vector-patterns.md](references/vector-patterns.md).

### JSON, Arrays & Text Search
JSON_EXTRACT_VALUE (must CAST!), ARRAY_CONTAINS, UNNEST, REGEXP_LIKE, fuzzy matching.
See [references/json-array-text.md](references/json-array-text.md).

### Graph Analytics
Build property graphs from existing tables, query with Cypher, run algorithms
(shortest path, page rank, TSP). No separate graph database needed.
See [references/graph-functions.md](references/graph-functions.md) and [references/graph-examples.md](references/graph-examples.md).

### UDFs, Procedures & ML
User-Defined Functions (Python), scheduled SQL procedures, built-in ML (PREDICT, OUTLIERS),
and Docker model management.
See [references/udf-reference.md](references/udf-reference.md).

## Query Writing Guidelines

1. Always check column names and types before writing SQL — Kinetica is case-sensitive
2. Quote schema-qualified table names: `"schema"."table"`
3. Use LIMIT for exploration queries
4. Use CTEs instead of nested subqueries with aggregates
5. For date math, always use DATEDIFF/DATEADD — never subtract timestamps directly
6. When in doubt, consult the relevant reference file for the domain
