---
name: kinetica-admin
description: "Kinetica database administration knowledge. Activate when the user is monitoring cluster health, diagnosing performance issues, managing resource groups, or optimizing Kinetica deployments."
---

# Kinetica Database Administration

Kinetica is a GPU-accelerated database. This skill teaches you to monitor, diagnose,
and optimize Kinetica clusters using system tables, EXPLAIN plans, resource groups,
and tier management.

**Critical**: Kinetica SQL has important deviations from standard PostgreSQL.
Read [references/kinetica-core-rules.md](references/kinetica-core-rules.md) before writing any query.

## SQL Knowledge

This skill includes core Kinetica SQL knowledge for administrative queries.

- See [references/kinetica-core-rules.md](references/kinetica-core-rules.md) — **read this first**
- See [references/sql-functions.md](references/sql-functions.md) for supported functions

## System Tables

Kinetica exposes system state through the `ki_catalog` schema. Key tables:

### Cluster Health

```sql
-- Check cluster status
SELECT * FROM ki_catalog.ki_cluster_status;

-- Node health and resource usage
SELECT node_id, status, ram_used_bytes, ram_total_bytes,
       gpu_used_bytes, gpu_total_bytes
FROM ki_catalog.ki_nodes;

-- Active queries
SELECT query_id, username, status, start_time, sql_text
FROM ki_catalog.ki_active_queries
ORDER BY start_time DESC;
```

### Table Information

```sql
-- Table sizes and row counts
SELECT schema_name, table_name, row_count,
       compressed_bytes, uncompressed_bytes
FROM ki_catalog.ki_tables
ORDER BY compressed_bytes DESC;

-- Column details
SELECT schema_name, table_name, column_name, column_type,
       is_nullable, is_primary_key
FROM ki_catalog.ki_columns
WHERE schema_name = 'my_schema'
  AND table_name = 'my_table';

-- Table partitions
SELECT * FROM ki_catalog.ki_partitions
WHERE schema_name = 'my_schema';
```

### Query History

```sql
-- Recent slow queries (> 5 seconds)
SELECT query_id, username, sql_text, start_time, end_time,
       DATEDIFF(MILLISECOND, start_time, end_time) AS duration_ms
FROM ki_catalog.ki_query_history
WHERE DATEDIFF(MILLISECOND, start_time, end_time) > 5000
ORDER BY start_time DESC
LIMIT 50;
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

## Resource Groups

Resource groups control query resource allocation:

```sql
-- View existing resource groups
SELECT * FROM ki_catalog.ki_resource_groups;

-- Create a resource group
CREATE RESOURCE GROUP analytics_team
    WITH MAX_CPU_CONCURRENCY = 4,
         MAX_DATA = '50GB',
         MAX_SCHEDULING_PRIORITY = 5;

-- Assign a user to a resource group
ALTER USER analyst_user SET RESOURCE GROUP analytics_team;

-- Modify a resource group
ALTER RESOURCE GROUP analytics_team
    SET MAX_CPU_CONCURRENCY = 8;
```

## Tier Management

Kinetica uses a tiered storage model (GPU RAM, host RAM, disk):

```sql
-- View tier configuration
SELECT * FROM ki_catalog.ki_tiers;

-- Check table tier placement
SELECT schema_name, table_name, tier_name, tier_bytes
FROM ki_catalog.ki_table_tiers
WHERE schema_name = 'my_schema';

-- Move a table to a specific tier
ALTER TABLE my_schema.my_table
    SET TIER STRATEGY (
        ( ( VRAM 1, RAM 1, PERSIST 1 ) )
    );
```

## User and Security Management

```sql
-- List users
SELECT * FROM ki_catalog.ki_users;

-- List roles
SELECT * FROM ki_catalog.ki_roles;

-- Grant permissions
GRANT SELECT ON my_schema.my_table TO analyst_role;
GRANT ALL ON SCHEMA my_schema TO admin_role;

-- Create a user
CREATE USER new_analyst IDENTIFIED BY 'secure_password';
GRANT analyst_role TO new_analyst;
```

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
