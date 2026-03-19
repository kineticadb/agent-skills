---
name: kinetica-admin
description: >-
  Activate when the user is monitoring Kinetica cluster health, diagnosing query performance,
  managing resource groups, configuring tiered storage, or optimizing Kinetica deployments.
  Also activate for EXPLAIN plans, system table queries, security configuration, or access
  control in Kinetica.
license: Apache-2.0
metadata:
  author: kinetica
  version: "1.0.36"
---

# Kinetica Database Administration

Kinetica is a GPU-accelerated database. This skill teaches you to monitor, diagnose,
and optimize Kinetica clusters using system tables, EXPLAIN plans, resource groups,
and tier management.

## Kinetica REST API Access (curl)

When you need to call Kinetica's REST API directly via `curl` (e.g., the user requests raw
REST calls, or neither Node.js nor Python SDK is available), **you MUST read
[references/curl-api-reference.md](references/curl-api-reference.md) first** — it covers
authentication (.env loading), required flags, common endpoints, response parsing with jq,
and critical gotchas (always POST, never use `-u`, `data_str` double-encoding).

**Critical**: Kinetica SQL has important deviations from standard PostgreSQL.
Read [references/kinetica-core-rules.md](references/kinetica-core-rules.md) before writing any query.

## SQL Knowledge

This skill includes core Kinetica SQL knowledge for administrative queries.

- See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) — **read this first**
- See [references/sql-functions.md](references/sql-functions.md) for supported functions
- See [references/ddl-reference.md](references/ddl-reference.md) for DDL (credentials, data sources, sinks, backup/restore, streams)
- See [references/dml-reference.md](references/dml-reference.md) for DML (LOAD DATA, EXPORT, upsert)
- See [references/security-reference.md](references/security-reference.md) for users, roles, grants, row/column security, resource groups
- See [references/udf-reference.md](references/udf-reference.md) for UDFs, procedures, ML models

## System Tables (ki_catalog)

Kinetica exposes system state through the `ki_catalog` schema (security-filtered per user).
See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) for the full table list.

Key tables: `ki_objects` (tables/views), `ki_columns`, `ki_indexes`, `ki_partitions`,
`ki_obj_stat` (row/byte counts), `ki_tiered_objects`, `ki_query_active_all` (running queries),
`ki_query_history`, `ki_users_and_roles`, `ki_role_members`, `ki_object_permissions`,
`ki_datasources`, `ki_datasinks`, `ki_load_history`, `ki_backup_history`.

```sql
-- Active queries
SELECT * FROM "ki_catalog"."ki_query_active_all"
ORDER BY "start_time" DESC
LIMIT 20

-- Slow queries (last 24h)
SELECT * FROM "ki_catalog"."ki_query_history"
WHERE DATEDIFF('MILLISECOND', "start_time", "end_time") > 5000
  AND "start_time" >= DATEADD('HOUR', -24, NOW())
ORDER BY "start_time" DESC
LIMIT 50
```

## EXPLAIN Plans

Use `EXPLAIN` to understand query execution:

```sql
-- Basic explain
EXPLAIN SELECT * FROM my_table WHERE region = 'US';

-- Verbose explain with costs
EXPLAIN VERBOSE SELECT t1.id, t2.name
FROM table1 t1
INNER JOIN table2 t2 ON t1.id = t2.id
WHERE t1.status = 'active';
```

Key things to look for:
- **Full table scans** on large tables — add filters or use sharding
- **Sort operations** — check if an index or pre-sorted data can help
- **Join strategies** — hash joins vs. nested loop joins
- **GPU vs CPU execution** — GPU-accelerated operations are marked

## Security, Resource Groups & Tier Management

Full syntax for users, roles, GRANT/REVOKE (including row-level and column-level security),
resource groups, and tier management is in [references/security-reference.md](references/security-reference.md).

DDL for credentials, data sources, data sinks, backup/restore, and streams is in
[references/ddl-reference.md](references/ddl-reference.md).

## Common Diagnostic Patterns

### Identify Bottlenecks

```sql
-- Top tables by size
SELECT schema_name, table_name, row_count,
       ROUND(compressed_bytes / 1073741824.0, 2) AS size_gb
FROM ki_catalog.ki_tables
ORDER BY compressed_bytes DESC
LIMIT 20;

-- Queries consuming the most time (last 24 hours)
SELECT username, COUNT(*) AS query_count,
       AVG(DATEDIFF(MILLISECOND, start_time, end_time)) AS avg_ms,
       MAX(DATEDIFF(MILLISECOND, start_time, end_time)) AS max_ms
FROM ki_catalog.ki_query_history
WHERE start_time > DATEADD(HOUR, -24, NOW())
GROUP BY username
ORDER BY avg_ms DESC;
```

### Kill a Long-Running Query

```sql
-- Find the query
SELECT query_id, username, sql_text,
       DATEDIFF(SECOND, start_time, NOW()) AS running_seconds
FROM ki_catalog.ki_active_queries
ORDER BY running_seconds DESC;

-- Kill it
KILL QUERY 'query_id_here';
```

## Administration Guidelines

1. Check cluster health before making changes — verify all nodes are online
2. Use EXPLAIN before running expensive queries on production
3. Monitor query history for slow query patterns, not just individual queries
4. Use resource groups to prevent runaway queries from starving other users
5. Remember Kinetica SQL rules — especially DATEDIFF/DATEADD for all date math
6. Always qualify table names with schema: `"schema"."table"`
