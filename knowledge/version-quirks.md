# Kinetica Version Quirks (7.2.x)

Known limitations and non-obvious behaviors of Kinetica 7.2.x that affect SQL
generation and catalog queries. If you are about to suggest any of the patterns
below, **these notes override the "obvious" choice** — fall back to the listed
alternative instead. Newer minor versions may relax some of these; verify
against the live server's reported version when in doubt.

## SQL Statements NOT Supported

### `ANALYZE TABLE` — does not exist

Kinetica does NOT maintain cost-based optimizer statistics the way PostgreSQL
or Oracle do. Query planning uses shard / column metadata already tracked by
the storage layer. `ANALYZE TABLE` returns a syntax error.

- Do NOT suggest `ANALYZE TABLE` as a remediation for slow queries.
- After creating an index, verify with `EXPLAIN` rather than waiting for a
  stats refresh — there is no equivalent "refresh table stats" command to
  substitute.

### `ALTER TABLE ... SET SHARD KEY` — shard keys are immutable

Shard keys are designated at table creation and cannot be changed afterward.
To change a shard key, the table must be dropped and recreated with the new
key. See [ddl-reference.md](ddl-reference.md) for the `CREATE TABLE ... SHARD
KEY (...)` syntax.

## Catalog Tables That Don't Exist

Querying either of these returns an `"Object not found"` error. Use the
replacement instead.

### `ki_catalog.ki_tables` — does NOT exist

To list tables:

```sql
SELECT schema_name || '.' || object_name AS table_name
FROM ki_catalog.ki_objects
WHERE obj_kind = 'R'      -- 'R' = replicated; for non-replicated user tables
                          -- combine with shard_kind filtering as needed
ORDER BY 1
```

See the `obj_kind` decoder in
[virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) for the full set of
codes (E / H / I / M / P / R / V).

### `ki_catalog.ki_version` — does NOT exist

To get the Kinetica version, query the system properties surface (the SQL
function exposes it as a configuration value); your tooling's session context
usually already reports the version at startup, so a runtime query is rarely
necessary.

## `ki_catalog.ki_columns` — Correct Column Names

The schema uses these names, not the "obvious" SQL-standard names. Generating
queries against the wrong column name returns `"Column not found"`:

| Do NOT use         | Correct 7.2.x name |
|--------------------|--------------------|
| `data_type`        | `column_type_oid` (long; join to `ki_datatypes.oid` for `sql_typename`) |
| `dict_encoding`    | `is_dict_encoded` (int flag, 0 or 1) |
| `compression_type` | `bytes_on_disk_compressed` and `bytes_on_disk_uncompressed` (two columns; compute the ratio yourself) |

For the canonical "list columns of a table" query see
[catalog-joins.md](catalog-joins.md) ("Column Type Resolution").

## Identifier & Endpoint Rules

### Three-part names are rejected

Kinetica accepts at most **two-part** identifiers (`<schema>.<table>`). Names
like `ki_home.ki_catalog.ki_objects` return a 400 error from `/show/table` and
fail the SQL parser. Use `ki_catalog.ki_objects` (two parts).

### Log inspection — query the catalog, not an admin endpoint

The `/admin/show/logs` REST endpoint is not implemented in 7.2.x (returns 404
`Unknown URI`). For SQL-side log inspection, query `ki_catalog.ki_log`
directly:

```sql
SELECT rank_num, log_level, message_text, log_time
FROM ki_catalog.ki_log
WHERE log_time >= TIMESTAMPADD(MINUTE, -15, NOW())
  AND log_level IN ('ERROR', 'WARN')
ORDER BY log_time DESC
LIMIT 100
```

## Quick Don't-Do Cheat Sheet

| If you're about to write…                                            | Substitute… |
|----------------------------------------------------------------------|-------------|
| `ANALYZE TABLE <t>`                                                  | `EXPLAIN` your query directly; trust the storage layer |
| `ALTER TABLE <t> SET SHARD KEY (...)`                                | Drop & recreate the table |
| `SELECT * FROM ki_catalog.ki_tables`                                 | `ki_catalog.ki_objects WHERE obj_kind = 'R'` |
| `SELECT * FROM ki_catalog.ki_version`                                | Use session-reported version or system properties |
| `SELECT data_type FROM ki_catalog.ki_columns`                        | Join `column_type_oid` to `ki_catalog.ki_datatypes.oid` |
| `SELECT * FROM ki_home.ki_catalog.ki_objects`                        | `SELECT * FROM ki_catalog.ki_objects` (drop the 3rd part) |
| Calling `/admin/show/logs` for diagnostics                           | `SELECT … FROM ki_catalog.ki_log` |

## See Also

- [kinetica-core-rules.md](kinetica-core-rules.md) — general SQL rules and
  PostgreSQL-compatibility deltas
- [ddl-reference.md](ddl-reference.md) — `CREATE TABLE` shard-key syntax and
  `CREATE INDEX` (where the no-`ANALYZE-TABLE` note also applies)
- [virtual-catalog-kinetica.md](virtual-catalog-kinetica.md) — `ki_objects`
  enum decoders and the rest of the catalog surface
- [catalog-joins.md](catalog-joins.md) — correct join paths for `ki_columns`
  + `ki_datatypes` and friends
