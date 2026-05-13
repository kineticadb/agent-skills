# `ki_catalog` Cross-Table Correlation Paths

When investigating a Kinetica system, the evidence you need is usually spread
across several `ki_catalog` tables. These are the canonical join paths —
reach for them before composing ad-hoc joins. For the per-table schema reference
(columns, enums, single-table gotchas) see
[virtual-catalog-kinetica.md](virtual-catalog-kinetica.md).

## Object Metadata Chain

Walk this chain to go from an object name to its on-disk footprint and schema:

```
ki_objects.oid
  → ki_obj_stat.oid        (row counts, total bytes)
  → ki_partitions.oid      (tier placement, compression)
  → ki_columns.table_oid   (column schema)
```

Pattern:

```sql
SELECT o.schema_name || '.' || o.object_name AS object_name,
       s.row_count,
       s.total_bytes,
       p.tier,
       c.column_name
FROM ki_catalog.ki_objects o
LEFT JOIN ki_catalog.ki_obj_stat   s ON s.oid       = o.oid
LEFT JOIN ki_catalog.ki_partitions p ON p.oid       = o.oid
LEFT JOIN ki_catalog.ki_columns    c ON c.table_oid = o.oid
WHERE o.schema_name = '<schema>' AND o.object_name = '<table>'
```

## Column Type Resolution

`ki_columns.column_type_oid` is a numeric OID, not a type name. Join it to
`ki_datatypes.oid` to get a human-readable type:

```sql
SELECT c.column_name,
       dt.sql_typename AS data_type,
       c.is_nullable,
       c.is_primary_key,
       c.is_shard_key,
       c.is_dict_encoded
FROM ki_catalog.ki_columns   c
JOIN ki_catalog.ki_datatypes dt ON dt.oid = c.column_type_oid
WHERE c.table_name = '<table>'
ORDER BY c.oid
```

Common type OIDs (for sanity-checking results without the `ki_datatypes` join):

| OID  | `sql_typename` |
|------|----------------|
| 20   | `long`         |
| 25   | `string`       |
| 1043 | `char256`      |
| 1114 | `datetime`     |
| 2950 | `uuid`         |

When in doubt, keep the join — the table is authoritative across versions.

## Query Drill-Down (Slow Query → Span Tree)

To reconstruct a slow query's execution as a span tree:

```
ki_query_history.query_id
  → ki_query_span_metrics_all.query_id   (per-operator metrics)
       → walk span_id / parent_span_id   (tree structure)
```

```sql
SELECT span_id, parent_span_id, operator, source_rank,
       DATEDIFF(MILLISECOND, start_time, stop_time) AS elapsed_ms
FROM ki_catalog.ki_query_span_metrics_all
WHERE query_id = '<query_id_from_ki_query_history>'
ORDER BY source_rank, start_time
```

Pick `query_id` first from `ki_query_history` (filtered by `user_name`,
`start_time`, or `execution_status`), then drill into spans for the operator
that dominates elapsed time.

## Active-Query Workers (Currently-Running Queries)

For queries that are still running:

```
ki_query_active_all.job_id
  → ki_query_workers.job_id   (per-worker task status, elapsed time)
```

```sql
SELECT a.user_name, a.endpoint, a.query_text,
       w.worker_id, w.type, w.status, w.elapsed_time_ms
FROM ki_catalog.ki_query_active_all a
JOIN ki_catalog.ki_query_workers   w ON w.job_id = a.job_id
WHERE w.status IN ('running', 'paused')
ORDER BY w.elapsed_time_ms DESC
```

## Permission Audit (Who Can Touch What)

```
ki_object_permissions.role_oid   → ki_users_and_roles.oid
ki_object_permissions.object_oid → ki_objects.oid
```

```sql
SELECT u.name AS role_or_user,
       o.schema_name || '.' || o.object_name AS object_name,
       p.permission_type,
       p.with_grant_option,
       p.rls,
       p.cls
FROM ki_catalog.ki_object_permissions p
JOIN ki_catalog.ki_users_and_roles    u ON u.oid = p.role_oid
JOIN ki_catalog.ki_objects            o ON o.oid = p.object_oid
WHERE o.schema_name = '<schema>'
ORDER BY o.object_name, u.name, p.permission_type
```

For row-/column-level security restrictions specifically, the canonical
single-table query lives in
[virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) ("Roles with
Row / Column Security Restrictions").

## Dependency Graph (Impact Analysis Before DROP / ALTER)

```
ki_depend.src_obj_oid → ki_objects.oid   (parent — the object that is referenced)
ki_depend.dep_obj_oid → ki_objects.oid   (child  — the object that references it)
```

For materialized views, `ki_depend.mv_oid` points to the MV's `ki_objects.oid`.
Use this before proposing a `DROP` or `ALTER COLUMN` — both cascade and can
silently drop dependent views, MVs, and SQL procedures.

For a worked example (parent + child names with their object kinds), see the
"Specific MV Dependencies" and "All MV Dependencies" queries in
[virtual-catalog-kinetica.md](virtual-catalog-kinetica.md).

## Quick Reference — Join Keys at a Glance

| From → To                                       | Join key on the left side    | Join key on the right side |
|-------------------------------------------------|------------------------------|----------------------------|
| `ki_objects` → `ki_obj_stat`                    | `oid`                        | `oid`                      |
| `ki_objects` → `ki_partitions`                  | `oid`                        | `oid`                      |
| `ki_objects` → `ki_columns`                     | `oid`                        | `table_oid`                |
| `ki_columns` → `ki_datatypes`                   | `column_type_oid`            | `oid`                      |
| `ki_query_history` → `ki_query_span_metrics_all`| `query_id`                   | `query_id`                 |
| `ki_query_active_all` → `ki_query_workers`      | `job_id`                     | `job_id`                   |
| `ki_object_permissions` → `ki_users_and_roles`  | `role_oid`                   | `oid`                      |
| `ki_object_permissions` → `ki_objects`          | `object_oid`                 | `oid`                      |
| `ki_depend` → `ki_objects` (parent)             | `src_obj_oid`                | `oid`                      |
| `ki_depend` → `ki_objects` (child)              | `dep_obj_oid`                | `oid`                      |

## See Also

- [virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) — per-table schema,
  enum decoders, gotchas, and canonical end-to-end query recipes
- [virtual-catalog-ansi.md](virtual-catalog-ansi.md) — portable
  `information_schema` views layered over the same catalog
- [version-quirks.md](version-quirks.md) — `ki_columns` correct column names
  (`column_type_oid`, `is_dict_encoded`, `bytes_on_disk_*`) and tables that
  don't exist in 7.2.x
