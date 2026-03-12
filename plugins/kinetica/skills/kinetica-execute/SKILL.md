---
name: kinetica-execute
description: Use when interacting with a Kinetica GPU database — running SQL queries, exploring table schemas, graph analytics (shortest path, PageRank, TSP), geospatial filtering, server-side visualization, data import/export, or table monitoring via the Node.js or Python API
argument-hint: <sql-or-action>
user-invocable: true
---

# Kinetica DB Skill

Full database operations skill for **Kinetica GPU database** with dual-runtime support (Node.js and Python). Execute queries, explore schemas, insert/update/delete data, run graph analytics, apply geospatial filters, generate visualizations, manage imports/exports, monitor tables, or generate reusable code in either language.

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
| `data_str` | string | **The actual result** — a JSON-encoded string that must be parsed a second time |

> **Key point:** `data_str` is a JSON *string*, not a JSON object. You must parse it a second time (via `fromjson` in jq, `JSON.parse()` in JS, or `json.loads()` in Python) to get usable data.

**Example raw response (abbreviated):**
```json
{
  "status": "OK",
  "message": "",
  "data_type": "execute_sql_response",
  "data": {},
  "data_str": "{\"column_1\":[1,2,3],\"column_headers\":[\"id\",\"name\",\"value\"],\"total_number_of_records\":3}"
}
```

#### Extracting data with `jq`

**Basic — parse `data_str` payload:**
```bash
curl ... | jq '.data_str | fromjson'
```

**SQL results — column headers and row count:**
```bash
curl ... | jq '.data_str | fromjson | {headers: .column_headers, rows: .total_number_of_records}'
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
- **`data_str` is double-encoded** — the value is a JSON *string*, not an object; pipe through `fromjson` in `jq` (or `JSON.parse()` / `json.loads()`) to get the actual payload

## Setup Cache (Fast Path)

**Run this check before anything else.** It avoids redundant interpreter-based dependency detection across sessions by caching setup state in auto-memory.

1. **Read cache** — Check if the auto-memory `MEMORY.md` (already loaded into context) contains a `## Kinetica Setup Cache` section. If not found → skip to **Connection Setup** below
2. **Validate** — Run a single Bash command to verify the cached state still holds:
   - If `credentials: dotenv` → include `test -f .env && grep -q KINETICA_DB_SKILL_URL .env`
   - If `credentials: env-vars` or `credentials: inline` → no credentials file check needed
   - If `runtime: nodejs` → include `test -f <skill_path>/node_modules/@kinetica/gpudb/package.json` (use the `skill path` value from the cache)
   - If `runtime: python` and `venv: yes` → include `test -f .venv/bin/activate`
   - If `runtime: python` and `venv: no` → cannot validate via file check; skip to **Connection Setup** (full detection required)
   - Chain all applicable checks with `&&` in one command
3. **Cache hit** (all checks pass) → Skip **Connection Setup**, **Dependency Setup**, and **Runtime Detection** entirely. Use the cached `runtime` value for all CLI commands this session
4. **Cache miss** (any check fails) → Delete the stale `## Kinetica Setup Cache` section from auto-memory `MEMORY.md`, then proceed to **Connection Setup** below

## Connection Setup

**Run this flow before the first CLI command in a session, unless the Setup Cache validated successfully.** If credentials are already configured, this completes instantly at step 2.

1. **Locate** — Use the current working directory as the project root
2. **Check** — Read shell environment variables first (they take precedence). Then, if a `.env` file exists in the project root, **read it using the Read tool** (this is required so the Write tool can overwrite it later if needed). If `KINETICA_DB_SKILL_URL` is set and non-empty from either source → skip to step 6
3. **Prompt** — Use `AskUserQuestion` to collect connection details in a single prompt:
   - **Server URL** (required) — e.g., `http://localhost:9191`
   - **Auth method** — Username/Password or OAuth Token
   - **Credentials** — username + password, or OAuth token, depending on the choice above
4. **Warn** — Before writing anything, inform the user: *"I'll save these credentials to a local `.env` file (which is gitignored). OK to proceed?"* Use `AskUserQuestion` with Yes/No options. If the user declines, **do not write `.env`** — instead, prefix env vars inline on each CLI call for the remainder of the session (e.g., `KINETICA_DB_SKILL_URL=... python3 ... health`)
5. **Write** — Create `<project_root>/.env` using the format from `.claude/skills/kinetica-execute/.env.template`, filling in the user-provided values. **Do NOT echo passwords or tokens in your response.** If the write fails (e.g., permission denied), show the user the exact file content they need to create manually (masking secrets with `***`)
6. **Proceed** — Continue with the user's original request

## Dependency Setup

**Run this flow after Connection Setup completes, unless the Setup Cache validated successfully.** If dependencies are already installed, this completes instantly at step 1.

> **Python version note:** The `gpudb` PyPI package ships pre-built wheels for Python 3.8–3.13 only. If you are running Python 3.14+, use the Node.js runtime instead.

1. **Detect** — Check which runtime is available:
   ```bash
   # Check Node.js SDK
   node -e "process.chdir('.claude/skills/kinetica-execute'); require('@kinetica/gpudb')" 2>/dev/null && echo "nodejs:ok"

   # Check Python SDK (activate venv first if it exists)
   test -f .venv/bin/activate && source .venv/bin/activate
   python3 -c "import gpudb" 2>/dev/null && echo "python:ok"
   ```
2. **Install if missing** — If neither runtime has the SDK installed:
   - **Node.js** (recommended — no platform restrictions): `cd .claude/skills/kinetica-execute && npm install`
   - **Python** (requires Python 3.8–3.13): First verify the Python version is compatible, then install:
     ```bash
     python3 -c "import sys; v=sys.version_info; exit(0 if (3,8)<=v[:2]<=(3,13) else 1)" && echo "python:compatible" || echo "python:incompatible — use Node.js runtime"
     ```
     If compatible: `pip install -r .claude/skills/kinetica-execute/requirements.txt` (create a venv first if one doesn't exist: `python3 -m venv .venv && source .venv/bin/activate`)
   - **Both failed**: If Node.js is not installed and Python is 3.14+, inform the user: *"The Python gpudb package requires Python 3.8–3.13. Please install Node.js v16+ to use this skill, or switch to a compatible Python version."*
3. **Proceed** — Continue with the user's original request

### Write Setup Cache

After both **Connection Setup** and **Dependency Setup** complete successfully, write (or replace) the `## Kinetica Setup Cache` section in the auto-memory `MEMORY.md` file:

```markdown
## Kinetica Setup Cache
- Runtime: <nodejs|python>
- Skill path: <relative path to .claude/skills/kinetica-execute>
- Credentials: <dotenv|env-vars|inline>
- Venv: <yes|no>
- Cached: <YYYY-MM-DD>
```

Rules:
- If `## Kinetica Setup Cache` already exists in `MEMORY.md`, **replace it** (do not duplicate)
- Only write after setup succeeds — never mid-flow
- `credentials` value: `dotenv` if `.env` was used, `env-vars` if shell env vars were used, `inline` if env vars are prefixed on each CLI call
- `venv`: `yes` if `.venv/bin/activate` exists, `no` otherwise

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
cd .claude/skills/kinetica-execute && npm install

# Python (requires Python 3.8–3.13; use venv — required on macOS/Homebrew)
python3 -m venv .venv && source .venv/bin/activate && pip install -r .claude/skills/kinetica-execute/requirements.txt
```

## Runtime Detection

**If the Setup Cache validated successfully, skip this section and use the cached runtime.**

Before running CLI commands, detect which runtime is available:

```bash
# Check Node.js (resolve from skill directory where node_modules/ lives)
node -e "process.chdir('.claude/skills/kinetica-execute'); require('@kinetica/gpudb')" 2>/dev/null && echo "nodejs:ok"

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

```bash
# Node.js
node <project>/.claude/skills/kinetica-execute/scripts/kinetica-cli.js <command> [args]

# Python
python3 <project>/.claude/skills/kinetica-execute/scripts/kinetica-cli.py <command> [args]
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
| `graph query` | `<name> --queries <expr>` | Query graph adjacency or reachability |
| `graph match` | `<name> --sample-points <table>` | Map-match GPS points to graph edges |
| `graph delete` | `<name>` | Delete a graph |
| `graph show` | `[name]` | List graphs or show graph details |

**graph solve --solver-type values:** `SHORTEST_PATH`, `PAGE_RANK`, `CENTRALITY`, `MULTIPLE_ROUTING`, `ALLPATHS`, `TSP`, `INVERSE_SHORTEST_PATH`, `BACKHAUL_ROUTING`, `ISOCHRONE`

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
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py health

# Run a SQL query
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py query "SELECT * FROM my_schema.my_table LIMIT 10"

# List all tables
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py show-tables

# List tables in a specific schema
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py show-tables my_schema

# Describe table schema
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py describe-table my_schema.my_table

# Get records with filtering
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py get-records my_table --limit 50 --expression "status = 'active'" --sort-by created_at --sort-order desc

# Insert JSON records
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py insert-json my_table '[{"id": 1, "name": "Alice"}]'

# Insert from file
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py insert-json my_table @data.json

# Delete records
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py delete-records my_table "id = 42"

# Drop a table
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py clear-table my_table

# Group-by aggregation
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py aggregate my_table "category,count(*),avg(price)"
```

### Category Examples

```bash
# Create a graph from edges table
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py graph create my_graph --edges "roads.src AS SOURCE, roads.dst AS DESTINATION"

# Find shortest path
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py graph solve my_graph --solver-type SHORTEST_PATH --source-nodes "node_A" --dest-nodes "node_B"

# Filter points within 5km radius
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py geo filter-by-radius locations --x-col longitude --y-col latitude --center-x -122.4 --center-y 37.77 --radius 5000

# Filter by bounding box
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py geo filter-by-box locations --x-col longitude --y-col latitude --min-x -122.5 --max-x -122.3 --min-y 37.7 --max-y 37.8

# Import CSV data
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py io import-files my_table --file-path /data/records.csv

# List KiFS directory contents
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py io kifs-list /data/uploads

# Generate a chart
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py viz chart sales --x-column month --y-column revenue --output chart.png

# Generate a heatmap
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py viz heatmap sensor_data --x-col lon --y-col lat --value-col temperature --colormap jet --output heatmap.png

# Generate isochrone contours
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py viz isochrone my_graph --source 42 --max-radius 300 --output isochrone.png

# Generate a class-break map
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py viz classbreak --config '{"LAYERS":"my_table","BBOX":"-180,-90,180,90","CB_ATTR":"category","CB_VALS":"A,B,C","X_ATTR":"lon","Y_ATTR":"lat"}' --output classbreak.png

# Generate a custom WMS map
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py viz wms --config '{"LAYERS":"my_table","BBOX":"-122.5,37.7,-122.3,37.8","STYLES":"raster","X_ATTR":"lon","Y_ATTR":"lat"}' --output wms.png

# Create a table monitor for inserts
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py monitor create my_table --event insert

# Show active monitors
python3 .claude/skills/kinetica-execute/scripts/kinetica-cli.py monitor show
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
- Graph inspection (`graph show`) and single-solver runs (`graph solve`)
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
- Complex multi-graph workflows (create graph, solve, then visualize results)
- Chained geospatial-to-visualization pipelines (filter by area, then generate heatmap)
- Custom monitor callbacks with event processing logic
- Bulk KiFS operations (upload/download many files in a loop)
- Multi-step graph analytics (centrality + shortest path + visualization)

When generating code, read `.claude/skills/kinetica-execute/references/api-reference.md` for API patterns and examples in both languages.

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
| `Cannot find module '@kinetica/gpudb'` | Node.js deps not installed | Run `cd .claude/skills/kinetica-execute && npm install` |
| `ModuleNotFoundError: No module named 'gpudb'` | Python deps not installed | Run `pip install -r .claude/skills/kinetica-execute/requirements.txt` |
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
