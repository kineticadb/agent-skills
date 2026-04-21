# ANSI Virtual Catalog Reference (`information_schema`)

Kinetica implements the Schemata section of **ISO/IEC 9075 (SQL:2003)** as a
set of logical views layered on top of the Kinetica Virtual Catalog
(`ki_catalog.*`). Views live in the `information_schema` schema and
auto-reflect database state. Like the native catalog, **query results are
auto-filtered by caller permissions.**

Prefer `information_schema` when:

- You want portable, standards-compliant introspection (`TABLES`, `COLUMNS`,
  `SCHEMATA`, `KEY_COLUMN_USAGE`, `REFERENTIAL_CONSTRAINTS`, …).
- A tool or ORM already expects the `information_schema` surface.
- The metadata you need is covered by a standard view.

Reach for [virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) instead
when you need Kinetica-only data (tier placement via `ki_tiered_objects`,
RAG embeddings, query span metrics, single-letter enum codes, etc.).

## Standard ANSI Views

All views live under `information_schema`. Column names follow SQL:2003 — upper
case, underscore-separated.

| View | Shows | Notable columns |
|------|-------|-----------------|
| `SCHEMATA` | Schemas | `SCHEMA_NAME`, `SCHEMA_OWNER`, `CREATED`, `LAST_ALTERED`, `COMMENT` |
| `TABLES` | Tables & views | `TABLE_SCHEMA`, `TABLE_NAME`, `TABLE_OWNER`, `TABLE_TYPE` (`BASE TABLE` \| `VIEW`), `RETENTION_TIME`, `CREATED`, `LAST_ALTERED`, `COMMENT` |
| `VIEWS` | Logical views | `TABLE_SCHEMA`, `TABLE_NAME`, `TABLE_OWNER`, `VIEW_DEFINITION`, `CREATED`, `LAST_ALTERED` |
| `COLUMNS` | Columns | `TABLE_SCHEMA`, `TABLE_NAME`, `COLUMN_NAME`, `DATA_TYPE`, `IS_NULLABLE`, `NUMERIC_PRECISION`, `COMMENT` |
| `TABLE_CONSTRAINTS` | PK/FK constraints | `CONSTRAINT_SCHEMA`, `CONSTRAINT_NAME`, `TABLE_NAME`, `CONSTRAINT_TYPE`, `ENFORCED` |
| `KEY_COLUMN_USAGE` | Source-side columns of a constraint | `CONSTRAINT_SCHEMA`, `CONSTRAINT_NAME`, `TABLE_NAME`, `COLUMN_NAME`, `ORDINAL_POSITION` |
| `CONSTRAINT_COLUMN_USAGE` | All columns (both sides) in a constraint | `CONSTRAINT_SCHEMA`, `CONSTRAINT_NAME`, `TABLE_NAME`, `CONSTRAINT_TYPE`, `COLUMN_NAME` |
| `REFERENTIAL_CONSTRAINTS` | Foreign-key relationships | `CONSTRAINT_NAME`, `UNIQUE_CONSTRAINT_NAME`, `MATCH_OPTION`, `UPDATE_RULE`, `DELETE_RULE` |
| `TABLE_PRIVILEGES` | Table-level grants per grantee | `GRANTEE`, `TABLE_SCHEMA`, `TABLE_NAME`, `PRIVILEGE_TYPE`, `IS_GRANTABLE` |
| `ROLE_TABLE_GRANTS` | Alias for `TABLE_PRIVILEGES` | — |
| `APPLICABLE_ROLES` | Roles the current user can apply | `ROLE_NAME`, `GRANTEE`, `ROLE_OWNER`, `IS_GRANTABLE` |
| `ENABLED_ROLES` | Roles/users in the caller's scope | `ROLE_NAME`, `ROLE_OWNER` |
| `CHARACTER_SETS` | Supported character sets | `CHARACTER_SET_NAME`, `CHARACTER_REPERTOIRE`, `FORM_OF_USE` |
| `DATABASES` | Database identity | `DATABASE_NAME`, `DATABASE_OWNER` |
| `INFORMATION_SCHEMA_CATALOG_NAME` | Catalog identity | `CATALOG_NAME` (always `"kinetica"`) |

## Kinetica Extension Views

Also under `information_schema` — these surface Kinetica-specific state and do
not have ANSI equivalents.

| View | Shows | Notable columns |
|------|-------|-----------------|
| `FIELDS` | Columns keyed by object type (covers views too) | `OBJECT_SCHEMA`, `OBJECT_NAME`, `OBJECT_TYPE`, `FIELD_NAME`, `DATA_TYPE` |
| `FUNCTIONS` | Scalar / aggregate / window / UDF / procedure | `FUNCTION_SCHEMA`, `FUNCTION_NAME`, `ARGUMENT_SIGNATURE[]`, `DATA_TYPE`, `CREATED`, `LAST_ALTERED` |
| `INDEXES` | Indexes on tables | `TABLE_SCHEMA`, `TABLE_NAME`, `INDEX_TYPE`, `INDEX_COLUMNS` |
| `PARTITIONS` | Table partitions & stats | `TABLE_SCHEMA`, `TABLE_NAME`, `RANK_NUM`, `PARTITION_ID`, `PARTITION_TYPE`, `TOTAL_ROWS`, `STORAGE_TIER` |
| `MV_DEPENDENCIES` | Materialized-view lineage | `MV_SCHEMA`, `MV_NAME`, `SOURCE_TABLE_SCHEMA`, `SOURCE_TABLE_NAME`, `SOURCE_TABLE_KIND`, `DEST_TABLE_SCHEMA`, `DEST_TABLE_NAME` |
| `OBJECT_PRIVILEGES` | Grants across every object type | `GRANTEE`, `OBJECT_SCHEMA`, `OBJECT_NAME`, `OBJECT_TYPE` (`context`, `credential`, `datasink`, `datasource`, `directory`, `graph`, `proc`, `schema`, `table`, `table_monitor`), `PRIVILEGE_TYPE` |
| `CONTEXTS` / `CONTEXT_RULES` / `CONTEXT_SAMPLES` / `CONTEXT_TABLES` / `CONTEXT_TABLE_COLUMNS` | SQL-GPT context definitions | See `ki_contexts` mapping in [virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) |
| `KI_BACKUP_HISTORY` | Backups | `BACKUP_NAME`, `BACKUP_ID`, `DATASINK_NAME`, `STATUS`, `START_TIME`, `END_TIME`, `NUM_RECORDS`, `NUM_BYTES` |
| `KI_RESTORE_HISTORY` | Restores | `BACKUP_NAME`, `BACKUP_ID`, `DATASOURCE_NAME`, `STATUS`, `START_TIME`, `END_TIME`, `NUM_RECORDS` |
| `KI_LOAD_HISTORY` | Load / export events | `TABLE_SCHEMA`, `TABLE_NAME`, `USER_NAME`, `JOB_ID`, `START_TIME`, `END_TIME`, `ROWS_PROCESSED`, `ROWS_INSERTED`, `ROWS_SKIPPED`, `NUM_ERROR` |
| `KI_DATASOURCE_SUBSCRIPTIONS` | Live source subscriptions | `SCHEMA_NAME`, `OBJECT_NAME`, `DATASOURCE_NAME`, `DATASOURCE_KIND`, `STATUS`, `JOBID` |
| `KI_KAFKA_LAG_INFO` | Kafka partition lag | `TABLE_NAME`, `DATASOURCE_NAME`, `PARTITION_ID`, `HIGHEST_OFFSET`, `LAST_COMMITTED_OFFSET` |
| `KI_HA_CONSUMERS` | HA queue consumers | `QUEUE_NAME`, `QUEUE_SIZE`, `LAST_RECV_TIME`, `SOURCE_RANK` |
| `KI_STREAMS` | Table monitors | `STREAM_SCHEMA`, `STREAM_NAME`, `SOURCE_TABLE_NAME`, `STATUS`, `EVENT_TYPE`, `DATASINK_NAME` |
| `KI_PERIODIC_OBJECTS` | MVs & procedures with refresh schedules | `OBJECT_NAME`, `SCHEMA_NAME`, `LAST_REFRESH_TIME`, `NEXT_REFRESH_TIME`, `REFRESH_STOP_TIME` |
| `KI_QUERY_ACTIVE` | Currently running SQL | `JOB_ID`, `QUERY_ID`, `USER_NAME`, `RESOURCE_GROUP`, `EXECUTION_STATUS`, `START_TIME`, `QUERY_TEXT`, `SOURCE_RANK` |
| `KI_QUERY_HISTORY` | Historical SQL | `JOB_ID`, `QUERY_ID`, `USER_NAME`, `EXECUTION_STATUS`, `START_TIME`, `STOP_TIME`, `SQL_STEP_COUNT` |
| `KI_QUERY_WORKERS` | Per-worker task status | `JOB_ID`, `WORKER_ID`, `TYPE`, `TASK_INFO`, `THREAD_POOL`, `STATUS`, `SQL_STEP`, `RUNNING_TASK_COUNT` |
| `KI_QUERY_SPAN_METRICS` | Per-rank op-level metrics | `QUERY_ID`, `SPAN_ID`, `OPERATOR`, `SQL_STEP`, `METRIC_DATA` (JSON), `START_TIME`, `STOP_TIME`, `SOURCE_RANK` |
| `KI_QUERY_SPAN_METRICS_BY_SQL_STEP` | Metrics aggregated per step | `QUERY_ID`, `SQL_STEP`, `INS_LOCK_WAIT`, `INSERT_WAIT`, `MEMORY_VRAM_NUM_EVICTIONS`, `IO_DISK_CACHE_BYTES_READ`, … |
| `KI_CATALOG_VERSION` | Catalog schema version | `CATALOG_VERSION` |

## Canonical Queries

### List Tables in a Schema

```sql
SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, CREATED
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = '<schema>'
ORDER BY TABLE_NAME
```

### Describe a Table's Columns

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, NUMERIC_PRECISION, COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = '<schema>'
  AND TABLE_NAME   = '<table>'
ORDER BY ORDINAL_POSITION
```

### Primary & Foreign Key Columns for a Schema

```sql
SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE,
       kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.ORDINAL_POSITION
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu
  ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
 AND kcu.CONSTRAINT_NAME   = tc.CONSTRAINT_NAME
WHERE tc.CONSTRAINT_SCHEMA = '<schema>'
ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_TYPE, kcu.ORDINAL_POSITION
```

### Privileges Held by a Specific Grantee

```sql
SELECT OBJECT_SCHEMA, OBJECT_NAME, OBJECT_TYPE, PRIVILEGE_TYPE
FROM information_schema.OBJECT_PRIVILEGES
WHERE GRANTEE = '<user_or_role>'
ORDER BY OBJECT_TYPE, OBJECT_SCHEMA, OBJECT_NAME
```

### Specific MV Dependencies

```sql
SELECT
    dest_table_schema   || '.' || dest_table_name   AS child_name,
    source_table_schema || '.' || source_table_name AS parent_name,
    source_table_kind                                AS parent_table_kind
FROM information_schema.MV_DEPENDENCIES
WHERE mv_schema = '<mv_schema_name>'
  AND mv_name   = '<mv_name>'
ORDER BY 1, 2
```

### All MV Dependencies

```sql
SELECT
    mv_schema           || '.' || mv_name           AS mv_name,
    dest_table_schema   || '.' || dest_table_name   AS child_name,
    source_table_schema || '.' || source_table_name AS parent_name,
    source_table_kind                                AS parent_table_kind
FROM information_schema.MV_DEPENDENCIES
ORDER BY 1, 2, 3
```

### 10 Most Recent SQL Queries (by caller)

```sql
SELECT user_name, query_text, start_time
FROM information_schema.KI_QUERY_HISTORY
WHERE query_text <> ''
ORDER BY start_time DESC
LIMIT 10
```

### Import/Export Jobs with Errors in the Past Hour

```sql
SELECT *
FROM information_schema.KI_LOAD_HISTORY
WHERE num_error > 0
  AND start_time >= TIMESTAMPADD(HOUR, -1, NOW())
```

Note: the error column is `num_error` (singular) here, but `num_errors`
(plural) on `ki_catalog.ki_load_history`.

### Partitions for a Table, with Storage Tier

```sql
SELECT RANK_NUM, PARTITION_ID, PARTITION_TYPE, TOTAL_ROWS, STORAGE_TIER
FROM information_schema.PARTITIONS
WHERE TABLE_SCHEMA = '<schema>'
  AND TABLE_NAME   = '<table>'
ORDER BY RANK_NUM, PARTITION_ID
```

## Deviations from the ANSI Standard

`information_schema` in Kinetica is a strict subset of SQL:2003. These columns
return constant or unpopulated values regardless of underlying state — don't
rely on them in portable code.

| View | Column | Value |
|------|--------|-------|
| `DATABASES` | `DATABASE_NAME` | Always `"root"` |
| `DATABASES` | `DATABASE_OWNER` | Always `"admin"` |
| `INFORMATION_SCHEMA_CATALOG_NAME` | `CATALOG_NAME` | Always `"kinetica"` |
| `CHARACTER_SETS` | entire view | Single UTF-8 row |
| `CHARACTER_SETS` | `CHARACTER_REPERTOIRE` | Always `"UCS"` |
| `CHARACTER_SETS` | `FORM_OF_USE` | Always `"UTF8"` |
| `REFERENTIAL_CONSTRAINTS` | `MATCH_OPTION` | Always `"FULL"` |
| `REFERENTIAL_CONSTRAINTS` | `UPDATE_RULE`, `DELETE_RULE` | Always `"NO ACTION"` (no cascade) |
| `COLUMNS` | `IS_IDENTITY`, `IDENTITY_GENERATION` | Always `FALSE` / null (no identity columns) |
| `COLUMNS` | `CHARACTER_OCTET_LENGTH` | Always `0` |
| `COLUMNS` | `NUMERIC_PRECISION_RADIX` | Always `0` |

**Constrained enum ranges** (not an error — just smaller than what ANSI allows):

- `INDEXES.INDEX_TYPE` ∈ {`cagra`, `chunk_skip`, `column`, `geospatial`, `hnsw`}
- `PARTITIONS.STORAGE_TIER` ∈ {`PERSIST`, `RAM`}
- `PARTITIONS.PARTITION_TYPE` ∈ {`HASH`, `INTERVAL`, `LIST`, `RANGE`, `SERIES`}
- `TABLES.TABLE_TYPE` ∈ {`BASE TABLE`, `VIEW`}

**Unpopulated columns** (marked "Not used" in Kinetica's docs — will be null /
blank): most `CHARACTER_SET_*`, `COLLATION_*`, `DOMAIN_*`, `SCOPE_*`, and
several lifecycle / `OWNER` columns on `CHARACTER_SETS`, `COLUMNS`, `FIELDS`,
`FUNCTIONS`, `REFERENTIAL_CONSTRAINTS`, `SCHEMATA`, `TABLE_PRIVILEGES`,
`TABLES`, and `VIEWS`.

## Gotchas

- **Permission filtering is automatic.** Regular users will only see objects
  they can access; admins see everything. Don't interpret a short
  `TABLES` listing as "the database is empty" — it may just mean the caller
  lacks permission on the rest.
- **Query-history scope is caller-relative.** `KI_QUERY_HISTORY`,
  `KI_QUERY_SPAN_METRICS`, and `KI_QUERY_SPAN_METRICS_BY_SQL_STEP` only show
  the caller's own queries unless the caller has system-admin privilege.
  `KI_QUERY_HISTORY` also excludes multi-head ingest/egress and direct DML
  endpoint calls.
- **Column-name casing is upper-case.** ANSI views expose `TABLE_SCHEMA`,
  `TABLE_NAME`, `COLUMN_NAME`, etc. — not the lower-case `table_name` used in
  the native `ki_catalog` tables.
- **`KI_LOAD_HISTORY.num_error` is singular** (ANSI view), while
  `ki_catalog.ki_load_history.num_errors` is plural. Easy to miss when
  porting a query between the two catalogs.
- **No cascade semantics.** `REFERENTIAL_CONSTRAINTS` always reports `NO ACTION`
  for `UPDATE_RULE` / `DELETE_RULE` — Kinetica doesn't implement cascading
  FK rules, so don't read those columns as evidence that cascades exist.
- **Some "views" are views over views.** Most `information_schema` objects
  are logical views over `ki_catalog.*` tables, and a few are views over
  other `information_schema` views. Treat every read as cheap metadata, but
  don't expect materialized-view-class performance on huge schemas.

## When to Pick Which Catalog

| Goal | Prefer |
|------|--------|
| Portable / standards-compliant DDL introspection | `information_schema` |
| List tables, columns, PK/FK for a schema | `information_schema` (`TABLES`, `COLUMNS`, `KEY_COLUMN_USAGE`) |
| Audit privileges across every object type | `information_schema.OBJECT_PRIVILEGES` |
| Inspect SQL-GPT contexts, samples, and rules | `information_schema.CONTEXTS*` or `ki_catalog.ki_contexts` |
| Tier placement, RAM/disk usage per rank | `ki_catalog.ki_tiered_objects` (via `outer_object`) |
| RAG embeddings for a context | `ki_catalog.ki_rag_embeddings` |
| Decode `obj_kind` / `shard_kind` / `load_kind` enums | `ki_catalog.*` + decoder table in [virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) |
| Kafka HA queue depth / partition lag | `ki_catalog.ki_ha_consumers`, `ki_catalog.ki_kafka_lag_info` (or the ANSI mirrors) |
| Running query timeline for any user (admin) | `ki_catalog.ki_query_active_all`, `ki_catalog.ki_query_history` |
| Running query timeline for self only | `information_schema.KI_QUERY_ACTIVE`, `information_schema.KI_QUERY_HISTORY` |

## See Also

- [virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) — underlying
  `ki_catalog` tables and enum decoders
- [security-reference.md](security-reference.md) — GRANT/REVOKE DDL whose
  effects surface in `OBJECT_PRIVILEGES`, `TABLE_PRIVILEGES`,
  `APPLICABLE_ROLES`, `ENABLED_ROLES`
- [ddl-reference.md](ddl-reference.md) — DDL for the schemas, tables, views,
  and partitions described here
