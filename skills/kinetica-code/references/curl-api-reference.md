# Kinetica REST API Access (curl)

When you need to call Kinetica's REST API directly via `curl`, follow these rules exactly.

## Authentication

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

## Required curl flags

| Flag | Why |
|------|-----|
| `-X POST` | All Kinetica API endpoints require POST |
| `-k` (or `--insecure`) | Accept self-signed TLS certs (common in Kinetica deployments) |
| `-H "Content-Type: application/json"` | Required for all endpoints |

## Common endpoints

| Endpoint | Example body |
|----------|-------------|
| `/execute/sql` | `{"statement": "SELECT 1", "offset": 0, "limit": 100, "encoding": "json", "options": {}}` |
| `/show/table` | `{"table_name": "*", "options": {"get_sizes": "true"}}` |
| `/show/graph` | `{"graph_name": "*", "options": {}}` |
| `/insert/records/json?table_name=T` | `[{"col1": "val1"}]` (array of records as body) |

## Example: Execute SQL

```bash
AUTH=$(printf '%s:%s' "$KINETICA_DB_SKILL_USER" "$KINETICA_DB_SKILL_PASS" | base64)

curl -X POST -k \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/execute/sql" \
  -d '{"statement": "SELECT * FROM my_table LIMIT 5", "offset": 0, "limit": 100, "encoding": "json", "options": {}}'
```

## Parsing Responses

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

### Extracting data with `jq`

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

## Gotchas

- **Always POST** — GET requests will fail or return unexpected results
- **Prefer `Authorization` header over `-u`** — if using `-u` as fallback, quote passwords with single quotes (double quotes allow shell expansion of `!`, `$`, backticks)
- **Include `options: {}`** — most endpoints require the options field even if empty
- **Use the full URL** — include `/_gpudb/` prefix if connecting through a reverse proxy (e.g., `https://host/_gpudb/show/table`)
- **`data_str` is double-encoded** — the array elements are JSON *strings*, not objects; pipe through `fromjson` in `jq` (or `JSON.parse()` / `json.loads()`) to get the actual payload
