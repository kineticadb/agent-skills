---
name: kinetica-admin
description: "Kinetica database administration knowledge. Activate when the user is monitoring cluster health, diagnosing performance issues, managing resource groups, or optimizing Kinetica deployments."
---

# Kinetica Database Administration

Kinetica is a GPU-accelerated database. This skill teaches you to monitor, diagnose,
and optimize Kinetica clusters using system tables, EXPLAIN plans, resource groups,
and tier management.

## Kinetica REST API Access (curl)

When you need to call Kinetica's REST API directly via `curl`, follow these rules exactly.

### Authentication

Read credentials from the `.env` file or environment variables set during Connection Setup. Prefer the `Authorization` header over `-u`.

**OAuth Bearer token (preferred when available):**
```bash
curl -X POST -k \
  -H "Authorization: Bearer $KINETICA_DB_SKILL_OAUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'
```

**Basic Auth via Authorization header (preferred for username/password):**
```bash
# Base64-encode credentials (use printf to avoid trailing newline)
AUTH=$(printf '%s:%s' "$KINETICA_DB_SKILL_USER" "$KINETICA_DB_SKILL_PASS" | base64)

curl -X POST -k \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'
```

**Basic Auth via `-u` (fallback alternative):**
```bash
# Single quotes around -u value prevent shell expansion of ! $ & etc.
curl -X POST -k \
  -u 'admin:MyP@ss!' \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'

# WRONG — double quotes corrupt passwords with ! or $ characters
curl -u "admin:MyP@ss!" ...   # shell interprets ! as history expansion
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
| `data_str` | array of strings | **The actual result** — each element is a JSON-encoded string |

> **Key point:** `data_str` contains JSON *strings*, not JSON objects. You must parse them a second time to get usable data.

**Example raw response (abbreviated):**
```json
{
  "status": "OK",
  "message": "",
  "data_type": "execute_sql_response",
  "data": {},
  "data_str": [
    "{\"column_1\":[1,2,3],\"column_headers\":[\"id\",\"name\",\"value\"],\"total_number_of_records\":3}"
  ]
}
```

#### Extracting data with `jq`

**Basic — parse `data_str` payload:**
```bash
curl ... | jq '.data_str[0] | fromjson'
```

**SQL results — column headers and row count:**
```bash
curl ... | jq '.data_str[0] | fromjson | {headers: .column_headers, rows: .total_number_of_records}'
```

**Show table — extract table names:**
```bash
curl ... | jq '.data_str[0] | fromjson | .table_names'
```

**Error checking — guard before parsing:**
```bash
curl ... | jq 'if .status == "ERROR" then {error: .message} else (.data_str[0] | fromjson) end'
```

### Gotchas

- **Always POST** — GET requests will fail or return unexpected results
- **Prefer `Authorization` header over `-u`** — if using `-u` as fallback, quote passwords with single quotes (double quotes allow shell expansion of `!`, `$`, backticks)
- **Include `options: {}`** — most endpoints require the options field even if empty
- **Use the full URL** — include `/_gpudb/` prefix if connecting through a reverse proxy (e.g., `https://host/_gpudb/show/table`)
- **`data_str` is double-encoded** — the array elements are JSON *strings*, not objects; pipe through `fromjson` in `jq` (or `JSON.parse()` / `json.loads()`) to get the actual payload

**Critical**: Kinetica SQL has important deviations from standard PostgreSQL.
Read [references/kinetica-core-rules.md](references/kinetica-core-rules.md) before writing any query.

## SQL Knowledge

This skill includes core Kinetica SQL knowledge for administrative queries.

- See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) — **read this first**
- See [references/sql-functions.md](references/sql-functions.md) for supported functions
- See [references/ddl-reference.md](references/ddl-reference.md) for DDL (credentials, data sources, sinks, backup/restore, streams)
- See [references/dml-reference.md](references/dml-reference.md) for DML (LOAD DATA, EXPORT, upsert)
- See [references/security-reference.md](references/security-reference.md) for users, roles, grants, row/column security, resource groups
- See [references/udf-reference.md](references/udf-reference.md) for UDFs, procedures, ML models

## System Tables (ki_catalog)

Kinetica exposes system state through the `ki_catalog` schema (security-filtered per user).
See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) for the full table list.

Key tables: `ki_objects` (tables/views), `ki_columns`, `ki_indexes`, `ki_partitions`,
`ki_obj_stat` (row/byte counts), `ki_tiered_objects`, `ki_query_active_all` (running queries),
`ki_query_history`, `ki_users_and_roles`, `ki_role_members`, `ki_object_permissions`,
`ki_datasources`, `ki_datasinks`, `ki_load_history`, `ki_backup_history`.

```sql
-- Active queries
SELECT * FROM "ki_catalog"."ki_query_active_all"
ORDER BY "start_time" DESC
LIMIT 20

-- Slow queries (last 24h)
SELECT * FROM "ki_catalog"."ki_query_history"
WHERE DATEDIFF('MILLISECOND', "start_time", "end_time") > 5000
  AND "start_time" >= DATEADD('HOUR', -24, NOW())
ORDER BY "start_time" DESC
LIMIT 50
```

## EXPLAIN Plans

Use `EXPLAIN` to understand query execution:

```sql
-- Basic explain
EXPLAIN SELECT * FROM my_table WHERE region = 'US';

-- Verbose explain with costs
EXPLAIN VERBOSE SELECT t1.id, t2.name
FROM table1 t1
INNER JOIN table2 t2 ON t1.id = t2.id
WHERE t1.status = 'active';
```

Key things to look for:
- **Full table scans** on large tables — add filters or use sharding
- **Sort operations** — check if an index or pre-sorted data can help
- **Join strategies** — hash joins vs. nested loop joins
- **GPU vs CPU execution** — GPU-accelerated operations are marked

## Security, Resource Groups & Tier Management

Full syntax for users, roles, GRANT/REVOKE (including row-level and column-level security),
resource groups, and tier management is in [references/security-reference.md](references/security-reference.md).

DDL for credentials, data sources, data sinks, backup/restore, and streams is in
[references/ddl-reference.md](references/ddl-reference.md).

## Common Diagnostic Patterns

### Identify Bottlenecks

```sql
-- Top tables by size
SELECT schema_name, table_name, row_count,
       ROUND(compressed_bytes / 1073741824.0, 2) AS size_gb
FROM ki_catalog.ki_tables
ORDER BY compressed_bytes DESC
LIMIT 20;

-- Queries consuming the most time (last 24 hours)
SELECT username, COUNT(*) AS query_count,
       AVG(DATEDIFF(MILLISECOND, start_time, end_time)) AS avg_ms,
       MAX(DATEDIFF(MILLISECOND, start_time, end_time)) AS max_ms
FROM ki_catalog.ki_query_history
WHERE start_time > DATEADD(HOUR, -24, NOW())
GROUP BY username
ORDER BY avg_ms DESC;
```

### Kill a Long-Running Query

```sql
-- Find the query
SELECT query_id, username, sql_text,
       DATEDIFF(SECOND, start_time, NOW()) AS running_seconds
FROM ki_catalog.ki_active_queries
ORDER BY running_seconds DESC;

-- Kill it
KILL QUERY 'query_id_here';
```

## Administration Guidelines

1. Check cluster health before making changes — verify all nodes are online
2. Use EXPLAIN before running expensive queries on production
3. Monitor query history for slow query patterns, not just individual queries
4. Use resource groups to prevent runaway queries from starving other users
5. Remember Kinetica SQL rules — especially DATEDIFF/DATEADD for all date math
6. Always qualify table names with schema: `"schema"."table"`
