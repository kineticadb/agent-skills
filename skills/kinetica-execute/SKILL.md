---
name: kinetica-execute
description: Use when interacting with a Kinetica GPU database — running SQL queries, exploring table schemas, graph analytics (shortest path, PageRank, TSP), geospatial filtering, server-side visualization, data import/export, or table monitoring via the Node.js or Python API
argument-hint: <sql-or-action>
user-invocable: true
---

# Kinetica DB Skill

Full database operations skill for **Kinetica GPU database** with dual-runtime support (Node.js and Python). Execute queries, explore schemas, insert/update/delete data, run graph analytics, apply geospatial filters, generate visualizations, manage imports/exports, monitor tables, or generate reusable code in either language.

## Kinetica REST API Access (curl)

> **Note:** curl is a session-only fallback — never a cacheable runtime. Use it only when the user explicitly requests raw REST calls, or when neither Node.js nor Python SDK is available. Never save `runtime: curl` in the Setup Cache.

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

> **Table name rule:** Always use exact, fully-qualified table names (e.g., `"schema.my_table"`) or `"*"` to list all. **Never** use partial wildcard patterns like `"schema.*table*"` or `"*partial*"`.

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

> **`fromjson` selectivity:** After parsing `data_str`, only `type_schemas` elements (Avro schema strings) need another `fromjson`. Other fields — `table_names`, `properties`, `sizes`, `additional_info` — are already native JSON objects/arrays.

#### Extracting data with `jq`

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

### Gotchas

- **Always POST** — GET requests will fail or return unexpected results
- **Never use `-u`** — it requires inlining credentials in the command string, which corrupts `!` and other characters at the Bash tool transport layer
- **Include `options: {}`** — most endpoints require the options field even if empty
- **Use the full URL** — include `/_gpudb/` prefix if connecting through a reverse proxy (e.g., `https://host/_gpudb/show/table`)
- **`data_str` is multi-layered** — the value is a JSON *string* containing metadata; for SQL results, column data is nested inside `json_encoded_response` (another JSON string requiring a second parse)
- **Not everything inside `data_str` needs `fromjson`** — after parsing `data_str`, only `json_encoded_response` (SQL column data) and `type_schemas` elements (Avro schema strings) are double-encoded strings needing another `fromjson`. Other fields like `properties`, `additional_info`, `sizes`, and `table_names` are already native JSON — applying `fromjson` to them will error

## Setup Cache (Fast Path)

**Run this check before anything else.** It avoids redundant interpreter-based dependency detection across sessions by caching setup state in auto-memory.

1. **Read cache** — Check if the auto-memory `MEMORY.md` (already loaded into context) contains a `## Kinetica Setup Cache` section. If not found → skip to **Skill Path Resolution** below
2. **Validate** — Run a single Bash command to verify the cached state still holds (use the `Skill path` value from the cache as `<skill_path>`):
   - If `credentials: dotenv` → include `test -f .env && grep -q KINETICA_DB_SKILL_URL .env`
   - If `credentials: env-vars` or `credentials: inline` → no credentials file check needed
   - If `runtime: nodejs` → include `test -f <skill_path>/scripts/kinetica-cli.js && test -f <skill_path>/node_modules/@kinetica/gpudb/package.json`
   - If `runtime: python` → include `test -f <skill_path>/scripts/kinetica-cli.py`; if `venv: yes` → also include `test -f .venv/bin/activate`
   - If `runtime: python` and `venv: no` → cannot validate SDK via file check; skip to **Skill Path Resolution** (full detection required)
   - Chain all applicable checks with `&&` in one command
3. **Cache hit** (all checks pass) → Skip **Skill Path Resolution**, **Connection Setup**, **Dependency Setup**, and **Runtime Detection** entirely. Use the cached `Skill path` and `runtime` values for all CLI commands this session
4. **Cache miss** (any check fails) → Delete the stale `## Kinetica Setup Cache` section from auto-memory `MEMORY.md`, then proceed to **Skill Path Resolution** below

## Skill Path Resolution

**Run this once per session before the first CLI invocation (skip if Setup Cache validated — use the cached `Skill path`).**

The skill may be installed locally (project-level) or globally (user-level). Resolve the correct path before invoking any CLI scripts:

```bash
# Check local first, then global
if test -f .claude/skills/kinetica-execute/scripts/kinetica-cli.js || \
   test -f .claude/skills/kinetica-execute/scripts/kinetica-cli.py; then
  echo "skill_path=.claude/skills/kinetica-execute"
elif test -f ~/.claude/skills/kinetica-execute/scripts/kinetica-cli.js || \
     test -f ~/.claude/skills/kinetica-execute/scripts/kinetica-cli.py; then
  echo "skill_path=$HOME/.claude/skills/kinetica-execute"
else
  echo "not_found"
fi
```

- **Local found** → use `.claude/skills/kinetica-execute` as `<skill_path>`
- **Global found** → use the expanded absolute path (e.g., `/Users/you/.claude/skills/kinetica-execute`) as `<skill_path>`
- **Neither found** → stop and tell the user: *"The kinetica-execute skill scripts were not found in `.claude/` or `~/.claude/`. Please verify the skill is installed."*

**Session caching:** Once resolved, use `<skill_path>` for all subsequent CLI invocations in this session. Do not re-check.

## Connection Setup

**Run this flow before the first CLI command in a session, unless the Setup Cache validated successfully.** If credentials are already configured, this completes instantly at step 2.

1. **Locate** — Use the current working directory as the project root
2. **Check** — Read shell environment variables first (they take precedence). Then, if a `.env` file exists in the project root, **read it using the Read tool** (this is required so the Write tool can overwrite it later if needed). If `KINETICA_DB_SKILL_URL` is set and non-empty from either source → skip to step 6
3. **Prompt** — Use `AskUserQuestion` to collect connection details in a single prompt:
   - **Server URL** (required) — e.g., `http://localhost:9191`
   - **Auth method** — Username/Password or OAuth Token
   - **Credentials** — username + password, or OAuth token, depending on the choice above
4. **Warn** — Before writing anything, inform the user: *"I'll save these credentials to a local `.env` file (which is gitignored). OK to proceed?"* Use `AskUserQuestion` with Yes/No options. If the user declines, **do not write `.env`** — instead, prefix env vars inline on each CLI call for the remainder of the session (e.g., `KINETICA_DB_SKILL_URL=... python3 ... health`)
5. **Write** — Create `<project_root>/.env` using the format from `<skill_path>/.env.template`, filling in the user-provided values. **Do NOT echo passwords or tokens in your response.** If the write fails (e.g., permission denied), show the user the exact file content they need to create manually (masking secrets with `***`)
6. **Proceed** — Continue with the user's original request

## Dependency Setup

**Run this flow after Connection Setup completes, unless the Setup Cache validated successfully.** If dependencies are already installed, this completes instantly at step 1.

> **Python version note:** The `gpudb` PyPI package ships pre-built wheels for Python 3.8–3.13 only. If you are running Python 3.14+, use the Node.js runtime instead.

1. **Detect** — Check which runtime is available:
   ```bash
   # Check Node.js SDK
   node -e "process.chdir('<skill_path>'); require('@kinetica/gpudb')" 2>/dev/null && echo "nodejs:ok"

   # Check Python SDK (activate venv first if it exists)
   test -f .venv/bin/activate && source .venv/bin/activate
   python3 -c "import gpudb" 2>/dev/null && echo "python:ok"
   ```
2. **Install if missing** — If neither runtime has the SDK installed:
   - **Node.js** (recommended — no platform restrictions): `cd <skill_path> && npm install`
   - **Python** (requires Python 3.8–3.13): First verify the Python version is compatible, then install:
     ```bash
     python3 -c "import sys; v=sys.version_info; exit(0 if (3,8)<=v[:2]<=(3,13) else 1)" && echo "python:compatible" || echo "python:incompatible — use Node.js runtime"
     ```
     If compatible: `pip install -r <skill_path>/requirements.txt` (create a venv first if one doesn't exist: `python3 -m venv .venv && source .venv/bin/activate`)
   - **Both failed**: If Node.js is not installed and Python is 3.14+, inform the user: *"The Python gpudb package requires Python 3.8–3.13. Please install Node.js v16+ to use this skill, or switch to a compatible Python version."*
   - **curl fallback**: If the user explicitly requests curl, or both SDK runtimes fail and the user cannot install them now, use the **Kinetica REST API Access (curl)** section above for the current session only. **Do not write the Setup Cache** in this case — the next session should re-attempt SDK installation
3. **Proceed** — Continue with the user's original request

### Write Setup Cache

After both **Connection Setup** and **Dependency Setup** complete successfully, write (or replace) the `## Kinetica Setup Cache` section in the auto-memory `MEMORY.md` file:

```markdown
## Kinetica Setup Cache
- Runtime: <nodejs|python>
- Skill path: <resolved path from Skill Path Resolution — local or global>
- Credentials: <dotenv|env-vars|inline>
- Venv: <yes|no>
- Cached: <YYYY-MM-DD>
```

Rules:
- If `## Kinetica Setup Cache` already exists in `MEMORY.md`, **replace it** (do not duplicate)
- Only write after setup succeeds — never mid-flow
- `credentials` value: `dotenv` if `.env` was used, `env-vars` if shell env vars were used, `inline` if env vars are prefixed on each CLI call
- `venv`: `yes` if `.venv/bin/activate` exists, `no` otherwise
- **Never cache `curl` as a runtime.** The `Runtime` field only accepts `nodejs` or `python`. If neither SDK is available and the session falls back to raw curl, **do not write the cache** — leave it empty so the next session re-runs full Dependency Setup

## Prerequisites

### Environment Variables

> **Note:** Claude handles credential setup interactively via the Connection Setup flow above. The table below is for reference only.

The CLI scripts **auto-load a `.env` file** from the project root.

| Variable | Required | Description |
|----------|----------|-------------|
| `KINETICA_DB_SKILL_URL` | Yes | Server URL (e.g., `http://localhost:9191`) |
| `KINETICA_DB_SKILL_USER` | Yes* | Username for auth |
| `KINETICA_DB_SKILL_PASS` | No | Password for auth |
| `KINETICA_DB_SKILL_OAUTH_TOKEN` | Yes* | Alternative: OAuth token |
| `KINETICA_DB_SKILL_TIMEOUT` | No | Request timeout in ms (default: 30000) |

*Use either username/password OR OAuth token.

Shell environment variables take precedence over `.env` values.

### Install Dependencies

```bash
# Node.js (recommended — works with any Node.js v16+)
cd <skill_path> && npm install

# Python (requires Python 3.8–3.13; use venv — required on macOS/Homebrew)
python3 -m venv .venv && source .venv/bin/activate && pip install -r <skill_path>/requirements.txt
```

## Runtime Detection

**If the Setup Cache validated successfully, skip this section and use the cached runtime.**

Before running CLI commands, detect which runtime is available:

```bash
# Check Node.js (resolve from skill directory where node_modules/ lives)
node -e "process.chdir('<skill_path>'); require('@kinetica/gpudb')" 2>/dev/null && echo "nodejs:ok"

# Check Python (activate venv first if it exists)
test -f .venv/bin/activate && source .venv/bin/activate
python3 -c "import gpudb" 2>/dev/null && echo "python:ok"
```

**Important:** If a `.venv/` directory exists in the project root, always activate it before running the Python CLI:
```bash
source .venv/bin/activate
```

**Priority:** Use whichever is installed. If both are available, prefer Python for quick queries (simpler invocation) and Node.js for async workflows.

## CLI Usage

Both CLIs share the **same interface** and **same JSON output format**.

### Invocation

> `<skill_path>` is the path resolved during **Skill Path Resolution** (or from the Setup Cache). Use it for all CLI invocations.

```bash
# Node.js
node <skill_path>/scripts/kinetica-cli.js <command> [args]

# Python
python3 <skill_path>/scripts/kinetica-cli.py <command> [args]
```

### Commands

| Command | Args | Description |
|---------|------|-------------|
| `health` | | Verify connection to Kinetica |
| `query` | `<sql>` | Execute any SQL statement |
| `show-tables` | `[schema]` | List tables (optionally filter by schema) |
| `describe-table` | `<table_name>` | Show columns, types, properties, row count |
| `get-records` | `<table> [options]` | Retrieve records with filtering/sorting |
| `insert-json` | `<table> <json_or_@file>` | Insert JSON records |
| `delete-records` | `<table> <expression>` | Delete matching records |
| `clear-table` | `<table>` | Drop a table |
| `show-types` | `[type_id] [label]` | List registered types |
| `aggregate` | `<table> <columns>` | Group-by aggregation |

### Graph Commands

| Command | Args | Description |
|---------|------|-------------|
| `graph create` | `<name> --edges <edge_spec>` | Create a graph from table data |
| `graph solve` | `<name> --solver-type <type>` | Run solver (SHORTEST_PATH, PAGE_RANK, TSP, etc.) |
| `graph query` | `<name> --queries <node_ids>` | Topological adjacency — find neighbors N hops from given node IDs (NOT for Cypher/PGQL pattern matching) |
| `graph match` | `<name> --sample-points <table>` | Map-match GPS points to graph edges |
| `graph delete` | `<name>` | Delete a graph |
| `graph show` | `[name]` | List graphs or show graph details |

**graph solve --solver-type values:** `SHORTEST_PATH`, `PAGE_RANK`, `PROBABILITY_RANK`, `CENTRALITY`, `MULTIPLE_ROUTING`, `ALLPATHS`, `TSP`, `INVERSE_SHORTEST_PATH`, `BACKHAUL_ROUTING`, `CLOSENESS`

### When to Use CLI vs SQL for Graphs

Graph operations have **two execution paths** — the `graph` CLI commands call REST API endpoints directly, while SQL-based operations run through the `query` command. Choose based on complexity:

| Task | Simple (CLI) | Complex (SQL via `query`) |
|------|-------------|--------------------------|
| **Create graph** | `graph create` — basic edges/nodes with flags | `query "CREATE GRAPH ..."` — LABEL_KEY grouping, multi-label `VARCHAR[]`, custom OPTIONS via `KV_PAIRS()` |
| **Query topology** | `graph query` — find adjacent nodes N hops away by node ID | `query "GRAPH name MATCH (a)-[e]->(b) RETURN ..."` — Cypher pattern matching with labels, attribute filters, variable-length paths |
| **Run solvers** | `graph solve` — single solver with source/dest nodes | `query "SELECT * FROM TABLE(SOLVE_GRAPH(...))"` — custom options like `uniform_weights`, combined with SQL joins |
| **Supply-demand** | `graph match` — basic sample points with solve method | `query "EXECUTE FUNCTION MATCH_GRAPH(...)"` — full MSDO with specs, multi-modal transport, geospatial coordinates |
| **Modify graph** | *(not available)* | `query "ALTER GRAPH ... MODIFY (...)"` — add/remove edges, restrictions, change options |
| **Inspect/delete** | `graph show` / `graph delete` | *(use CLI — simpler)* |

**Key distinction — `graph query` vs Cypher:**
- **`graph query <name> --queries <node_ids>`** calls the `/query/graph` REST endpoint — it finds nodes adjacent to the given node identifiers within `--rings` hops. The `--queries` flag takes **node identifiers** (not Cypher syntax).
- **`query "GRAPH name MATCH ..."`** executes a PGQL/Cypher pattern-matching query as SQL — it supports labels, attribute filters, multi-hop traversal, `GRAPH_TABLE()` aggregation, and query hints. This is the primary way to query graph relationships.

**Rule of thumb:** Use CLI commands for simple, one-shot operations. Use SQL for anything involving labels, attribute filtering, pattern matching, multi-step analytics, or features not exposed by CLI flags.

### Geospatial Commands

| Command | Args | Description |
|---------|------|-------------|
| `geo filter-by-radius` | `<table> --x-col --y-col --center-x --center-y --radius` | Circular radius filter (meters) |
| `geo filter-by-box` | `<table> --x-col --y-col --min-x --max-x --min-y --max-y` | Bounding box filter |
| `geo filter-by-area` | `<table> --x-col --y-col --wkt <geometry>` | Filter by WKT polygon area |
| `geo filter-by-geometry` | `<table> --geom-col --geometry <wkt> --operation <op>` | Geometry-to-geometry filter (contains, intersects, etc.) |
| `geo filter-by-range` | `<table> --column <col> --lower <val> --upper <val>` | Numeric range filter |
| `geo filter-by-string` | `<table> --column <col> --value <str> --mode <mode>` | String filter (equals, contains, starts, regex) |

### I/O Commands

| Command | Args | Description |
|---------|------|-------------|
| `io import-files` | `<table> --file-path <path>` | Import CSV/JSON/Parquet files into a table |
| `io export-files` | `<table> --file-path <path> --file-type <type>` | Export table to files |
| `io export-table` | `<table> --dest-table <name>` | Export/copy table to another table |
| `io kifs-upload` | `<local-path> <kifs-path>` | Upload file to KiFS |
| `io kifs-download` | `<kifs-path> <local-path>` | Download file from KiFS |
| `io kifs-list` | `[kifs-path]` | List KiFS directory contents |
| `io kifs-mkdir` | `<kifs-path>` | Create KiFS directory |
| `io kifs-delete` | `<kifs-path>` | Delete file or directory from KiFS |

### Visualization Commands

| Command | Args | Description |
|---------|------|-------------|
| `viz chart` | `<table> --x-column --y-column --output <file>` | Generate a chart image |
| `viz heatmap` | `<table> --x-col --y-col [--value-col] [--srs EPSG:4326] [--blur-radius N] [--colormap NAME] [--min-x/max-x/min-y/max-y] [--width] [--height] --output <file>` | Generate a heatmap via WMS |
| `viz isochrone` | `<graph> --source <node> --max-radius <val> --output <file>` | Generate isochrone contours |
| `viz classbreak` | `--config <json_or_@file> --output <file>` | Generate class-break map via WMS |
| `viz wms` | `--config <json_or_@file> --output <file>` | Send a custom WMS request |

> **Output:** All viz commands require `--output <file>` to write the image to disk. After the command succeeds, you **MUST** include a clickable file link so the user can view or download the PNG. Use the absolute path and present it as: `[filename.png](file:///absolute/path/to/filename.png)`. If the `--output` value was relative, resolve it against the current working directory. Do NOT use `--preview` — terminal ASCII art is not visible in this environment.

### Monitor Commands

| Command | Args | Description |
|---------|------|-------------|
| `monitor create` | `<table> --event <insert\|update\|delete>` | Create a table monitor |
| `monitor show` | `[monitor-id]` | Show active monitors |
| `monitor clear` | `<monitor-id>` | Remove a table monitor |
| `monitor create-trigger` | `<table> --trigger-type <type> --options <json>` | Create a trigger (area, range, etc.) |
| `monitor clear-trigger` | `<trigger-id>` | Remove a trigger |
| `monitor show-triggers` | `[table]` | List active triggers |

### get-records Options

| Option | Description |
|--------|-------------|
| `--limit N` | Max records (default: 100) |
| `--offset N` | Skip first N records |
| `--expression EXPR` | Filter expression (e.g., `"age > 30"`) |
| `--columns col1,col2` | Select specific columns |
| `--sort-by COL` | Sort by column |
| `--sort-order asc\|desc` | Sort direction |

### Examples

```bash
# Health check
python3 <skill_path>/scripts/kinetica-cli.py health

# Run a SQL query
python3 <skill_path>/scripts/kinetica-cli.py query "SELECT * FROM my_schema.my_table LIMIT 10"

# List all tables
python3 <skill_path>/scripts/kinetica-cli.py show-tables

# List tables in a specific schema
python3 <skill_path>/scripts/kinetica-cli.py show-tables my_schema

# Describe table schema
python3 <skill_path>/scripts/kinetica-cli.py describe-table my_schema.my_table

# Get records with filtering
python3 <skill_path>/scripts/kinetica-cli.py get-records my_table --limit 50 --expression "status = 'active'" --sort-by created_at --sort-order desc

# Insert JSON records
python3 <skill_path>/scripts/kinetica-cli.py insert-json my_table '[{"id": 1, "name": "Alice"}]'

# Insert from file
python3 <skill_path>/scripts/kinetica-cli.py insert-json my_table @data.json

# Delete records
python3 <skill_path>/scripts/kinetica-cli.py delete-records my_table "id = 42"

# Drop a table
python3 <skill_path>/scripts/kinetica-cli.py clear-table my_table

# Group-by aggregation
python3 <skill_path>/scripts/kinetica-cli.py aggregate my_table "category,count(*),avg(price)"
```

### Category Examples

```bash
# Create a graph from edges table
python3 <skill_path>/scripts/kinetica-cli.py graph create my_graph --edges "roads.src AS SOURCE, roads.dst AS DESTINATION"

# Find shortest path
python3 <skill_path>/scripts/kinetica-cli.py graph solve my_graph --solver-type SHORTEST_PATH --source-nodes "node_A" --dest-nodes "node_B"

# Graph adjacency query (CLI — find neighbors 2 hops away)
python3 <skill_path>/scripts/kinetica-cli.py graph query my_graph --queries "node_A,node_B" --rings 2

# Cypher pattern matching (executed as SQL via query command)
python3 <skill_path>/scripts/kinetica-cli.py query "GRAPH wiki_graph MATCH (a:MALE WHERE (node = 'Tom'))<-[b:Friend]-(c) RETURN a.node AS originator, c.node AS friend"

# Cypher with GRAPH_TABLE() for SQL aggregation
python3 <skill_path>/scripts/kinetica-cli.py query "SELECT person, COUNT(*) AS connections FROM GRAPH_TABLE(GRAPH my_graph MATCH (a)-[e]->(b) RETURN a.node AS person) GROUP BY 1"

# SOLVE_GRAPH via SQL (full options)
python3 <skill_path>/scripts/kinetica-cli.py query "SELECT * FROM TABLE(SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'ALLPATHS', SOURCE_NODES => INPUT_TABLE((SELECT 'nodeA' AS node)), DESTINATION_NODES => INPUT_TABLE((SELECT 'nodeB' AS node)), OPTIONS => KV_PAIRS(uniform_weights = '1')))"

# Filter points within 5km radius
python3 <skill_path>/scripts/kinetica-cli.py geo filter-by-radius locations --x-col longitude --y-col latitude --center-x -122.4 --center-y 37.77 --radius 5000

# Filter by bounding box
python3 <skill_path>/scripts/kinetica-cli.py geo filter-by-box locations --x-col longitude --y-col latitude --min-x -122.5 --max-x -122.3 --min-y 37.7 --max-y 37.8

# Import CSV data
python3 <skill_path>/scripts/kinetica-cli.py io import-files my_table --file-path /data/records.csv

# List KiFS directory contents
python3 <skill_path>/scripts/kinetica-cli.py io kifs-list /data/uploads

# Generate a chart
python3 <skill_path>/scripts/kinetica-cli.py viz chart sales --x-column month --y-column revenue --output chart.png

# Generate a heatmap
python3 <skill_path>/scripts/kinetica-cli.py viz heatmap sensor_data --x-col lon --y-col lat --value-col temperature --colormap jet --output heatmap.png

# Generate isochrone contours
python3 <skill_path>/scripts/kinetica-cli.py viz isochrone my_graph --source 42 --max-radius 300 --output isochrone.png

# Generate a class-break map
python3 <skill_path>/scripts/kinetica-cli.py viz classbreak --config '{"LAYERS":"my_table","BBOX":"-180,-90,180,90","CB_ATTR":"category","CB_VALS":"A,B,C","X_ATTR":"lon","Y_ATTR":"lat"}' --output classbreak.png

# Generate a custom WMS map
python3 <skill_path>/scripts/kinetica-cli.py viz wms --config '{"LAYERS":"my_table","BBOX":"-122.5,37.7,-122.3,37.8","STYLES":"raster","X_ATTR":"lon","Y_ATTR":"lat"}' --output wms.png

# Create a table monitor for inserts
python3 <skill_path>/scripts/kinetica-cli.py monitor create my_table --event insert

# Show active monitors
python3 <skill_path>/scripts/kinetica-cli.py monitor show
```

## Execute vs. Generate Decision

### Execute Directly (via CLI)

Use CLI commands for:
- Simple SQL queries (`SELECT`, `INSERT`, `UPDATE`, `DELETE`)
- Listing and describing tables
- Quick data inserts (JSON)
- Health checks and connection testing
- One-off aggregations
- Data exploration and schema discovery
- Graph inspection (`graph show`), adjacency queries (`graph query`), single-solver runs (`graph solve`), and simple Cypher queries via `query "GRAPH ... MATCH ..."`
- Simple geospatial filters (single radius, box, or area query)
- File imports (`io import-files`) and single-file KiFS operations
- Quick visualizations (`viz chart`, `viz heatmap`)
- Creating/listing monitors and triggers

### Generate Code

Write a Node.js or Python script when the user needs:
- Complex multi-step workflows (ETL, batch processing)
- Type/table creation with specific properties
- Reusable scripts they can run independently
- Advanced operations (SqlIterator for pagination, bulk loading)
- Custom error handling or retry logic
- Integration into existing codebases
- Complex multi-graph workflows (create graph with full DDL, solve, then query results)
- Multi-step graph analytics (centrality + shortest path + Cypher traversal + visualization)
- MATCH_GRAPH supply-demand optimization with multi-modal transport and spec matching
- Chained Cypher-to-OLAP pipelines (GRAPH_TABLE aggregation with joins)
- Chained geospatial-to-visualization pipelines (filter by area, then generate heatmap)
- Custom monitor callbacks with event processing logic
- Bulk KiFS operations (upload/download many files in a loop)

When generating code, read `<skill_path>/references/api-reference.md` for API patterns and examples in both languages.

## SQL vs. Cypher Decision Guide

**Before writing any query, check if a graph exists** that covers the data domain. Run `graph show` and, if a relevant graph exists, inspect its node/edge labels:

```bash
# Check graph structure before defaulting to SQL
<cli> describe-table <schema>.<graph_name>_nodes
<cli> describe-table <schema>.<graph_name>_edges
<cli> query "SELECT DISTINCT LABEL FROM <schema>.<graph_name>_edges LIMIT 20"
```

### Use Cypher (PGQL) when:

- The question is about **relationships between entities** — mutual connections, "who knows whom," shared interests, influence
- The query naturally reads as a **path pattern** — `(A)-[rel1]-(B)-[rel2]-(C)`
- The graph has **typed edge labels** that distinguish relationship semantics (e.g., `liked`, `posted`, `follows`)
- You need **variable-length traversal** — "friends of friends," reachability within N hops
- The result depends on **graph topology** — shortest path, centrality, page rank

### Use SQL when:

- The question is about **filtering, aggregation, or ranking** flat tabular data
- You need **GROUP BY, window functions, or statistical aggregations** on query results (use `GRAPH_TABLE()` wrapper if combining with Cypher)
- No graph exists for the relevant tables, or the graph lacks meaningful edge/node labels
- The query is a simple lookup, count, or CRUD operation

### Key misconception: undirected graphs still have direction

An undirected graph (`directed: false`) does NOT mean relationships are directionless. **Edge labels encode semantic direction.** In a graph with `liked` and `posted` edges, the pattern `(user)-[liked]-(post)-[posted]-(user)` constrains traversal by label — which effectively enforces who-liked-whose-post, even though the graph itself is undirected. Do not fall back to SQL simply because a graph is undirected.

### Anti-pattern: SQL tunnel vision

If you start exploration with `show-tables` and `describe-table`, you may get locked into SQL mode and miss that a graph already models the relationships. **When the user's question involves relationships, run `graph show` first** — before examining any tables.

## Output Interpretation

CLI commands output JSON to stdout. Present results to the user as:

1. **Query results** → Format `records` array as a markdown table
2. **Table listings** → Format as a bulleted list or table with name + size
3. **Describe table** → Show columns table (name, type, properties)
4. **Errors** → Show the error message and suggest fixes

### Pagination

If `has_more_records` is `true` in the response, inform the user and offer to fetch the next page using `--offset` and `--limit`.

## Code Generation Templates

### Node.js Template

```javascript
const GPUdb = require('@kinetica/gpudb');

(async () => {
  const db = new GPUdb(process.env.KINETICA_DB_SKILL_URL || 'http://localhost:9191', {
    username: process.env.KINETICA_DB_SKILL_USER || '',
    password: process.env.KINETICA_DB_SKILL_PASS || ''
  });

  try {
    // Your operations here
    const resp = await db.execute_sql_request({
      statement: 'SELECT * FROM my_table',
      encoding: 'json'
    });
    console.log(resp.data);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
```

### Python Template

```python
import gpudb
import os

db = gpudb.GPUdb(
    host=os.environ.get('KINETICA_DB_SKILL_URL', 'http://localhost:9191'),
    username=os.environ.get('KINETICA_DB_SKILL_USER', ''),
    password=os.environ.get('KINETICA_DB_SKILL_PASS', '')
)

# Your operations here
resp = db.execute_sql('SELECT * FROM my_table', encoding='json')
print(resp['column_headers'])
```

## Error Handling

| Error | Likely Cause | Action |
|-------|-------------|--------|
| `KINETICA_DB_SKILL_URL is not set` | Missing env var | Run the Connection Setup flow, then retry the command |
| `Connection refused` | Server not running | Verify URL and server status |
| `Authentication failed` | Wrong credentials | Offer to re-run the Connection Setup flow to update credentials, then retry |
| `Table does not exist` | Wrong name/schema | Run `show-tables` to list available tables |
| `Cannot find module '@kinetica/gpudb'` | Node.js deps not installed | Run `cd <skill_path> && npm install` (use resolved `<skill_path>`) |
| `ModuleNotFoundError: No module named 'gpudb'` | Python deps not installed | Run `pip install -r <skill_path>/requirements.txt` (use resolved `<skill_path>`) |
| `No matching distribution found for gpudb` | Python version not supported (3.14+) | The `gpudb` package requires Python 3.8–3.13. Use the Node.js runtime instead |
| `Expression parse error` | Invalid filter syntax | Use SQL-like expressions: `col > value`, `col = 'string'` |
| `Graph not found` | Wrong graph name | Run `graph show` to list available graphs |
| `Invalid solver type` | Unsupported solver | Use SHORTEST_PATH, PAGE_RANK, TSP, CENTRALITY, etc. |
| `Column not found` | Wrong column in geo filter | Run `describe-table` to check column names |
| `Invalid WKT` | Malformed geometry string | Check WKT syntax (e.g., `POLYGON((...))`) |
| `KiFS directory not found` | Wrong KiFS path | Run `io kifs-list` to browse KiFS |
| `Import file not found` | Bad file path for import | Verify the file path exists and is accessible |
| `Monitor not found` | Invalid monitor ID | Run `monitor show` to list active monitors |

# Kinetica SQL Dialect

Kinetica is a GPU-accelerated database with a PostgreSQL-compatible SQL dialect.
It handles billions of rows, vector search, geospatial, time-series, and graph analytics.

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
**Prefer Cypher over SQL for relationship queries** — see [SQL vs. Cypher Decision Guide](#sql-vs-cypher-decision-guide).
See [references/graph-functions.md](references/graph-functions.md) and [references/graph-examples.md](references/graph-examples.md).

### UDFs, Procedures & ML
User-Defined Functions (Python), scheduled SQL procedures, built-in ML (PREDICT, OUTLIERS),
and Docker model management.
See [references/udf-reference.md](references/udf-reference.md).

## Query Writing Guidelines

0. **Graph check first** — If the question involves relationships (mutual, paths, connections, influence), run `graph show` before writing SQL. If a relevant graph exists with typed edge labels, use Cypher — see [SQL vs. Cypher Decision Guide](#sql-vs-cypher-decision-guide)
1. Always check column names and types before writing SQL — Kinetica is case-sensitive
2. Quote schema-qualified table names: `"schema"."table"`
3. Use LIMIT for exploration queries
4. Use CTEs instead of nested subqueries with aggregates
5. For date math, always use DATEDIFF/DATEADD — never subtract timestamps directly
6. When in doubt, consult the relevant reference file for the domain
