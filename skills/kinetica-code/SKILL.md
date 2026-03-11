---
name: kinetica-code
description: "Kinetica application development knowledge. Activate when the user is building Python applications that interact with Kinetica, using the Kinetica Python SDK, REST API, or building data pipelines."
---

# Kinetica Application Development

Kinetica is a GPU-accelerated database. This skill teaches you to build applications
that connect to Kinetica using the Python SDK, REST API, and common data pipeline patterns.

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
- **Never use `-u`** — it requires inlining credentials in the command string, which corrupts `!` and other characters at the Bash tool transport layer
- **Include `options: {}`** — most endpoints require the options field even if empty
- **Use the full URL** — include `/_gpudb/` prefix if connecting through a reverse proxy (e.g., `https://host/_gpudb/show/table`)
- **`data_str` is double-encoded** — the array elements are JSON *strings*, not objects; pipe through `fromjson` in `jq` (or `JSON.parse()` / `json.loads()`) to get the actual payload

**Critical**: Kinetica SQL has important deviations from standard PostgreSQL.
Read [references/kinetica-core-rules.md](references/kinetica-core-rules.md) before writing any query.

## SQL Knowledge

This skill includes core Kinetica SQL knowledge so you can embed queries in application code.

- See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) — **read this first**
- See [references/sql-functions.md](references/sql-functions.md) for supported functions
- See [references/sql-patterns.md](references/sql-patterns.md) for common query patterns
- See [references/ddl-reference.md](references/ddl-reference.md) for DDL (table creation, data sources, external tables)
- See [references/dml-reference.md](references/dml-reference.md) for DML (LOAD DATA, EXPORT, upsert)
- See [references/udf-reference.md](references/udf-reference.md) for UDFs, procedures, Python environments, ML models

## Python SDK

### Installation

```bash
pip install gpudb
```

### Connection

```python
import gpudb

# Basic connection
db = gpudb.GPUdb(
    host="https://your-instance.kinetica.com/",
    username="your_user",
    password="your_password"
)

# With options
options = gpudb.GPUdb.Options()
options.username = "your_user"
options.password = "your_password"
options.skip_ssl_cert_verification = False
db = gpudb.GPUdb(
    host="https://your-instance.kinetica.com/",
    options=options
)
```

### Executing SQL

```python
# Simple query
response = db.execute_sql("SELECT * FROM my_table LIMIT 10")
records = response.records  # List of ordered dicts

# Parameterized query
response = db.execute_sql(
    "SELECT * FROM my_table WHERE id = ?",
    data=[42]
)

# DDL
db.execute_sql("""
    CREATE TABLE my_schema.events (
        id         INT NOT NULL,
        event_time TIMESTAMP,
        payload    VARCHAR(1024)
    )
""")
```

### Bulk Ingest

```python
# Create table type and table, then insert records
table_name = "my_schema.sensor_data"

# Insert with SQL
db.execute_sql(f"""
    INSERT INTO {table_name} (sensor_id, reading, ts)
    VALUES (?, ?, ?)
""", data=[101, 23.5, "2024-01-15 10:30:00"])

# Bulk insert from records
records = [
    [101, 23.5, "2024-01-15 10:30:00"],
    [102, 18.2, "2024-01-15 10:30:01"],
    [103, 45.1, "2024-01-15 10:30:02"]
]
db.insert_records_from_payload(
    table_name=table_name,
    field_names=["sensor_id", "reading", "ts"],
    payload=records
)
```

### REST API

For environments where the Python SDK isn't available, use the REST API directly:

```python
import requests

base_url = "https://your-instance.kinetica.com"
auth = ("your_user", "your_password")

# Execute SQL via REST
response = requests.post(
    f"{base_url}/execute/sql",
    json={
        "statement": "SELECT * FROM my_table LIMIT 10",
        "encoding": "json"
    },
    auth=auth
)
result = response.json()
```

## Application Patterns

### Query Builder Pattern

```python
def build_query(table, filters=None, columns="*", limit=100):
    """Build a parameterized Kinetica query."""
    query = f"SELECT {columns} FROM {table}"
    params = []

    if filters:
        conditions = []
        for col, val in filters.items():
            conditions.append(f"{col} = ?")
            params.append(val)
        query += " WHERE " + " AND ".join(conditions)

    query += f" LIMIT {limit}"
    return query, params
```

### Connection Pool Pattern

```python
from contextlib import contextmanager

class KineticaPool:
    """Simple connection wrapper with retry."""

    def __init__(self, host, username, password):
        self.host = host
        self.username = username
        self.password = password
        self._conn = None

    @property
    def conn(self):
        if self._conn is None:
            self._conn = gpudb.GPUdb(
                host=self.host,
                username=self.username,
                password=self.password
            )
        return self._conn

    def query(self, sql, params=None):
        """Execute query with automatic reconnect on failure."""
        try:
            return self.conn.execute_sql(sql, data=params)
        except gpudb.GPUdbException:
            self._conn = None  # Force reconnect
            return self.conn.execute_sql(sql, data=params)
```

### DataFrame Integration

```python
import pandas as pd

def query_to_dataframe(db, sql, params=None):
    """Execute a Kinetica query and return a pandas DataFrame."""
    response = db.execute_sql(sql, data=params)
    if response.total_number_of_records == 0:
        return pd.DataFrame()
    return pd.DataFrame(response.records)

# Usage
df = query_to_dataframe(db, """
    SELECT region, SUM(revenue) as total_revenue
    FROM sales
    GROUP BY region
    ORDER BY total_revenue DESC
""")
```

## Development Guidelines

1. Always use parameterized queries — never string-interpolate user input into SQL
2. Use `LIMIT` on exploration queries to avoid pulling entire tables
3. Handle `gpudb.GPUdbException` for connection and query errors
4. Close connections when done in long-running applications
5. For bulk ingest, prefer `insert_records_from_payload` over row-by-row INSERT
6. Remember Kinetica SQL rules from the core rules reference — especially DATEDIFF/DATEADD instead of timestamp arithmetic
