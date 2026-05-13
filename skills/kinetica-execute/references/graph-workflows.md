# Graph Operations Workflow

End-to-end procedural guide for Kinetica graph operations: from discovering existing graphs through writing Cypher, choosing solvers, troubleshooting, and visualizing results. Use alongside `graph-functions.md` (grammar/syntax) and `graph-examples.md` (domain-specific patterns).

> **Before writing CREATE GRAPH DDL, complex Cypher, SOLVE_GRAPH, or MATCH_GRAPH:** read `graph-functions.md` for grammar/syntax and `graph-examples.md` for domain-specific patterns. The inline examples here are sufficient for simple Cypher on existing graphs.

## Step 1: Check for Existing Graphs

Before writing any query involving relationships, run `graph show` first — not `show-tables`:

```bash
<cli> graph show                                    # list all graphs
<cli> graph show <graph_name>                       # shows source tables, directed flag, edge/node counts
<cli> describe-table <source_table_from_graph_show> # inspect actual column names — do NOT assume _nodes/_edges naming
<cli> query "SELECT DISTINCT LABEL FROM <source_table_from_graph_show> LIMIT 20"
```

> **Incremental updates:** To add nodes, edges, or restrictions to an existing graph without recreating it, use `ALTER GRAPH`. See `graph-functions.md` §ALTER GRAPH.

> **Graph lifecycle:**
> - **Persist:** Add `save_persist = 'true'` in CREATE GRAPH OPTIONS to survive server restarts.
> - **Live sync:** Add `add_table_monitor = 'true'` so the graph auto-updates when source tables change (inserts/updates/deletes).
> - **Recreate:** Use `CREATE OR REPLACE ... GRAPH` or `recreate = 'true'` to overwrite an existing graph.
> - **Delete:** `graph delete <name>` removes a graph. Add `--delete-persist` to also remove persisted data. This does NOT delete the source tables.

## Step 2: Choose Execution Method

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

**Prerequisites**: Cypher and SOLVE_GRAPH require a pre-created graph. If no graph exists, either create one first (see `graph-functions.md` §Creating Graphs) or use SQL JOINs.

> **Performance warning — `graph_table` option:** CREATE GRAPH with `graph_table` materializes a copy of the graph data. On large graphs (>1K elements), this adds significant overhead. Omit `graph_table` unless you specifically need `GRAPH_TABLE()` SQL aggregation on that graph. **When to include it:** use `graph_table` when the workflow requires wrapping Cypher in `GRAPH_TABLE()` for GROUP BY / aggregation, or when you need a relational view of graph data for debugging.

## Step 3: Write the Cypher Query

### Basic Pattern

```sql
-- Inline WHERE filters at each hop (preferred — reduces path explosion on large graphs)
GRAPH "graph_name"
MATCH (n1:Label1 WHERE n1.property = 'value')-[e1:EDGE_TYPE]->(n2:Label2)
RETURN n1.node AS source, e1.LABEL AS relationship, n2.node AS target
```

### With Variable-Length Paths

```sql
GRAPH "graph_name"
MATCH (a:Label1 WHERE a.node = 'start')-[e:EDGE_TYPE]->{1,4}(b:Label2)
RETURN DISTINCT a.node AS source, b.node AS target
```

### GRAPH_TABLE() — Required for Aggregation

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

### SOLVE_GRAPH() — SQL Table Function

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

> **Other solvers** (PAGE_RANK, CENTRALITY, CLOSENESS, MULTIPLE_ROUTING, ALLPATHS, INVERSE_SHORTEST_PATH, BACKHAUL_ROUTING): See `graph-functions.md` §SOLVE_GRAPH Examples for syntax per solver type. Solvers like SHORTEST_PATH and MULTIPLE_ROUTING require weighted edges — see the weighted graph creation example in that section.

For CLI equivalents, use `graph solve <name> --solver-type <TYPE>`. Results go to a solution table — see the "Output Interpretation" section of SKILL.md for column details.

### Cypher Rules (Must-Follow)

1. **Always prefix with `GRAPH "name"`** — omitting this causes parse errors. For schema-qualified graphs, quote each part separately: `GRAPH "schema"."graph_name"`, never `GRAPH "schema.graph_name"`
2. **WHERE filters can only reference columns from the original table definitions** — you cannot filter on columns that weren't in the CREATE GRAPH source tables
3. **Return aliases must be unique** — use `a.node AS source, b.node AS target`, never duplicate names
4. **Arrow direction matters** — use `<-[]-` to flip traversal; for bidirectional on directed graphs, add hint: `/* KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (force_undirected, true) */`
5. **GRAPH_TABLE() required for GROUP BY** — bare Cypher returns flat rows only
6. **CONTAINS syntax**: `CONTAINS('search_term', column_name) = 1` — note the argument order
7. **Filter during traversal, not after** — Apply WHERE clauses inline at each hop `(n:Label WHERE n.attr = 'val')` rather than in a post-MATCH WHERE block. On large graphs, post-match filtering generates an explosion of intermediate paths only to prune them afterward. Inline filters constrain path generation early and dramatically reduce work. **Variable-length paths** (`-[e]->{1,N}`) amplify this: keep the max hop count low (start with `{1,3}`) and always combine with inline label/attribute filters to bound the search space.
8. **Same entity at both endpoints** — When the same node appears at both ends of a multi-hop pattern, use separate variables with individual WHERE filters: `(a:user WHERE a.NODE = 'tan')...(e:user WHERE e.NODE = 'tan')`. Do NOT reuse the same variable; each position in the MATCH path needs its own variable.

### Common Mistakes

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

## Step 4: Understand Edge Semantics

**Undirected graphs still have semantic direction.** An undirected graph (`directed: false`) does NOT mean relationships are directionless. Edge labels encode semantic direction — in a graph with `liked` and `posted` edges, `(user)-[liked]-(post)-[posted]-(user)` constrains traversal by label. Do not fall back to SQL simply because a graph is undirected.

**Anti-pattern — SQL tunnel vision:** If you start with `show-tables` and `describe-table`, you may get locked into SQL mode and miss that a graph already models the relationships. When the user's question involves relationships, run `graph show` first.

For complete Cypher syntax, CREATE GRAPH DDL, SOLVE_GRAPH, and MATCH_GRAPH reference: see `graph-functions.md` and `graph-examples.md`.

## Step 5: MATCH_GRAPH / graph match

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

> **Other solve methods** (GPS snap-to-road via `markov_chain`, reachability via `match_isochrone`, EV routing via `match_charging_stations`): See `graph-functions.md` §MATCH_GRAPH Solve Method Examples for SQL syntax per method.
> After `match_isochrone`, visualize with `viz isochrone` — see [Step 7](#step-7-visualize-graph-results).

Full grammar for all solve methods: `graph-functions.md` §MATCH_GRAPH.

## Step 6: Troubleshoot Graph Issues

If a graph operation returns unexpected results, check in order:

1. **Empty Cypher results** → Verify arrow direction (`->` vs `<-`); confirm `directed` flag via `graph show`; try `force_undirected` hint; check label spelling with `SELECT DISTINCT LABEL FROM <source_table>`
2. **"Column not found"** → Cypher WHERE can only reference columns in CREATE GRAPH source tables. Run `describe-table <source_table>`
3. **GRAPH_TABLE duplicates** → Add `DISTINCT` in the inner RETURN clause
4. **CREATE GRAPH type mismatch** → All NODE/NODE1/NODE2 columns must share the same data type across tables
5. **Timeout on solve/Cypher** → Reduce hop range; add inline WHERE filters; increase `KINETICA_DB_SKILL_TIMEOUT`

For error messages not covered here, see the generic error lookup in `error-handling.md`.

## Step 7: Visualize Graph Results

After solving or querying a graph, visualize the results:

| Visualization | Command | Prerequisite |
|---------------|---------|-------------|
| Isochrone contours | `viz isochrone <graph> --source <node_id> --max-radius <cost> --output iso.png` | Graph must have weighted edges; `--max-radius` uses same units as edge weights |
| Solution nodes on map | `viz heatmap <solution_table> --x-col <lon> --y-col <lat> --output route.png` | Solution table must have separate lon/lat columns (not WKT geometry) |
| Class-break on graph attributes | `viz classbreak --config '{"LAYERS":"<graph_table>", ...}' --output map.png` | Graph created with `graph_table` option |

> **WKTROUTE visualization:** SOLVE_GRAPH with `output_edge_path = 'true'` produces a `WKTROUTE` linestring column — not separate lon/lat columns. To visualize it, use `viz wms` with the solution table as the layer (WMS renders geometry columns natively), or extract coordinates first with `SELECT ST_XCOORD(ST_POINTN(WKTROUTE, n)) AS lon, ST_YCOORD(ST_POINTN(WKTROUTE, n)) AS lat` and feed the extracted points to `viz heatmap`.

> **Isochrone workflow:** Run `match_isochrone` (Step 5) to compute reachability, then `viz isochrone` to render contour bands. The `--source` is a graph node ID, `--max-radius` is the cost threshold in edge-weight units, and `--num-levels` controls contour bands (default: 4). Ensure the graph has `WEIGHT_VALUESPECIFIED` edges for meaningful cost contours.
