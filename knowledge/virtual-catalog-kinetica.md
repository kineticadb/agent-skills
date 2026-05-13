# Kinetica Virtual Catalog Reference

Metadata surface for database objects, relationships, permissions, and runtime
state. Lives in the `ki_catalog` schema. Tables are maintained by the engine —
they auto-update as the database changes. **All results are auto-filtered by the
caller's permissions** (admins see everything, regular users see only what
they can access), so queries are safe to run without further authorization
logic.

Use `ki_catalog.*` when you need Kinetica-specific introspection (tier
placement, SQL-GPT contexts, RAG embeddings, query span metrics, role
membership, load history). For portable / ANSI-standard introspection, prefer
[virtual-catalog-ansi.md](virtual-catalog-ansi.md).

## Quick Reference — All Tables

Tables are organized here by purpose. Every table lives under `ki_catalog`
(e.g. `ki_catalog.ki_objects`).

### Objects & Structure

| Table | Shows | Key columns |
|-------|-------|-------------|
| `ki_schemas` | Schemas | `oid`, `schema_name`, `created_by`, `creation_time`, `last_alter_time` |
| `ki_objects` | Tables, views, procedures | `oid`, `object_name`, `schema_oid`, `obj_kind`, `shard_kind`, `persistence`, `column_count`, `creation_time` |
| `ki_columns` | Column definitions & stats | `oid`, `table_oid`, `table_name`, `column_name`, `column_type_oid`, `is_nullable`, `is_shard_key`, `is_primary_key`, `is_dist_encoded` |
| `ki_datatypes` | Supported types | `oid`, `name`, `size`, `is_varying`, `pg_typename`, `sql_typename` |
| `ki_indexes` | Table indexes | `oid`, `object_name`, `schema_name`, `index_type`, `index_columns` |
| `ki_partitions` | Partition statistics | `oid`, `object_name`, `partition_type`, `partition_id`, `num_rows`, `tier` |
| `ki_fk_constraints` | PK + FK constraints | `schema_oid`, `table_oid`, `constraint_name`, `fk_column_name`, `pk_column_name`, `is_enforced` |
| `ki_obj_stat` | Row & byte counts | `oid`, `schema_name`, `object_name`, `row_count`, `bytes_per_row`, `total_bytes` |
| `ki_tiered_objects` | Tier placement & size per rank | `size`, `id`, `tier`, `evictable`, `locked`, `pin_count`, `ram_evictions`, `owner_resource_group`, `source_rank` |
| `ki_depend` | Object dependencies | `src_obj_oid`, `src_obj_kind`, `dep_obj_oid`, `dep_obj_kind`, `mv_oid` |
| `ki_periodic_objects` | MVs & procedures with refresh schedules | `oid`, `object_name`, `last_refresh_time`, `next_refresh_time`, `refresh_stop_time` |

### Users, Roles & Permissions

| Table | Shows | Key columns |
|-------|-------|-------------|
| `ki_users_and_roles` | Users & roles | `oid`, `name`, `can_login`, `is_external`, `is_superuser`, `can_create_role`, `can_create_schema`, `resource_group` |
| `ki_role_members` | Role membership | `role_oid`, `role_name`, `member_oid`, `member_name`, `admin_option` |
| `ki_object_permissions` | Permission grants | `role_oid`, `role_name`, `permission_type`, `object_type`, `object_oid`, `object_name`, `with_grant_option`, `rls`, `cls` |

### Functions & SQL-GPT

| Table | Shows | Key columns |
|-------|-------|-------------|
| `ki_functions` | Scalar / aggregate / window / UDF / procedure | `oid`, `schema_oid`, `name`, `kind`, `nargs`, `return_type_oid`, `arg_type_oid` |
| `ki_contexts` | SQL-GPT context definitions | `oid`, `context_name`, `object_name`, `object_rules`, `object_samples`, `is_temp_context`, `ttl` |
| `ki_rag_embeddings` | Context embeddings for SQL-GPT | `obj_id`, `context_name`, `obj_type`, `embed_text`, `n_tokens`, `embedding` (`VECTOR(2048)`), `embed_model` |

### Data Movement & External

| Table | Shows | Key columns |
|-------|-------|-------------|
| `ki_datasources` | Configured data sources | `datasource_oid`, `datasource_schema`, `datasource_name`, `datasource_kind` |
| `ki_datasinks` | Configured data sinks | `datasink_oid`, `datasink_schema`, `datasink_name`, `datasink_kind` |
| `ki_datasource_subscriptions` | Live source subscriptions | `datasource_oid`, `table_oid`, `status`, `jobid`, `info` (JSON) |
| `ki_ingest_file_info` | Import/export file records | `file_oid`, `jobid`, `file_short_name`, `file_full_name`, `start_time` |
| `ki_load_history` | Load / export / subscription events | `table_oid`, `datasource_oid`, `user_name`, `jobid`, `load_kind`, `rows_processed`, `rows_inserted`, `event_message`, `num_errors` |
| `ki_backup_history` | Backup & restore events | `query_id`, `backup_name`, `operation`, `status`, `num_records`, `start_time`, `end_time` |
| `ki_streams` | Table monitors (streams) | `stream_oid`, `stream_name`, `source_table_oid`, `status`, `event_type`, `datasink_oid` |
| `ki_schema_registry` | Kafka Schema Registry mappings | `table_oid`, `datasource_oid`, `topic_name`, `sr_schema_id`, `sr_schema` |
| `ki_kafka_lag_info` | Kafka partition lag | `datasource_oid`, `table_oid`, `partition_id`, `highest_offset`, `last_committed_offset` |
| `ki_ha_consumers` | HA queue consumers | `queue_name`, `queue_size`, `last_recv_time`, `source_rank` |

### Query Execution & Performance

| Table | Shows | Key columns |
|-------|-------|-------------|
| `ki_query_active_all` | Currently running SQL | `job_id`, `query_id`, `user_name`, `endpoint`, `execution_status`, `query_text`, `start_time`, `source_rank` |
| `ki_query_history` | Historical SQL execution log | `job_id`, `query_id`, `user_name`, `execution_status`, `query_text`, `start_time`, `stop_time` |
| `ki_query_workers` | Per-worker task status | `job_id`, `worker_id`, `type`, `status`, `elapsed_time_ms` |
| `ki_query_span_metrics_all` | Per-rank op-level metrics | `query_id`, `span_id`, `operator`, `metric_data` (JSON), `start_time`, `stop_time`, `source_rank` |

## Enum Decoders (Single-Letter Codes)

Several columns encode their values as one letter. Decoders:

| Column | Code → meaning |
|--------|----------------|
| `ki_objects.obj_kind` | `E`=external table, `H`=history, `I`=intermediate, `M`=materialized view, `P`=procedure, `R`=replicated, `V`=view |
| `ki_objects.shard_kind` | `N`=none, `R`=replicated, `S`=sharded |
| `ki_objects.persistence` | `P`=persisted, `T`=temp |
| `ki_functions.kind` | `A`=aggregate, `C`=scalar, `P`=procedure, `S`=SQL, `U`=UDF |
| `ki_load_history.load_kind` | `E`=export, `I`=import, `X`=subscription |
| `ki_partitions.partition_type` | `HASH`, `INTERVAL`, `LIST`, `RANGE`, `SERIES` |
| `ki_tiered_objects.tier` / `ki_partitions.tier` | `VRAM`, `RAM`, `DISK0`, `PERSIST` (data flows down when evicted) |
| `ki_tiered_objects.priority` | `1`=system / `ki_catalog` (never evict), `5`=regular user table, `9`=temporary / ephemeral (evicted first). Higher = more expendable. |
| `ki_indexes.index_type` | `cagra`, `chunk_skip`, `column`, `geospatial`, `hnsw` |
| `ki_streams.event_type` | `insert`, `update`, `delete` |
| `ki_query_workers.status` | `cancelled`, `completed`, `failed`, `paused`, `running` |

## `ki_tiered_objects` — Column Reference

`ki_tiered_objects` tracks per-chunk tier placement for every data object across
all ranks. Each row is one chunk (a column segment, index fragment, etc.) and
the tier it currently lives in. For most per-table investigations, filter
`outer_object = '<schema>.<table>'` (see Gotchas — `id` is not safe to filter on).

| Column                 | Type    | Meaning                                      | Diagnostic use |
|------------------------|---------|----------------------------------------------|----------------|
| `size`                 | long    | Bytes occupied in current tier (per chunk)   | Identify large objects consuming tier capacity |
| `id`                   | char256 | String identifier `@table@oid[col][chunk]`   | Opaque — do NOT join to `ki_objects.oid` |
| `tier`                 | char32  | `VRAM` / `RAM` / `DISK0` / `PERSIST`         | Where the chunk currently lives |
| `priority`             | int     | 1=system, 5=user, 9=temp                     | Eviction order within tier (higher = first out) |
| `evictable`            | bool    | Tier manager may move to a lower tier        | Find non-evictable objects blocking space |
| `locked`               | bool    | Pinned in current tier                       | Locked objects cannot be evicted regardless of pressure |
| `pin_count`            | int     | Active reference count                       | High = actively used |
| `ram_evictions`        | int     | Times evicted from RAM                       | High = memory pressure thrashing |
| `persist_evictions`    | int     | Times evicted from PERSIST                   | High = persist tier pressure |
| `owner_resource_group` | char128 | Resource group that owns the allocation      | Tie back to resource group limits |
| `source_rank`          | int     | Which rank holds this chunk (dict-encoded)   | Per-rank tier analysis |
| `outer_object`         | char256 | Parent object name (`<schema>.<table>`), nullable | The safe per-table filter key |

## Canonical Queries

These are the patterns to reach for first. Substitute `<schema>.<table>` /
`<mv_schema_name>.<mv_name>` as needed.

### Table RAM Usage (by rank, with total)

```sql
SELECT
    IF(GROUPING(source_rank) = 1, 'Total', STRING(source_rank)) AS "Rank",
    SUM(size) AS "Bytes"
FROM ki_catalog.ki_tiered_objects
WHERE tier = 'RAM'
  AND outer_object = '<schema>.<table>'
GROUP BY ROLLUP(source_rank)
ORDER BY INT(source_rank) NULLS LAST
```

### Table Disk Usage (PERSIST tier, excluding WAL)

```sql
SELECT
    IF(GROUPING(source_rank) = 1, 'Total', STRING(source_rank)) AS "Rank",
    SUM(size) AS "Bytes"
FROM ki_catalog.ki_tiered_objects
WHERE tier = 'PERSIST'
  AND outer_object = '<schema>.<table>'
  AND id NOT LIKE 'Wal%'
GROUP BY ROLLUP(source_rank)
ORDER BY INT(source_rank) NULLS LAST
```

### Locked Objects (Cannot Be Evicted)

```sql
SELECT outer_object, tier, SUM(size) AS bytes, source_rank, owner_resource_group
FROM ki_catalog.ki_tiered_objects
WHERE locked = 1
GROUP BY outer_object, tier, source_rank, owner_resource_group
ORDER BY bytes DESC
LIMIT 20
```

### High Eviction Churn (Memory Pressure Indicator)

```sql
SELECT outer_object, tier, SUM(size) AS bytes,
       SUM(ram_evictions) AS ram_evictions,
       SUM(persist_evictions) AS persist_evictions,
       source_rank
FROM ki_catalog.ki_tiered_objects
WHERE ram_evictions > 0 OR persist_evictions > 0
GROUP BY outer_object, tier, source_rank
ORDER BY ram_evictions + persist_evictions DESC
LIMIT 20
```

### Specific MV Dependencies (parent & child objects)

```sql
SELECT
    child.schema_name  || '.' || child.object_name  AS child_name,
    d.dep_obj_kind                                   AS child_object_kind,
    parent.schema_name || '.' || parent.object_name AS parent_name,
    d.src_obj_kind                                   AS parent_object_kind
FROM ki_catalog.ki_depend d
JOIN ki_catalog.ki_objects root
    ON root.oid = mv_oid
   AND schema_name = '<mv_schema_name>'
   AND object_name = '<mv_name>'
JOIN ki_catalog.ki_objects parent ON parent.oid = src_obj_oid
JOIN ki_catalog.ki_objects child  ON child.oid  = dep_obj_oid
ORDER BY 1, 3
```

### All MV Dependencies (every MV, every parent/child)

```sql
SELECT
    root.schema_name   || '.' || root.object_name   AS mv_name,
    child.schema_name  || '.' || child.object_name  AS child_name,
    d.dep_obj_kind                                   AS child_object_kind,
    parent.schema_name || '.' || parent.object_name AS parent_name,
    d.src_obj_kind                                   AS parent_object_kind
FROM ki_catalog.ki_depend d
JOIN ki_catalog.ki_objects root   ON root.oid   = mv_oid
JOIN ki_catalog.ki_objects parent ON parent.oid = src_obj_oid
JOIN ki_catalog.ki_objects child  ON child.oid  = dep_obj_oid
ORDER BY 1, 2, 4
```

### 10 Most Recent SQL Queries

```sql
SELECT user_name, query_text, start_time
FROM ki_catalog.ki_query_history
WHERE query_text <> ''
ORDER BY start_time DESC
LIMIT 10
```

### Import/Export Jobs with Errors in the Past Hour

```sql
SELECT *
FROM ki_catalog.ki_load_history
WHERE num_errors > 0
  AND start_time >= TIMESTAMPADD(HOUR, -1, NOW())
```

### Roles with Row / Column Security Restrictions

```sql
SELECT
    role_name,
    object_schema_name || '.' || object_name AS object_name,
    cls AS column_level_security,
    rls AS row_level_security
FROM ki_catalog.ki_object_permissions
WHERE permission_type = 'table_read'
  AND (rls <> '' OR cls <> '')
```

### Role Assignments (who holds which role)

```sql
SELECT role_name AS assigned_role_name,
       member_name AS assignee_name
FROM ki_catalog.ki_role_members
ORDER BY 1, 2 DESC
```

### Columns with Key Properties for a Table

```sql
SELECT c.column_name,
       dt.sql_typename AS data_type,
       c.is_nullable,
       c.is_primary_key,
       c.is_shard_key,
       c.is_dist_encoded
FROM ki_catalog.ki_columns c
JOIN ki_catalog.ki_datatypes dt ON dt.oid = c.column_type_oid
WHERE c.table_name = '<table>'
ORDER BY c.oid
```

### Active Queries Older Than 30 Seconds

```sql
SELECT user_name, endpoint, execution_status, query_text,
       DATEDIFF(SECOND, start_time, NOW()) AS running_seconds
FROM ki_catalog.ki_query_active_all
WHERE DATEDIFF(SECOND, start_time, NOW()) > 30
ORDER BY running_seconds DESC
```

## Gotchas

- **Tiered-object queries require `outer_object`** — to scope `ki_tiered_objects`
  to a single table, filter `outer_object = '<schema>.<table>'`. Filtering
  `object_name` or `id` will miss chunks or give misleading rollups.
- **`ki_tiered_objects.id` is a string, NOT a numeric OID.** Format is
  `@<table>@<oid>[<col_or_chunk_type>][<chunk>]` (e.g.,
  `@nyctaxi@365[col][0]`). Do NOT join it to `ki_objects.oid` — the types
  don't match and the values don't correspond. Use `outer_object` for
  per-table filtering instead.
- **`size` in `ki_tiered_objects` is per-chunk, not per-table** — every diagnostic
  needs a `SUM(size)` aggregate over the matching rows. A raw `size` column read
  understates per-table footprint.
- **Rank 0 has no tiered objects** — it's the head/coordinator (metadata only).
  All `ki_tiered_objects` rows live on worker ranks (1+). An empty result for
  rank 0 is expected, not a signal of imbalance.
- **`VRAM` tier only exists on GPU clusters** — CPU-only clusters top out at
  `RAM`. Don't flag missing `VRAM` rows as a problem.
- **`source_rank` is dict-encoded** — efficient to filter/group on, but the
  underlying values are still integers; cast with `STRING(source_rank)` when
  building human-readable output (see the RAM/Disk usage queries above).
- **`ki_query_history` excludes multi-head ingest/egress** and direct DML
  endpoint calls (`/insert/records`, `/update/records`, `/delete/records`,
  `/delete/records/bystring`). It only records SQL submitted through
  `/execute/sql`.
- **Permission filtering is automatic** — non-admin users will see a subset of
  `ki_objects`, `ki_columns`, etc. matching what they can access. This is a
  feature, not a bug; don't try to work around it with elevated roles unless
  you really need a system-wide inventory.
- **`ki_rag_embeddings.embedding` is `VECTOR(2048)`** — a large column. Don't
  `SELECT *` on this table casually; project only what you need.
- **Enum columns are opaque** — cross-reference the decoders above rather than
  treating `obj_kind`, `shard_kind`, `load_kind`, etc. as human-readable.
- **`load_history.num_errors` is plural in `ki_catalog`** — the ANSI view
  (`information_schema.KI_LOAD_HISTORY`) exposes it as singular `num_error`.
  Keep the two catalog queries straight.
- **Schema qualifier is required.** Most tables aren't on the default path;
  always write `ki_catalog.ki_objects`, not bare `ki_objects`.

## See Also

- [catalog-joins.md](catalog-joins.md) — canonical correlation paths between
  `ki_catalog` tables (object→stat→partitions→columns, type-OID lookup,
  query-span drill-down, permission audit)
- [virtual-catalog-ansi.md](virtual-catalog-ansi.md) — ANSI / `information_schema`
  views (portable standard views layered over this catalog)
- [security-reference.md](security-reference.md) — the GRANT/REVOKE DDL whose
  effects show up in `ki_object_permissions` and `ki_role_members`
- [ddl-reference.md](ddl-reference.md) — DDL for the objects inventoried here
- [version-quirks.md](version-quirks.md) — catalog tables that don't exist in
  7.2.x (`ki_tables`, `ki_version`) and `ki_columns` column-naming overrides
