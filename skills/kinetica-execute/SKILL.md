---
name: kinetica-execute
description: >-
  Use when interacting with a Kinetica GPU database — running SQL queries, exploring table
  schemas, graph analytics (shortest path, PageRank, TSP), geospatial filtering, WMS map
  tile rendering (heatmaps, contours, rasters, class-breaks, labels, isochrones from x/y
  or WKT data), data import/export, or table monitoring. Provides an interactive CLI via
  Node.js or Python. Activate even for simple tasks like checking table counts or running
  a quick query against Kinetica. Also covers SQL analytics (geospatial, time-series,
  graph, vector search), EXPLAIN plans, system table queries, security configuration,
  and database administration.
license: Apache-2.0
compatibility: Requires Node.js 18+ or Python 3.8+ and network access to a Kinetica database
argument-hint: <sql-or-action>
user-invocable: true
metadata:
  author: kinetica
  version: "1.0.48"
---

# Kinetica DB Skill

Full database operations skill for **Kinetica GPU database** with dual-runtime support (Node.js and Python). Execute queries, explore schemas, insert/update/delete data, run graph analytics, apply geospatial filters, generate visualizations, manage imports/exports, monitor tables, or generate reusable code in either language.

## Kinetica REST API Access (curl)

> **Note:** curl is a session-only fallback — never a cacheable runtime. Use it only when the
> user explicitly requests raw REST calls, or when neither Node.js nor Python SDK is available.
> Never save `runtime: curl` in the Setup Cache.

When you need to call Kinetica's REST API directly via `curl`, **you MUST read
[references/curl-api-reference.md](references/curl-api-reference.md) first** — it covers
authentication (.env loading), required flags, common endpoints, response parsing with jq,
and critical gotchas (always POST, never use `-u`, `data_str` double-encoding).

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
5. **Write** — Create `<project_root>/.env` using the format from `<skill_path>/.env.template`, filling in the user-provided values. **Do NOT echo passwords or tokens in your response.** Once `.env` is written successfully, **do not prefix env vars inline on CLI calls** — the CLI auto-loads `.env` from the project root, so inline prefixes are unnecessary and redundant. If the write fails (e.g., permission denied), show the user the exact file content they need to create manually (masking secrets with `***`)
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
| `graph create` | `<name> --edges <spec> [--nodes <spec>] [--weights <spec>] [--restrictions <spec>] [--directed] [--recreate] [--persist]` | Create a graph from table data |
| `graph solve` | `<name> --solver-type <type> [--source-nodes <ids>] [--dest-nodes <ids>] [--solution-table <tbl>] [--weights-on-edges <spec>] [--restrictions <spec>] [--max-solution-targets <n>] [--output-wkt] [--output-edge-path]` | Run solver (SHORTEST_PATH, PAGE_RANK, TSP, etc.) |
| `graph query` | `<name> --queries <node_ids> [--rings <n>] [--adjacency-table <tbl>] [--restrictions <spec>] [--force-undirected] [--limit <n>] [--output-wkt]` | Topological adjacency — find neighbors N hops from given node IDs (NOT for Cypher/PGQL pattern matching) |
| `graph match` | `<name> --sample-points <spec> [--solve-method <method>] [--solution-table <tbl>]` | Map-match GPS or run batch solves (methods: `markov_chain`, `match_od_pairs`, `match_supply_demand`, `match_batch_solves`) |
| `graph delete` | `<name> [--delete-persist]` | Delete a graph (add `--delete-persist` to also remove persisted data) |
| `graph show` | `[name]` | List graphs or show graph details |

**graph solve --solver-type values:** `SHORTEST_PATH`, `PAGE_RANK`, `PROBABILITY_RANK`, `CENTRALITY`, `MULTIPLE_ROUTING`, `ALLPATHS`, `TSP`, `INVERSE_SHORTEST_PATH`, `BACKHAUL_ROUTING`, `CLOSENESS`

> **Extended timeouts:** Graph CLI commands (`graph create`, `graph solve`, `graph query`, `graph match`), Cypher/PGQL queries (`query "GRAPH ... MATCH ..."`), and SQL SOLVE_GRAPH calls (`query "SELECT * FROM TABLE(SOLVE_GRAPH(...))"`) can take significantly longer than standard SQL. Set `KINETICA_DB_SKILL_TIMEOUT=300000` (5 min) so the CLI script does not abort the HTTP request early, **and** set the Bash tool timeout to **360000 ms** (6 min) to allow the script to handle its own timeout gracefully before the process is killed. The Bash timeout must always exceed `KINETICA_DB_SKILL_TIMEOUT`.

> **CLI `graph create`:** Supports `--nodes`, `--edges`, `--weights`, `--restrictions`, `--directed`, `--recreate`, `--persist` for simple single-table specs. For multi-table NODES/EDGES, LABEL_KEY, VARCHAR[] weights, or extended OPTIONS, use `query "CREATE GRAPH ..."` (full DDL syntax) — see `references/graph-functions.md` §Creating Graphs.

### When to Use CLI vs SQL for Graphs

CLI commands (`graph create/solve/query/match`) call REST endpoints directly — use them for simple one-shot operations.
For Cypher pattern matching, SOLVE_GRAPH with custom options, or GRAPH_TABLE aggregation, use the `query` command instead.

**Key distinction — `graph query` vs Cypher:**
- `graph query <name> --queries <node_ids>` → REST `/query/graph` — finds adjacent nodes by ID within N hops. NOT for pattern matching.
- `query "GRAPH name MATCH ..."` → Cypher/PGQL via SQL engine — labels, attribute filters, variable-length paths, aggregation.

See [Graph Operations Workflow](#graph-operations-workflow) for the full decision guide and Cypher syntax.

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
| `viz heatmap` | `<table> (--x-col --y-col \| --geo-col) [--value-col] [--srs EPSG:4326] [--blur-radius N] [--colormap NAME] [--min-x/max-x/min-y/max-y] [--width] [--height] --output <file>` | Generate a heatmap via WMS |
| `viz isochrone` | `<graph> --source <node_id> --max-radius <cost> [--num-levels N] [--weights-on-edges <cols>] --output <file>` | Generate isochrone contours |
| `viz classbreak` | `--config <json_or_@file> --output <file>` | Generate class-break map via WMS |
| `viz wms` | `--config <json_or_@file> --output <file>` | Send a custom WMS request |

> **Output:** All viz commands require `--output <file>` to write the image to disk. After the command succeeds, you **MUST** include a clickable file link so the user can view or download the PNG. Use the absolute path and present it as: `[filename.png](file:///absolute/path/to/filename.png)`. If the `--output` value was relative, resolve it against the current working directory. Do NOT use `--preview` — terminal ASCII art is not visible in this environment.

> **Isochrone parameters:** `--source` is a graph node ID (not WKT). `--max-radius` is the cost threshold in the same units as the graph's edge weights (distance, time, etc. — default: 100). `--num-levels` sets the number of contour bands (default: 4). Use `--weights-on-edges` to specify which weight columns to use for cost calculation.

> **Choosing GEO_ATTR vs X_ATTR/Y_ATTR:** Before generating a heatmap, classbreak, or WMS visualization, check the table schema via `describe-table`:
> - If the table has a **WKT/geometry column** (type `string` with WKT data like `POINT(...)`, `LINESTRING(...)`, etc.) → use `--geo-col` (heatmap) or `"geo_attr"` / `"GEO_ATTR"` (classbreak/wms JSON config)
> - If the table has **separate longitude/latitude columns** → use `--x-col`/`--y-col` (heatmap) or `"x_attr"`/`"y_attr"` / `"X_ATTR"`/`"Y_ATTR"` (classbreak/wms JSON config)
> - **Never combine both** — `GEO_ATTR` and `X_ATTR`/`Y_ATTR` are mutually exclusive; the CLI will reject the request

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
# Graph: create, solve, query, match — see references/graph-examples.md for full set
python3 <skill_path>/scripts/kinetica-cli.py graph create my_graph --edges "roads.src AS SOURCE, roads.dst AS DESTINATION"
python3 <skill_path>/scripts/kinetica-cli.py graph solve my_graph --solver-type SHORTEST_PATH --source-nodes "node_A" --dest-nodes "node_B"
python3 <skill_path>/scripts/kinetica-cli.py graph solve my_graph --solver-type PAGE_RANK --solution-table "pagerank_results"
python3 <skill_path>/scripts/kinetica-cli.py graph query my_graph --queries "node_A" --rings 3 --adjacency-table "neighbors_3hop"
python3 <skill_path>/scripts/kinetica-cli.py query "GRAPH wiki_graph MATCH (a:MALE WHERE (a.node = 'Tom'))<-[b:Friend]-(c) RETURN a.node AS originator, c.node AS friend"

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

# Generate a heatmap (separate lon/lat columns)
python3 <skill_path>/scripts/kinetica-cli.py viz heatmap sensor_data --x-col lon --y-col lat --value-col temperature --colormap jet --output heatmap.png

# Generate a heatmap (WKT geometry column)
python3 <skill_path>/scripts/kinetica-cli.py viz heatmap geo_table --geo-col geom --value-col temperature --colormap viridis --output heatmap_geo.png

# Generate isochrone contours
python3 <skill_path>/scripts/kinetica-cli.py viz isochrone my_graph --source 42 --max-radius 300 --output isochrone.png

# Generate a class-break map (separate lon/lat columns)
python3 <skill_path>/scripts/kinetica-cli.py viz classbreak --config '{"LAYERS":"my_table","BBOX":"-180,-90,180,90","CB_ATTR":"category","CB_VALS":"A,B,C","X_ATTR":"lon","Y_ATTR":"lat"}' --output classbreak.png

# Generate a class-break map (WKT geometry column)
python3 <skill_path>/scripts/kinetica-cli.py viz classbreak --config '{"LAYERS":"geo_table","BBOX":"-180,-90,180,90","CB_ATTR":"category","CB_VALS":"A,B,C","geo_attr":"geom"}' --output classbreak_geo.png

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
  > MATCH_GRAPH is always executed via `EXECUTE FUNCTION` (not CLI). See `references/graph-functions.md` for parameter schema.
- Chained Cypher-to-OLAP pipelines (GRAPH_TABLE aggregation with joins)
- Chained geospatial-to-visualization pipelines (filter by area, then generate heatmap)
- Custom monitor callbacks with event processing logic
- Bulk KiFS operations (upload/download many files in a loop)

When generating code, read `<skill_path>/references/api-reference.md` for API patterns and examples in both languages.

> **Before writing WMS visualization code:** read `references/wms-reference.md` for all rendering styles, parameters, defaults, and gotchas.

**Multi-graph pipeline pattern** (for generated scripts): When a workflow requires create→solve→query or cross-graph analysis, chain the steps sequentially and query the solution table between steps:

```python
# Pattern: create graph → solve → query solution → visualize
db.execute_sql("CREATE OR REPLACE DIRECTED GRAPH my_graph (...)")
db.execute_sql("SELECT * FROM TABLE(SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'CENTRALITY', ...))")
result = db.execute_sql("SELECT * FROM my_graph_solution ORDER BY SOLVERS_NODE_COSTS DESC LIMIT 10")
# Use top-centrality nodes as input for a second solve (e.g., shortest path between key nodes)
db.execute_sql("SELECT * FROM TABLE(SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'SHORTEST_PATH', ...))")
```

## Graph Operations Workflow

> **Before writing CREATE GRAPH DDL, complex Cypher, SOLVE_GRAPH, or MATCH_GRAPH:** read `references/graph-functions.md` for grammar/syntax and `references/graph-examples.md` for domain-specific patterns. The inline examples below are sufficient for simple Cypher on existing graphs.

### Step 1: Check for Existing Graphs

Before writing any query involving relationships, run `graph show` first — not `show-tables`:

```bash
<cli> graph show                                    # list all graphs
<cli> graph show <graph_name>                       # shows source tables, directed flag, edge/node counts
<cli> describe-table <source_table_from_graph_show> # inspect actual column names — do NOT assume _nodes/_edges naming
<cli> query "SELECT DISTINCT LABEL FROM <source_table_from_graph_show> LIMIT 20"
```

> **Incremental updates:** To add nodes, edges, or restrictions to an existing graph without recreating it, use `ALTER GRAPH`. See `references/graph-functions.md` §ALTER GRAPH.

> **Graph lifecycle:**
> - **Persist:** Add `save_persist = 'true'` in CREATE GRAPH OPTIONS to survive server restarts.
> - **Live sync:** Add `add_table_monitor = 'true'` so the graph auto-updates when source tables change (inserts/updates/deletes).
> - **Recreate:** Use `CREATE OR REPLACE ... GRAPH` or `recreate = 'true'` to overwrite an existing graph.
> - **Delete:** `graph delete <name>` removes a graph. Add `--delete-persist` to also remove persisted data. This does NOT delete the source tables.

### Step 2: Choose Execution Method

| Scenario | Method | Command |
|----------|--------|---------|
| Adjacency / neighbors by node ID | CLI `graph query` | `graph query <name> --queries <node_ids>` |
| Single solver (shortest path, PageRank) | CLI `graph solve` | `graph solve <name> --solver-type SHORTEST_PATH ...` |
| Relationship patterns, labels, multi-hop, attribute filters | **Cypher** | `query "GRAPH name MATCH ... RETURN ..."` |
| Cypher results + GROUP BY / aggregation | **Cypher + GRAPH_TABLE()** | `query "SELECT ... FROM GRAPH_TABLE(GRAPH name MATCH ... RETURN ...) GROUP BY ..."` |
| Solver with custom options / SQL joins | SQL SOLVE_GRAPH | `query "SELECT * FROM TABLE(SOLVE_GRAPH(...))"` |
| GPS snap-to-road, OD pairs, batch solves | CLI `graph match` | `graph match <name> --solve-method <method> --sample-points <spec> --solution-table <tbl>` |
| Supply-demand, isochrone, EV charging | SQL MATCH_GRAPH | `query "EXECUTE FUNCTION MATCH_GRAPH(...)"` |
| No graph exists; flat tabular data | SQL | `query "SELECT ... FROM table ..."` |
| Graph exists but query is pure aggregation (no traversal) | SQL | Direct SQL on source tables is faster than Cypher for non-relationship aggregation |

**Prerequisites**: Cypher and SOLVE_GRAPH require a pre-created graph. If no graph exists, either create one first (see `references/graph-functions.md` §Creating Graphs) or use SQL JOINs.

> **Performance warning — `graph_table` option:** CREATE GRAPH with `graph_table` materializes a copy of the graph data. On large graphs (>1K elements), this adds significant overhead. Omit `graph_table` unless you specifically need `GRAPH_TABLE()` SQL aggregation on that graph. **When to include it:** use `graph_table` when the workflow requires wrapping Cypher in `GRAPH_TABLE()` for GROUP BY / aggregation, or when you need a relational view of graph data for debugging.

### Step 3: Write the Cypher Query

#### Basic Pattern

```sql
-- Inline WHERE filters at each hop (preferred — reduces path explosion on large graphs)
GRAPH "graph_name"
MATCH (n1:Label1 WHERE n1.property = 'value')-[e1:EDGE_TYPE]->(n2:Label2)
RETURN n1.node AS source, e1.LABEL AS relationship, n2.node AS target
```

#### With Variable-Length Paths

```sql
GRAPH "graph_name"
MATCH (a:Label1 WHERE a.node = 'start')-[e:EDGE_TYPE]->{1,4}(b:Label2)
RETURN DISTINCT a.node AS source, b.node AS target
```

#### GRAPH_TABLE() — Required for Aggregation

Bare Cypher cannot use GROUP BY. Wrap in `GRAPH_TABLE()`:

```sql
SELECT source_col, COUNT(*) AS cnt, SUM(amount) AS total
FROM GRAPH_TABLE(
    GRAPH "graph_name"
    MATCH (a:Label1)-[e:EDGE_TYPE]->(b:Label2)
    RETURN a.node AS source_col, b.amount AS amount
)
GROUP BY 1 ORDER BY 3 DESC
```

#### SOLVE_GRAPH() — SQL Table Function

```sql
-- Shortest path between two nodes (with edge path and solution table)
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'SHORTEST_PATH',
        SOURCE_NODES => INPUT_TABLE((SELECT 'nodeA' AS NODE)),
        DESTINATION_NODES => INPUT_TABLE((SELECT 'nodeB' AS NODE)),
        SOLUTION_TABLE => 'shortest_path_result',
        OPTIONS => KV_PAIRS(output_edge_path = 'true'))
)
```

> **Other solvers** (PAGE_RANK, CENTRALITY, CLOSENESS, MULTIPLE_ROUTING, ALLPATHS, INVERSE_SHORTEST_PATH, BACKHAUL_ROUTING): See `references/graph-functions.md` §SOLVE_GRAPH Examples for syntax per solver type. Solvers like SHORTEST_PATH and MULTIPLE_ROUTING require weighted edges — see the weighted graph creation example in that section.

For CLI equivalents, use `graph solve <name> --solver-type <TYPE>`. Results go to a solution table — see [Output Interpretation](#output-interpretation) for column details.

#### Cypher Rules (Must-Follow)

1. **Always prefix with `GRAPH "name"`** — omitting this causes parse errors. For schema-qualified graphs, quote each part separately: `GRAPH "schema"."graph_name"`, never `GRAPH "schema.graph_name"`
2. **WHERE filters can only reference columns from the original table definitions** — you cannot filter on columns that weren't in the CREATE GRAPH source tables
3. **Return aliases must be unique** — use `a.node AS source, b.node AS target`, never duplicate names
4. **Arrow direction matters** — use `<-[]-` to flip traversal; for bidirectional on directed graphs, add hint: `/* KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (force_undirected, true) */`
5. **GRAPH_TABLE() required for GROUP BY** — bare Cypher returns flat rows only
6. **CONTAINS syntax**: `CONTAINS('search_term', column_name) = 1` — note the argument order
7. **Filter during traversal, not after** — Apply WHERE clauses inline at each hop `(n:Label WHERE n.attr = 'val')` rather than in a post-MATCH WHERE block. On large graphs, post-match filtering generates an explosion of intermediate paths only to prune them afterward. Inline filters constrain path generation early and dramatically reduce work. **Variable-length paths** (`-[e]->{1,N}`) amplify this: keep the max hop count low (start with `{1,3}`) and always combine with inline label/attribute filters to bound the search space.
8. **Same entity at both endpoints** — When the same node appears at both ends of a multi-hop pattern, use separate variables with individual WHERE filters: `(a:user WHERE a.NODE = 'tan')...(e:user WHERE e.NODE = 'tan')`. Do NOT reuse the same variable; each position in the MATCH path needs its own variable.

#### Common Mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missing `GRAPH "name"` prefix | Parse error | Always start query with `GRAPH "name"` |
| Filtering on column not in source table | Column not found | Run `describe-table` on source table first |
| Duplicate return aliases | Ambiguous column error | Give every RETURN expression a unique alias |
| Wrong arrow on directed graph | Empty results | Flip arrow `<-[]-` or add `force_undirected` hint |
| GROUP BY without GRAPH_TABLE() | Syntax error | Wrap: `SELECT ... FROM GRAPH_TABLE(GRAPH ... MATCH ... RETURN ...) GROUP BY ...` |
| `-[e]-` on directed graph | Fewer results than expected | Undirected edges need `force_undirected` hint |
| Post-MATCH `WHERE` on large graph | Slow query / timeout | Move filters inline: `(n:Label WHERE n.attr = 'val')` to prune paths early |
| Wide variable-length range `{1,30}` without filters | Timeout / out of memory | Start with `{1,3}`; add inline WHERE and label filters to bound expansion |
| Same variable at both ends of path | Parse error or wrong results | Use separate variables with WHERE: `(a WHERE a.node='X')...(e WHERE e.node='X')` |
| Schema-qualified graph in single quotes: `GRAPH "schema.name"` | Graph not found | Quote each part: `GRAPH "schema"."graph_name"` |

> **Performance tiers:** Graphs < 10K edges handle most Cypher patterns well. At 10K–100K edges, always use inline WHERE filters and limit variable-length paths to `{1,3}`. Above 100K edges, prefer SOLVE_GRAPH over multi-hop Cypher, and use `graph_table` only if GRAPH_TABLE() aggregation is required.

### Step 4: Understand Edge Semantics

**Undirected graphs still have semantic direction.** An undirected graph (`directed: false`) does NOT mean relationships are directionless. Edge labels encode semantic direction — in a graph with `liked` and `posted` edges, `(user)-[liked]-(post)-[posted]-(user)` constrains traversal by label. Do not fall back to SQL simply because a graph is undirected.

**Anti-pattern — SQL tunnel vision:** If you start with `show-tables` and `describe-table`, you may get locked into SQL mode and miss that a graph already models the relationships. When the user's question involves relationships, run `graph show` first.

For complete Cypher syntax, CREATE GRAPH DDL, SOLVE_GRAPH, and MATCH_GRAPH reference:
see [references/graph-functions.md](references/graph-functions.md) and [references/graph-examples.md](references/graph-examples.md).

### Step 5: MATCH_GRAPH / graph match

Two execution paths — **CLI** supports 4 methods, **SQL** supports all 6:

| Method | CLI `graph match` | SQL `EXECUTE FUNCTION MATCH_GRAPH(...)` |
|--------|:-:|:-:|
| `markov_chain` (GPS snap-to-road) | Yes | Yes |
| `match_od_pairs` | Yes | Yes |
| `match_supply_demand` | Yes | Yes |
| `match_batch_solves` | Yes | Yes |
| `match_isochrone` | — | Yes |
| `match_charging_stations` | — | Yes |

> **When to suggest MATCH_GRAPH:** User asks about supply-demand optimization, logistics routing, fleet/vehicle routing, EV charging station planning, isochrone/reachability analysis, or GPS snap-to-road.

**CLI example** — GPS snap-to-road via `graph match`:
```bash
<cli> graph match road_network --sample-points "gps_data.x AS SAMPLE_X, gps_data.y AS SAMPLE_Y" --solve-method markov_chain --solution-table snapped_roads
```

**SQL example** — supply-demand (also works for methods above):

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'my_graph',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 5 AS SUPPLY_NODE, 50 AS SUPPLY_ID, 10 AS SUPPLY_SIZE, 'LAND' AS SUPPLY_EDGELABEL, 1 AS SUPPLY_REGION_ID),
        (SELECT 7 AS DEMAND_NODE, 70 AS DEMAND_ID, 16 AS DEMAND_SIZE, 1 AS DEMAND_REGION_ID)
    ),
    SOLVE_METHOD => 'match_supply_demand', SOLUTION_TABLE => 'my_solution',
    OPTIONS => KV_PAIRS(aggregated_output = 'true')
)
```

> **Other solve methods** (GPS snap-to-road via `markov_chain`, reachability via `match_isochrone`, EV routing via `match_charging_stations`): See `references/graph-functions.md` §MATCH_GRAPH Solve Method Examples for SQL syntax per method.
> After `match_isochrone`, visualize with `viz isochrone` — see [Step 7](#step-7-visualize-graph-results).

Full grammar for all solve methods: `references/graph-functions.md` §MATCH_GRAPH.

### Step 6: Troubleshoot Graph Issues

If a graph operation returns unexpected results, check in order:

1. **Empty Cypher results** → Verify arrow direction (`->` vs `<-`); confirm `directed` flag via `graph show`; try `force_undirected` hint; check label spelling with `SELECT DISTINCT LABEL FROM <source_table>`
2. **"Column not found"** → Cypher WHERE can only reference columns in CREATE GRAPH source tables. Run `describe-table <source_table>`
3. **GRAPH_TABLE duplicates** → Add `DISTINCT` in the inner RETURN clause
4. **CREATE GRAPH type mismatch** → All NODE/NODE1/NODE2 columns must share the same data type across tables
5. **Timeout on solve/Cypher** → Reduce hop range; add inline WHERE filters; increase `KINETICA_DB_SKILL_TIMEOUT`

For error messages not covered here, see the [Error Handling](#error-handling) table.

### Step 7: Visualize Graph Results

After solving or querying a graph, visualize the results:

| Visualization | Command | Prerequisite |
|---------------|---------|-------------|
| Isochrone contours | `viz isochrone <graph> --source <node_id> --max-radius <cost> --output iso.png` | Graph must have weighted edges; `--max-radius` uses same units as edge weights |
| Solution nodes on map | `viz heatmap <solution_table> --x-col <lon> --y-col <lat> --output route.png` | Solution table must have separate lon/lat columns (not WKT geometry) |
| Class-break on graph attributes | `viz classbreak --config '{"LAYERS":"<graph_table>", ...}' --output map.png` | Graph created with `graph_table` option |

> **WKTROUTE visualization:** SOLVE_GRAPH with `output_edge_path = 'true'` produces a `WKTROUTE` linestring column — not separate lon/lat columns. To visualize it, use `viz wms` with the solution table as the layer (WMS renders geometry columns natively), or extract coordinates first with `SELECT ST_XCOORD(ST_POINTN(WKTROUTE, n)) AS lon, ST_YCOORD(ST_POINTN(WKTROUTE, n)) AS lat` and feed the extracted points to `viz heatmap`.

> **Isochrone workflow:** Run `match_isochrone` (Step 5) to compute reachability, then `viz isochrone` to render contour bands. The `--source` is a graph node ID, `--max-radius` is the cost threshold in edge-weight units, and `--num-levels` controls contour bands (default: 4). Ensure the graph has `WEIGHT_VALUESPECIFIED` edges for meaningful cost contours.

## Output Interpretation

CLI commands output JSON to stdout. Present results to the user as:

1. **Query results** → Format `records` array as a markdown table
2. **Table listings** → Format as a bulleted list or table with name + size
3. **Describe table** → Show columns table (name, type, properties)
4. **Errors** → Show the error message and suggest fixes
5. **Graph show** → Format `graphs` array as a table with name, directed, num_nodes, num_edges
6. **Graph solve** → Show `solver_type` and `solution_table`; inform user they can query the solution table for full results (e.g., `query "SELECT * FROM <solution_table>"`)

   **Solver result columns** (query the solution table with `SELECT *` to see full output):
   | Solver Type | Key Columns |
   |-------------|-------------|
   | `SHORTEST_PATH` | `SOLVERS_NODE_ID`, `SOLVERS_EDGE_ID`, `SOLVERS_EDGE_COSTS`, `WKTROUTE` (if `output_edge_path = 'true'`) |
   | `INVERSE_SHORTEST_PATH` | `SOLVERS_NODE_ID`, `SOLVERS_EDGE_ID`, `SOLVERS_EDGE_COSTS` (paths from destination back to sources) |
   | `PAGE_RANK` | `SOLVERS_NODE_ID`, `SOLVERS_NODE_COSTS` (rank score) |
   | `PROBABILITY_RANK` | `SOLVERS_NODE_ID`, `SOLVERS_NODE_COSTS` (transition probability score) |
   | `CENTRALITY` | `SOLVERS_NODE_ID`, `SOLVERS_NODE_COSTS` (betweenness score) |
   | `CLOSENESS` | `SOLVERS_NODE_ID`, `SOLVERS_NODE_COSTS` (closeness centrality score) |
   | `ALLPATHS` | `SOLVERS_NODE_ID`, `SOLVERS_EDGE_ID`, `SOLVERS_PATH_ID`, `SOLVERS_RING_ID` |
   | `MULTIPLE_ROUTING` | `SOLVERS_NODE_ID`, `SOLVERS_EDGE_ID`, `SOLVERS_EDGE_COSTS`, `SOLVERS_ROUTE_ID` |
   | `TSP` | `SOLVERS_NODE_ID`, `SOLVERS_EDGE_ID`, `SOLVERS_EDGE_COSTS`, `SOLVERS_ROUTE_ID` (round-trip min cost) |
   | `BACKHAUL_ROUTING` | `SOLVERS_NODE_ID`, `SOLVERS_EDGE_ID`, `SOLVERS_EDGE_COSTS`, `SOLVERS_ROUTE_ID` (remote→backbone paths) |

7. **Graph query (adjacency)** → Show `adjacency_table` and `rings`; inform user they can query the adjacency table for neighbor details
8. **Graph match** → Show `solve_method` and `solution_table`; inform user they can query the solution table for match results

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
| `graph_table overhead` / slow CREATE GRAPH | `graph_table` on large graph | Omit `graph_table` unless GRAPH_TABLE() SQL is needed |
| `Timeout` on graph solve/Cypher | Large graph or unfiltered traversal | Increase `KINETICA_DB_SKILL_TIMEOUT`; add inline WHERE filters to prune paths early |
| `No edges found` / empty Cypher result | Wrong arrow direction or label | Check `directed` flag via `graph show`; flip arrow or add `force_undirected` |
| `Graph already exists` | Duplicate graph name without `OR REPLACE` | Add `OR REPLACE` to CREATE GRAPH, or drop the graph first |
| `Data type mismatch` on CREATE GRAPH | NODE columns differ across node/edge tables | Ensure all NODE/NODE1/NODE2 columns share the same data type |
| `Missing INPUT_TABLES` parse error | Bare SELECT in NODES/EDGES clause | Wrap each SELECT in `INPUT_TABLES((...))` |
| `Invalid label format` | Plain string for multi-label column | Use `VARCHAR[]` with `string_to_array()` or `ARRAY[...]` |
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
**Prefer Cypher over SQL for relationship queries** — see [Graph Operations Workflow](#graph-operations-workflow).
See [references/graph-functions.md](references/graph-functions.md) and [references/graph-examples.md](references/graph-examples.md).

### UDFs, Procedures & ML
User-Defined Functions (Python), scheduled SQL procedures, built-in ML (PREDICT, OUTLIERS),
and Docker model management.
See [references/udf-reference.md](references/udf-reference.md).

### Security & Administration
Users, roles, GRANT/REVOKE, row/column security, resource groups, and tier management.
See [references/security-reference.md](references/security-reference.md).

### Schema Introspection & Virtual Catalogs
For "what tables exist", "show columns / PK / FK", "who has access", "why did Z run slow",
"which MV depends on what", tier/RAM/disk usage, or load-history error audits — query the
virtual catalogs instead of describe-table loops or GRANT inspection commands. Both catalogs
auto-filter by caller permissions.
- `information_schema.*` — portable, standards-compliant (`TABLES`, `COLUMNS`, `SCHEMATA`,
  `KEY_COLUMN_USAGE`, `OBJECT_PRIVILEGES`). See [references/virtual-catalog-ansi.md](references/virtual-catalog-ansi.md).
- `ki_catalog.*` — Kinetica-specific depth (`ki_tiered_objects` via `outer_object`, `ki_depend`,
  `ki_query_span_metrics_all`, `ki_rag_embeddings`, single-letter enum decoders). See
  [references/virtual-catalog-kinetica.md](references/virtual-catalog-kinetica.md).

### WMS / Visualization
Heatmap, raster, class-break, contour, label, and isochrone rendering via the `/wms` endpoint.
See [references/wms-reference.md](references/wms-reference.md).

## Query Writing Guidelines

0. **Graph check first** — If the question involves relationships (mutual, paths, connections, influence), run `graph show` before writing SQL. If a relevant graph exists with typed edge labels, use Cypher — see [Graph Operations Workflow](#graph-operations-workflow)
1. Always run `describe-table` before writing SQL — check column names (case-sensitive) and types
2. **Array columns** (type `array<...>`) cannot appear in ORDER BY, sort-by, or `get-records --sort-by` — use a non-array column or index into the array: `ORDER BY "col"[1]`
3. Quote schema-qualified table names: `"schema"."table"`
4. Use LIMIT for exploration queries
5. Use CTEs instead of nested subqueries with aggregates
6. For date math, always use DATEDIFF/DATEADD — never subtract timestamps directly
7. When in doubt, consult the relevant reference file for the domain
