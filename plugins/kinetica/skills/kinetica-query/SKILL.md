---
name: kinetica-query
description: >-
  Activate when the user is writing analytical SQL queries for Kinetica, asking about
  Kinetica-specific functions, or working with geospatial, time-series, graph, or vector
  data — even if they just mention a GPU-accelerated database without naming Kinetica.
  Covers SQL dialect differences from PostgreSQL, query patterns, and domain-specific functions.
license: Apache-2.0
metadata:
  author: kinetica
  version: "1.0.34"
---

# Kinetica SQL Dialect

Kinetica is a GPU-accelerated database with a PostgreSQL-compatible SQL dialect.
It handles billions of rows, vector search, geospatial, time-series, and graph analytics.

## Kinetica REST API Access (curl)

When you need to call Kinetica's REST API directly via `curl` (e.g., the user requests raw
REST calls, or neither Node.js nor Python SDK is available), **you MUST read
[references/curl-api-reference.md](references/curl-api-reference.md) first** — it covers
authentication (.env loading), required flags, common endpoints, response parsing with jq,
and critical gotchas (always POST, never use `-u`, `data_str` double-encoding).

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

0. **Graph check first** — If the question involves relationships (mutual, paths, connections, influence), run `graph show` before writing SQL. Use Cypher directly with edge/node labels — don't explore source tables first
1. Always run `describe-table` before writing SQL — check column names (case-sensitive) and types
2. **Array columns** (type `array<...>`) cannot appear in ORDER BY, sort-by, or `get-records --sort-by` — use a non-array column or index into the array: `ORDER BY "col"[1]`
3. Quote schema-qualified table names: `"schema"."table"`
4. Use LIMIT for exploration queries
5. Use CTEs instead of nested subqueries with aggregates
6. For date math, always use DATEDIFF/DATEADD — never subtract timestamps directly
7. When in doubt, consult the relevant reference file for the domain
