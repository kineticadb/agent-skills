---
name: kinetica-query
description: "Kinetica SQL query knowledge. Activate when the user is writing analytical queries for Kinetica, asking about Kinetica-specific functions, or working with geospatial, time-series, graph, or vector data."
---

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
