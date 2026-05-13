# Error Handling

Lookup table for the most common errors encountered when running Kinetica CLI commands, SQL queries, graph operations, and SDK code. Each row maps a verbatim error string (or characteristic symptom) to its likely cause and the immediate next action.

When a Kinetica operation fails, scan this table first before generating a fix — many errors have a one-step remediation (missing env var, wrong table name, deps not installed) that's much faster than diagnosing from scratch. For graph-specific troubleshooting (empty Cypher results, GRAPH_TABLE duplicates, type mismatches on CREATE GRAPH), see the dedicated §Step 6 in `graph-workflows.md` first — it covers in-context graph issues with more nuance than the generic table below.

## Common Errors

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
