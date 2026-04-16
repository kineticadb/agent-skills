# Kinetica REST API Access (curl)

When you need to call Kinetica's REST API directly via `curl`, follow these rules exactly.

## Authentication

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
# Load .env (see "Loading .env safely" above — must be in same Bash call)

curl -X POST -k \
  -H "Authorization: Bearer $KINETICA_DB_SKILL_OAUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'
```

**Basic Auth via Authorization header (preferred for username/password):**
```bash
# Load .env (see "Loading .env safely" above — must be in same Bash call)

AUTH=$(printf '%s:%s' "$KINETICA_DB_SKILL_USER" "$KINETICA_DB_SKILL_PASS" | base64)

curl -X POST -k \
  -H "Authorization: Basic $AUTH" \
  -H "Content-Type: application/json" \
  "$KINETICA_DB_SKILL_URL/show/table" \
  -d '{"table_name": "*", "options": {}}'
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
| `/execute/sql` | `{"statement": "SELECT 1", "offset": 0, "limit": 100, "encoding": "json", "options": {}}` — `encoding: "json"` is **required** for the `json_encoded_response` field to appear; without it, column data returns in binary |
| `/show/table` | `{"table_name": "*", "options": {"get_sizes": "true"}}` |
| `/show/graph` | `{"graph_name": "*", "options": {}}` |
| `/insert/records/json?table_name=T` | `[{"col1": "val1"}]` (array of records as body) |

> **Table name rule:** Always use exact, fully-qualified table names (e.g., `"schema.my_table"`) or `"*"` to list all. **Never** use partial wildcard patterns like `"schema.*table*"` or `"*partial*"`.

## Example: Execute SQL

```bash
# Load .env (see "Loading .env safely" above — must be in same Bash call)

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

**Parsed response structure (/show/table):**
```
Response (top level)
├─ status: "OK"
└─ data_str: (JSON string → parse to get metadata)
    ├─ table_names: ["schema.table1", "schema.table2"]
    ├─ sizes: [1024, 2048]                              ← already objects
    ├─ properties: [{...}, {...}]                        ← already objects
    ├─ additional_info: [{...}, {...}]                   ← already objects
    └─ type_schemas: ["{"type":"record",...}", ...]      ← double-encoded strings → need fromjson
```

**Parsed response structure (/show/graph):**
```
Response (top level)
├─ status: "OK"
└─ data_str: (JSON string → parse to get metadata)
    ├─ graph_names: ["my_graph"]
    ├─ directed: [true]
    ├─ num_nodes: [1500]
    ├─ num_edges: [3200]
    └─ (additional fields: original_request, etc.)
```

**Response structure (/insert/records/json):**
```
Response (top level)
├─ status: "OK"
├─ count_inserted: 5
├─ count_updated: 0
└─ count_skipped: 0
```
> Note: `/insert/records/json` returns counts at the top level — no `data_str` parsing needed.

> **`fromjson` selectivity:** After parsing `data_str`, only `type_schemas` elements (Avro schema strings) need another `fromjson`. Other fields — `table_names`, `properties`, `sizes`, `additional_info` — are already native JSON objects/arrays.

### Extracting data with Python (when `jq` is unavailable)

**SQL results — rows as named objects:**
```bash
curl ... | python3 -c "
import sys, json
r = json.load(sys.stdin)
if r.get('status') == 'ERROR': print(json.dumps({'error': r['message']})); sys.exit(1)
meta = json.loads(r['data_str'])
d = json.loads(meta['json_encoded_response'])
headers = d['column_headers']
n = len(d.get('column_1', []))
rows = [{h: d[f'column_{j+1}'][i] for j, h in enumerate(headers)} for i in range(n)]
print(json.dumps({'total': meta['total_number_of_records'], 'records': rows}, indent=2))
"
```

**Show table — schema inspection:**
```bash
curl ... | python3 -c "
import sys, json
r = json.load(sys.stdin)
meta = json.loads(r['data_str'])
schema = json.loads(meta['type_schemas'][0])
print(json.dumps({'table': meta['table_names'][0], 'columns': [{'name': f['name'], 'type': f['type']} for f in schema['fields']]}, indent=2))
"
```

### Extracting data with `jq`

**Basic — parse `data_str` metadata:**
```bash
curl ... | jq '.data_str | fromjson'
```

**SQL results — column headers and row count:**
```bash
curl ... | jq '(.data_str | fromjson) as $meta | ($meta.json_encoded_response | fromjson) as $d | {headers: $d.column_headers, rows: $meta.total_number_of_records}'
```

**SQL results — row data as arrays** (transpose columnar → rows):
```bash
curl ... | jq '
  (.data_str | fromjson) as $meta
  | ($meta.json_encoded_response | fromjson) as $d
  | { headers: $d.column_headers,
      total:   $meta.total_number_of_records,
      rows:    [range($d.column_1 | length) as $i
               | [range($d.column_headers | length) as $j
                 | $d["column_\($j+1)"][$i]]] }'
```

**SQL results — rows as named objects** (transpose columnar → row objects):
```bash
curl ... | jq '
  (.data_str | fromjson) as $meta
  | ($meta.json_encoded_response | fromjson) as $d
  | [range($d.column_1 | length) as $i
    | [range($d.column_headers | length) as $j
      | {key: $d.column_headers[$j], value: $d["column_\($j+1)"][$i]}]
    | from_entries]'
```

**Show table — extract table names:**
```bash
curl ... | jq '.data_str | fromjson | .table_names'
```

**Show table — schema inspection (columns + properties):**
```bash
curl ... | jq '
  (.data_str | fromjson) as $d
  | {
      table_name: $d.table_names[0],
      columns:    ($d.type_schemas[0] | fromjson | .fields
                   | map({name: .name, type: .type})),
      properties: $d.properties[0]
    }'
```

> `type_schemas[0]` gets `fromjson` (double-encoded Avro string); `properties[0]` does NOT (already an object).

**Error checking — guard before parsing:**
```bash
curl ... | jq 'if .status == "ERROR" then {error: .message} else (.data_str | fromjson) end'
```

## Gotchas

- **Always POST** — GET requests will fail or return unexpected results
- **Never use `-u`** — it requires inlining credentials in the command string, which corrupts `!` and other characters at the Bash tool transport layer
- **Include `options: {}`** — most endpoints require the options field even if empty
- **Use the full URL** — include `/_gpudb/` prefix if connecting through a reverse proxy (e.g., `https://host/_gpudb/show/table`)
- **curl returns exit 0 on HTTP errors** — by default, `curl` exits 0 even on 4xx/5xx responses. Always check the `status` field in the JSON response. Alternatively, add `--fail-with-body` (curl 7.76+) to get a non-zero exit code while still seeing the error body
- **`data_str` is multi-layered** — the value is a JSON *string* containing metadata; for SQL results, column data is nested inside `json_encoded_response` (another JSON string requiring a second parse)
- **Not everything inside `data_str` needs `fromjson`** — after parsing `data_str`, only `json_encoded_response` (SQL column data) and `type_schemas` elements (Avro schema strings) are double-encoded strings needing another `fromjson`. Other fields like `properties`, `additional_info`, `sizes`, and `table_names` are already native JSON — applying `fromjson` to them will error
