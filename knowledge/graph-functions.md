# Kinetica Graph Functions Reference

Kinetica builds property graphs from existing relational tables using SQL-based
annotation and queries them with PGQL-compliant Cypher. Graphs are created from
your data — no separate graph database needed.

**Best practice**: Define DDL table schemas first, then create the graph, then query with Cypher.

## Graph Components

Graphs have three building blocks, defined via SQL column annotation:

| Component | Grammar Identifiers | Description |
|-----------|-------------------|-------------|
| **Nodes** | `NODE`, `LABEL` | Vertices with an identifier and classification |
| **Edges** | `NODE1`, `NODE2`, `LABEL` | Relationships between two nodes |
| **Weights** | `WEIGHT_VALUESPECIFIED` | Edge costs for solver algorithms |
| **Restrictions** | `RESTRICTIONS_VALUECOMPARED` | Constraints on traversal |

### Grammar Aliases

Use generic aliases so the engine auto-maps columns without explicit `AS`:

**Node tables:**
| Generic Alias | Technical Identifier | Description |
|---------------|---------------------|-------------|
| `NODE` | `NODE_ID` / `NODE_NAME` | Primary identifier (int, long, string, or WKT) |
| `LABEL` | `NODE_LABEL` | Classification string or `VARCHAR[]` for multi-label |
| `LABEL_KEY` | `NODE_LABEL_KEY` | Category grouping for labels |

**Edge tables:**
| Generic Alias | Technical Identifier | Description |
|---------------|---------------------|-------------|
| `NODE1` | `EDGE_NODE1_NAME` | Source node of relationship |
| `NODE2` | `EDGE_NODE2_NAME` | Target node of relationship |
| `LABEL` | `EDGE_LABEL` | Relationship type |
| `EDGE_NODE1_LABEL` | — | Source node label (for bipartite graphs) |
| `EDGE_NODE2_LABEL` | — | Target node label (for bipartite graphs) |

**CRITICAL**: `LABEL` is context-aware — in a Node section it maps to `NODE_LABEL`, in an Edge section it maps to `EDGE_LABEL`.

Use `/show/graph/grammar` endpoint to view all valid identifier combinations — it returns a JSON document listing identifiers and valid combinations per component (nodes, edges, weights, restrictions).

## Table Design for Graphs

Use column names matching the grammar to enable auto-annotation (`SELECT *`):

```sql
-- Node table — grammar-matching column names
CREATE OR REPLACE TABLE wiki_graph_nodes (
    node  CHAR(64) NOT NULL,
    label VARCHAR[] NOT NULL,
    -- Non-graph columns (available in Cypher WHERE clauses)
    age INT
);

-- Edge table — grammar-matching column names
CREATE OR REPLACE TABLE wiki_graph_edges (
    node1  CHAR(64) NOT NULL,
    node2  CHAR(64) NOT NULL,
    label  VARCHAR[] NOT NULL,
    -- Non-graph columns
    met_time DATE
);
```

### Inserting Multi-Label Data

Use `string_to_array()` for `VARCHAR[]` label columns:

```sql
INSERT INTO wiki_graph_nodes(node, label, age) VALUES
('Jane', string_to_array('FEMALE,business', ','), 29);

INSERT INTO wiki_graph_edges(node1, node2, label, met_time) VALUES
('Jane', 'Bill',  string_to_array('Friend', ','), '1997-09-15');
```

You can also use `ARRAY[...]` literal syntax:

```sql
INSERT INTO news_nodes (node, label) VALUES
('US Supreme Court', ARRAY['Organization', 'Judicial']),
('Chicago', ARRAY['Location']);
```

## Creating Graphs

### With Auto-Annotation (grammar-matching columns)

When table columns match grammar names, use `SELECT *` directly:

```sql
CREATE OR REPLACE DIRECTED GRAPH wiki_graph (
    NODES => INPUT_TABLES(
        -- Label groupings for concise ontology
        (SELECT 'Gender' AS LABEL_KEY, string_to_array('MALE,FEMALE', ',') AS LABEL),
        (SELECT 'Interest' AS LABEL_KEY, string_to_array('golf,business,dance,chess', ',') AS LABEL),
        -- Primary data — auto-annotated via column names
        (SELECT * FROM wiki_graph_nodes)
    ),
    EDGES => INPUT_TABLES(
        (SELECT 'Relations' AS LABEL_KEY, string_to_array('Family,Friend', ',') AS LABEL),
        (SELECT * FROM wiki_graph_edges)
    ),
    OPTIONS => KV_PAIRS(graph_table = 'wiki_graph_table')
)
```

### With Explicit Annotation (non-standard column names)

When columns don't match grammar, use `AS` to map them:

```sql
CREATE GRAPH "my_graph"
(
    NODES => INPUT_TABLES(
        (SELECT "person_id" AS "NODE", "gender" AS "LABEL" FROM "schema"."persons")
    ),
    EDGES => INPUT_TABLES(
        (SELECT "person_a" AS "NODE1", "person_b" AS "NODE2", "relationship" AS "LABEL"
         FROM "schema"."relationships")
    ),
    OPTIONS => KV_PAIRS(
        'graph_table' = 'schema.my_graph_table',
        'directed' = 'true',
        'is_partitioned' = 'false'
    )
)
```

### Column Annotation Rules
- **`INPUT_TABLES()`** is a SQL macro that accepts multiple `SELECT` statements — they are merged into a single component definition
- **`KV_PAIRS()`** is the options macro for key-value configuration (e.g., `KV_PAIRS('directed' = 'true', graph_table = 'my_table')`)
- Use the `AS` keyword to annotate columns with grammar identifiers (e.g., `SELECT person AS NODE`)
- If column names already match grammar identifiers, use `SELECT *` — no `AS` needed
- Node identifier data types must match across all tables in the same component (int, long, string/varchar, or WKT)
- Edge `NODE1` and `NODE2` must have the same data type as the `NODE` columns they reference
- `LABEL` can be a single string (`CHAR`/`VARCHAR`) or an array (`VARCHAR[]`) for multi-label
- Non-graph columns from source tables are accessible in Cypher WHERE clauses via OLAP joins at any hop level
- Graph schema columns across different tables must have identical identifier combinations and matching data types

### Label Key Grouping

Group labels into categories to simplify the ontology visualization:

```sql
NODES => INPUT_TABLES(
    (SELECT 'Gender' AS "LABEL_KEY", string_to_array('MALE,FEMALE', ',') AS "LABEL"),
    (SELECT 'Interest' AS "LABEL_KEY", string_to_array('golf,business,dance,chess', ',') AS "LABEL"),
    (SELECT * FROM wiki_graph_nodes)
)
```

Disable label key compression with:
```sql
ALTER GRAPH wiki_graph MODIFY (
    OPTIONS => KV_PAIRS(schema_node_labelkeys = 'false', schema_edge_labelkeys = 'false')
)
```

### Create Graph Options

| Option | Description |
|--------|-------------|
| `graph_table` | Creates relational tables mirroring the graph (for debugging/visualization). **Avoid for graphs > 1K elements** — overhead is high. |
| `directed` | If `true` (default), edges are directional |
| `is_partitioned` | Whether graph is partitioned across ranks |
| `recreate` | If `true`, deletes and recreates if graph already exists |
| `save_persist` | If `true`, saves graph to persist directory (survives restart) |
| `add_table_monitor` | If `true`, graph updates dynamically on inserts to source tables |
| `merge_tolerance` | Min separation between unique geospatial nodes (default `1.0E-5`) |
| `label_delimiter` | Delimiter for label strings (default: `:`) |

## ALTER GRAPH

Modify existing graphs without recreation:

```sql
-- Add new edges
ALTER GRAPH "wiki_graph" MODIFY (
    EDGES => INPUT_TABLES(
        (SELECT 'Tom' AS node1, 'Jane' AS node2, 'Family' AS label)
    ),
    OPTIONS => KV_PAIRS(graph_table = 'wiki_graph_modified')
)

-- Add restrictions (remove edges from traversal)
ALTER GRAPH "wiki_graph" MODIFY (
    RESTRICTIONS => INPUT_TABLES(
        (SELECT 'Bill' AS node1, 'Alex' AS node2)
    )
)
```

`MODIFY` supports the same components as `CREATE GRAPH`: nodes, edges, weights, restrictions, options.

## Cypher Query Syntax

```sql
GRAPH "graph_name"
MATCH (n1:LABEL1)-[e1:REL_TYPE]->(n2:LABEL2)
WHERE n1.property = 'value'
RETURN n1.node AS n1_name, e1.LABEL AS relationship, n2.node AS n2_name
```

### Cypher Query Rules
- Kinetica uses **PGQL-compliant Cypher** — node variables inherit grammar annotations from the `CREATE GRAPH` statement
- Cypher variables can be typed by node/edge labels defined in the graph (e.g., `(a:MALE)` filters by the MALE label)
- Non-graph attribute columns from source tables are available in `WHERE` clauses **at any hop level**
- **CRITICAL**: `WHERE` filters must reference columns that were defined as attributes during graph creation — you cannot filter on columns not in the original tables
- **CRITICAL**: Return aliases must be unique — use `a.node AS originator`, not duplicate column names
- When the graph's direction opposes your query traversal, flip the arrow: `()<-[]-()`
- **CRITICAL**: MATCH requires a **single continuous path expression** — chain all nodes and edges into one linear pattern instead of splitting into separate comma-delimited patterns: `MATCH (a)-[e1]->(b)-[e2]->(c)` not `MATCH (a)-[e1]->(b), (b)-[e2]->(c)`
- **CRITICAL**: When the same entity appears at both ends of a multi-hop path, use **separate variables** with WHERE clauses — do NOT reuse the same variable: `(a WHERE a.node = 'X')...(b WHERE b.node = 'X')` not `(a WHERE a.node = 'X')...(a)`
- **Filter during traversal, not after** — apply `WHERE` inline at each hop `(n:Label WHERE n.attr = 'val')` rather than in a post-MATCH WHERE block. On large graphs, post-match filtering causes an explosion of intermediate paths. Inline filters constrain path generation early
- **Variable-length paths** (`-[e]->{1,N}`) amplify path explosion: keep the max hop count low (start with `{1,3}`) and always combine with inline label/attribute filters

### Pattern Elements
| Syntax | Meaning |
|--------|---------|
| `(n)` | Any node |
| `(n:MALE)` | Node with label MALE |
| `(n:MALE WHERE n.age < 40)` | Node with label and attribute filter |
| `->` | Directed edge (outgoing) |
| `<-` | Directed edge (incoming) |
| `-[e]-` | Undirected edge (requires `force_undirected` on directed graphs) |
| `-[e:KNOWS]->` | Edge with label KNOWS |
| `-[e]->{1,4}(n)` | Variable-length path (1 to 4 hops) |
| `-[e WHERE e.met_time > '2000-01-01']->` | Edge with attribute filter |

### Query Hints

Add as SQL comments anywhere in the query:

| Hint | Syntax | Description |
|------|--------|-------------|
| Force undirected | `/* KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (force_undirected, true) */` | Treat directed graph as undirected |
| Multi-paths | `/* KI_HINT_QUERY_GRAPH_ENDPOINT_OPTIONS (multi_paths, true) */` | Return all paths (not just unique) |
| Merge inputs | `/* KI_HINT_MERGE_GRAPH_INPUTS */` | Merge graph input tables |

### GRAPH_TABLE() Wrapper for OLAP Aggregation

Wrap Cypher results in `GRAPH_TABLE()` to use standard SQL aggregation:

```sql
SELECT person, bank, COUNT(DISTINCT device_id) AS devices,
       MAX(risk_score) AS max_risk, ROUND(SUM(amount), 2) AS total
FROM GRAPH_TABLE(
    GRAPH "expero"."banking_graph"
    MATCH (a:bank)-[ab:performed]->(b:wire_message WHERE b.wire_message_risk_score > 20)
          -[bc:is_for_transaction]->(c:banking_transaction)
          -[d:involved]->(e:internal_account)<-[f:manages]-(g:party)<-[h]-(i)-[]->(j)
    RETURN g.party_name AS person, a.bank_name AS bank,
           g.party_risk_score AS risk_score,
           c.banking_transaction_amount AS amount, j.NODE AS device_id
)
GROUP BY 1, 2 ORDER BY 4 DESC
```

This is the primary pattern for analytics on graph traversal results.

### Text and Attribute Filtering in Cypher

```sql
-- LIKE filtering on node attributes
GRAPH "expero"."banking_graph"
MATCH (a:bank WHERE LOWER(a.bank_name) LIKE '%ernser%')
      -[ab:performed]->(b:wire_message)-[bc:is_for_transaction]->(c:banking_transaction)
RETURN a.bank_name AS bank, c.banking_transaction_amount

-- CONTAINS on graph node text
GRAPH bluesky
MATCH (a:user WHERE a.NODE = 'tan')-[ab:liked]-(b:post)
      -[bc:posted]-(c:user)-[cd:liked]-
      (d:post WHERE CONTAINS('distributed', d.user_text) = 1)
      -[de:posted]-(e:user WHERE e.NODE = 'tan')
RETURN DISTINCT c.NODE AS poster, d.user_text AS original
```

## SOLVE_GRAPH() — SQL Table Function

Run graph algorithms directly in SQL:

```sql
-- Find all paths between two nodes
SELECT * FROM TABLE(
    SOLVE_GRAPH(
        GRAPH => 'news_graph',
        SOLVER_TYPE => 'ALLPATHS',
        SOURCE_NODES => INPUT_TABLE((SELECT 'JB Pritzker' AS node)),
        DESTINATION_NODES => INPUT_TABLE((SELECT 'National Guard' AS node)),
        OPTIONS => KV_PAIRS(uniform_weights = '1')
    )
)
```

### Solver Types

| Solver Type | Description | Requires Weights |
|-------------|-------------|:---:|
| `SHORTEST_PATH` | Optimal path via Dijkstra. Supports upstream, batch, many-to-many, single source routing, and A* heuristics with min/max cost filters | Yes |
| `PAGE_RANK` | Google's PageRank — probability of each node being visited based on graph topology | No |
| `PROBABILITY_RANK` | Transitional probability (Hidden Markov) for each node based on edge weights as probabilities | Yes |
| `CENTRALITY` | Betweenness centrality — measures how many shortest paths pass through a node | No |
| `CLOSENESS` | Closeness centrality — sum of inverse shortest path costs from a node to all others | No |
| `MULTIPLE_ROUTING` | Traveling Salesman Problem (round-trip min cost visiting all waypoints) | Yes |
| `INVERSE_SHORTEST_PATH` | Finds optimal path cost for each destination to route back to source (service man routing / downstream) | Yes |
| `BACKHAUL_ROUTING` | Connects remote asset nodes to fixed backbone nodes — optimizes return logistics | Yes |
| `ALLPATHS` | Finds all reasonable (probable) paths between source-destination pairs within cost radius bounds | Optional |
| `STATS_ALL` | Graph statistics: diameter, longest pairs, vertex valences, topology numbers, avg/max cluster sizes, weakly connected components (`STATS_CLUSTERS`), zero-degree nodes | No |

### SOLVE_GRAPH Examples

```sql
-- Shortest path between two nodes
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'SHORTEST_PATH',
        SOURCE_NODES => INPUT_TABLE((SELECT 'nodeA' AS NODE)),
        DESTINATION_NODES => INPUT_TABLE((SELECT 'nodeB' AS NODE)),
        SOLUTION_TABLE => 'shortest_path_result',
        OPTIONS => KV_PAIRS(output_edge_path = 'true'))
)

-- PageRank — no source/destination needed (operates on full graph)
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'PAGE_RANK',
        SOURCE_NODES => INPUT_TABLE((SELECT '' AS NODE)))
)

-- Betweenness centrality
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'CENTRALITY',
        SOURCE_NODES => INPUT_TABLE((SELECT '' AS NODE)))
)

-- Closeness centrality
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'CLOSENESS',
        SOURCE_NODES => INPUT_TABLE((SELECT '' AS NODE)))
)

-- TSP (round-trip minimum cost visiting all waypoints)
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'road_network', SOLVER_TYPE => 'MULTIPLE_ROUTING',
        SOURCE_NODES => INPUT_TABLE((SELECT 'depot' AS NODE)),
        DESTINATION_NODES => INPUT_TABLE(
            (SELECT 'stop_A' AS NODE UNION ALL SELECT 'stop_B' AS NODE UNION ALL SELECT 'stop_C' AS NODE)))
)

-- All paths between two nodes (use uniform_weights for unweighted graphs)
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'ALLPATHS',
        SOURCE_NODES => INPUT_TABLE((SELECT 'nodeA' AS NODE)),
        DESTINATION_NODES => INPUT_TABLE((SELECT 'nodeB' AS NODE)),
        OPTIONS => KV_PAIRS(uniform_weights = 'true'))
)

-- Inverse shortest path — find nodes within cost threshold from a target
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'road_network', SOLVER_TYPE => 'INVERSE_SHORTEST_PATH',
        SOURCE_NODES => INPUT_TABLE((SELECT 'warehouse' AS NODE)),
        OPTIONS => KV_PAIRS(max_solution_radius = '500'))
)

-- Backhaul routing — return trip with pickups
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'road_network', SOLVER_TYPE => 'BACKHAUL_ROUTING',
        SOURCE_NODES => INPUT_TABLE((SELECT 'depot' AS NODE)),
        DESTINATION_NODES => INPUT_TABLE(
            (SELECT 'delivery_A' AS NODE UNION ALL SELECT 'pickup_B' AS NODE)),
        SOLUTION_TABLE => 'backhaul_result')
)

-- Probability rank — transition probabilities from a source node
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'PROBABILITY_RANK',
        SOURCE_NODES => INPUT_TABLE((SELECT 'nodeA' AS NODE)),
        OPTIONS => KV_PAIRS(max_solution_radius = '5'))
)

-- Stats all — comprehensive graph statistics and cluster detection
SELECT * FROM TABLE(
    SOLVE_GRAPH(GRAPH => 'my_graph', SOLVER_TYPE => 'STATS_ALL',
        SOURCE_NODES => INPUT_TABLE((SELECT '' AS NODE)),
        OPTIONS => KV_PAIRS(output_clusters = 'true'))
)
```

> **Weighted graphs for solvers:** Solvers like SHORTEST_PATH and MULTIPLE_ROUTING require weighted edges. Use `WEIGHT_VALUESPECIFIED` in CREATE GRAPH to assign edge costs:

```sql
CREATE OR REPLACE DIRECTED GRAPH road_network (
    NODES => INPUT_TABLES(
        (SELECT location_id AS NODE, type AS LABEL FROM locations)
    ),
    EDGES => INPUT_TABLES(
        (SELECT origin AS NODE1, destination AS NODE2, mode AS LABEL,
         cost AS WEIGHT_VALUESPECIFIED FROM routes)
    ),
    OPTIONS => KV_PAIRS(save_persist = 'true')
)
```

## MATCH_GRAPH() — Supply-Demand Optimization

Multi-step minimum-cost demand-supply optimization (MSDO) via mixed-integer linear programming:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'rearm',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 5 AS SUPPLY_NODE, 50 AS SUPPLY_ID, 10 AS SUPPLY_SIZE,
         'LAND' AS SUPPLY_EDGELABEL, 1 AS SUPPLY_REGION_ID,
         string_to_array('pharmacy,food', ',') AS SUPPLY_SPECS),
        (SELECT 7 AS DEMAND_NODE, 70 AS DEMAND_ID, 16 AS DEMAND_SIZE,
         1 AS DEMAND_REGION_ID,
         string_to_array('fragile,food', ',') AS DEMAND_SPECS)
    ),
    SOLVE_METHOD => 'match_supply_demand',
    SOLUTION_TABLE => 'rearm_msdo',
    OPTIONS => KV_PAIRS(
        aggregated_output = 'true',
        partial_loading = 'true',
        max_supply_combinations = '10000',
        multi_step = 'true'
    )
)
```

### Match/Solve Methods

| Method | Description |
|--------|-------------|
| `markov_chain` | GPS snap-to-road using Hidden Markov Model (HMM) with adaptive kernel. **Patented.** |
| `match_od_pairs` | Finds probable paths between origin-destination pairs under cost constraints |
| `match_batch_solves` | Batch shortest path solves for large numbers of source-destination pairs |
| `match_supply_demand` | Multi-step minimum-cost demand-supply optimization (MSDO) via MIP. **Patented.** Supports multi-modal transport, spec matching, partial loading |
| `match_loops` | Finds closed Eulerian loops per graph node with unlimited hops. **Patented.** Good for money laundering ring detection |
| `match_charging_stations` | Optimal path across EV charging stations with range constraints |
| `match_isochrone` | Reachability limits (isochrone contours) from source nodes within cost thresholds |
| `match_similarity` | Computes Jaccard similarity scores between vertex pairs and n-level intersections within m hops |
| `match_pickup_dropoff` | Optimal scheduling for pick-up and drop-off operations (Uber-like) |
| `match_clusters` | Optimal clustering using Louvain modularity. Also supports Recursive Spectral Bisection (RSB) |
| `match_pattern` | Finds topological patterns in the graph |
| `match_embedding` | Creates vector node embeddings for graph ML |
| `match_route_detour` | Computes detour costs for nearby stations at a mark point along each source-target route |

> **Important**: Always `DROP TABLE IF EXISTS <solution_table>` before re-running MATCH_GRAPH — it does not auto-replace existing solution tables.

### MSDO Key Concepts
- **Multi-step**: Works backward from final demand (sink) to find first accommodating supply (source); previous supplies become demand for next optimization run
- **Multi-modal**: Edge labels (AIR, SEA, LAND) constrain which transports use which routes
- **Specification matching**: `SUPPLY_SPECS` must satisfy `DEMAND_SPECS` (e.g., fragile goods need fragile-capable transport)
- **Supply penalty**: `SUPPLY_PENALTY` increases effective cost, steering solver to other suppliers
- **Supply order**: `SUPPLY_ORDER` reduces combinatorial explosion; alternatively enable `permute_supplies`

### MSDO Supply/Demand Grammar

| Field | Description |
|-------|-------------|
| `SUPPLY_NODE` | Node ID or WKT point for supply location |
| `SUPPLY_ID` | Unique supply/vehicle identifier |
| `SUPPLY_SIZE` | Capacity of this supply unit |
| `SUPPLY_EDGELABEL` | Edge label this transport moves on (multi-modality) |
| `SUPPLY_REGION_ID` | Region grouping for supplies |
| `SUPPLY_ORDER` | Priority ordering (reduces combinations) |
| `SUPPLY_MAIN` | Set to 1 for hub supplies |
| `SUPPLY_PENALTY` | Cost penalty (steers solver away) |
| `SUPPLY_SPECS` | `VARCHAR[]` specifications this transport can carry |
| `DEMAND_NODE` | Node ID or WKT point for demand location |
| `DEMAND_ID` | Unique demand identifier |
| `DEMAND_SIZE` | Required quantity |
| `DEMAND_REGION_ID` | Region grouping for demands |
| `DEMAND_SPECS` | `VARCHAR[]` specifications required |

### MATCH_GRAPH Solve Method Examples

**GPS snap-to-road** (`markov_chain`) — snaps raw GPS coordinates to the nearest graph edges using a Hidden Markov Model:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'road_network',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT ST_GEOMFROMTEXT('POINT(-122.4194 37.7749)') AS SAMPLE_NODE),
        (SELECT ST_GEOMFROMTEXT('POINT(-122.4089 37.7837)') AS SAMPLE_NODE)
    ),
    SOLVE_METHOD => 'markov_chain', SOLUTION_TABLE => 'snapped_points',
    OPTIONS => KV_PAIRS(gps_noise = '25')
)
```

**Isochrone / reachability** (`match_isochrone`) — computes reachable area from a source node within a cost threshold:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'road_network',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 42 AS SAMPLE_NODE)
    ),
    SOLVE_METHOD => 'match_isochrone', SOLUTION_TABLE => 'iso_result',
    OPTIONS => KV_PAIRS(max_solution_radius = '300', num_levels = '4')
)
```

> After `match_isochrone`, visualize with `viz isochrone`.

**EV charging station routing** (`match_charging_stations`) — finds optimal paths via charging stations with range constraints:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'road_network',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 1 AS SAMPLE_NODE, 0 AS SAMPLE_ORDER),
        (SELECT 99 AS SAMPLE_NODE, 1 AS SAMPLE_ORDER)
    ),
    SOLVE_METHOD => 'match_charging_stations', SOLUTION_TABLE => 'ev_route',
    OPTIONS => KV_PAIRS(max_charge_range = '150', penalty_per_stop = '10')
)
```

**Origin-destination pair routing** (`match_od_pairs`) — routes multiple origin-destination pairs in a single call using WKT points:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'road_network',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT ST_GEOMFROMTEXT('POINT(-73.9857 40.7484)') AS SAMPLE_NODE,
         0 AS SAMPLE_ORIGIN, 0 AS SAMPLE_DESTINATION_ID),
        (SELECT ST_GEOMFROMTEXT('POINT(-73.9681 40.7614)') AS SAMPLE_NODE,
         1 AS SAMPLE_ORIGIN, 0 AS SAMPLE_DESTINATION_ID),
        (SELECT ST_GEOMFROMTEXT('POINT(-73.9712 40.7831)') AS SAMPLE_NODE,
         0 AS SAMPLE_ORIGIN, 1 AS SAMPLE_DESTINATION_ID),
        (SELECT ST_GEOMFROMTEXT('POINT(-73.9550 40.7700)') AS SAMPLE_NODE,
         1 AS SAMPLE_ORIGIN, 1 AS SAMPLE_DESTINATION_ID)
    ),
    SOLVE_METHOD => 'match_od_pairs', SOLUTION_TABLE => 'od_result',
    OPTIONS => KV_PAIRS(output_edge_path = 'true')
)
```

**Batch shortest path** (`match_batch_solves`) — processes multiple OD shortest-path requests in a single batch call:

```sql
DROP TABLE IF EXISTS batch_result;
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'road_network',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 1 AS OD_ID,
                ST_GEOMFROMTEXT('POINT(-89.155 42.212)') AS ORIGIN_WKTPOINT,
                ST_GEOMFROMTEXT('POINT(-82.539 42.890)') AS DESTINATION_WKTPOINT)
    ),
    SOLVE_METHOD => 'match_batch_solves', SOLUTION_TABLE => 'batch_result'
)
```

> **Key identifiers for `match_batch_solves`**: Use `OD_ID` (not `ID`), `ORIGIN_WKTPOINT` (not `SOURCE_WKTPOINT`), `DESTINATION_WKTPOINT`. WKT points must use `ST_GEOMFROMTEXT()`. Solution table columns: `INDEX`, `SOURCE`, `TARGET`, `COST`, `PATH` (LINESTRING).

**Community detection** (`match_clusters`) — identifies communities via Louvain modularity optimization:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'social_graph',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT '' AS SAMPLE_NODE)
    ),
    SOLVE_METHOD => 'match_clusters', SOLUTION_TABLE => 'cluster_result',
    OPTIONS => KV_PAIRS(num_clusters = '5')
)
```

**Loop detection** (`match_loops`) — finds Eulerian closed loops (cycles) in a graph:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'delivery_graph',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 'depot' AS SAMPLE_NODE)
    ),
    SOLVE_METHOD => 'match_loops', SOLUTION_TABLE => 'loop_result',
    OPTIONS => KV_PAIRS(max_solution_radius = '100')
)
```

**Vertex similarity** (`match_similarity`) — computes Jaccard similarity scores between vertex neighborhoods:

```sql
EXECUTE FUNCTION MATCH_GRAPH(
    GRAPH => 'social_graph',
    SAMPLE_POINTS => INPUT_TABLES(
        (SELECT 'userA' AS SAMPLE_NODE),
        (SELECT 'userB' AS SAMPLE_NODE)
    ),
    SOLVE_METHOD => 'match_similarity', SOLUTION_TABLE => 'similarity_result'
)
```

## Graph REST API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/create/graph` | Create new graph from tables |
| `/query/graph` | Topological queries (adjacent nodes/edges, rings/hops) |
| `/solve/graph` | Run algorithms (shortest path, page rank, TSP, centrality) |
| `/match/graph` | Snap-to-road, supply-demand optimization, isochrones |
| `/show/graph` | Retrieve graph metadata and creation request |
| `/show/graph/grammar` | View valid identifier combinations for graph components |

### /query/graph Options
| Option | Description |
|--------|-------------|
| `rings` | Number of hops to traverse (default 1). `0` returns nodes matching criteria |
| `force_undirected` | Return both inbound and outbound edges on directed graphs |
| `limit` | Max number of query results |
| `find_common_labels` | Lists common labels between source and target nodes |

## Tips

- Graph data lives in your existing tables — no ETL needed
- Use grammar-matching column names (`node`, `label`, `node1`, `node2`) to avoid explicit `AS` annotation
- Use `string_to_array('MALE,FEMALE', ',')` for multi-label `VARCHAR[]` columns
- Use `LABEL_KEY` grouping to keep the ontology manageable
- Variable path hops `{min,max}` are powerful for "friends of friends" queries
- Wrap Cypher in `GRAPH_TABLE()` for SQL aggregation on traversal results
- All filtered attributes must exist in the original table definitions
- Avoid `graph_table` option for graphs > 1K elements (high overhead)
- Return aliases must be unique in Cypher queries
- When the user asks about relationships, use Cypher directly with edge/node labels — don't explore source tables with `describe-table` first (this leads to SQL tunnel vision)
- Use `DESCRIBE GRAPH *` SQL to list graphs rather than CLI `graph show`
- Kinetica does not support `LIST()` or `GROUP_CONCAT()` — keep `GRAPH_TABLE()` queries simple with standard aggregates (COUNT, SUM, AVG, MAX, MIN)
