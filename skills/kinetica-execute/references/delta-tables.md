# Kinetica Delta Tables Reference

A *delta table* is a regular Kinetica table that, when referenced from a
materialized view or query-based stream, contributes only the rows **inserted
since the consumer last looked**. It is not a separate object type — the
"delta" behavior is opted into per-query via the `KI_HINT_DELTA_TABLE`
scoped hint, or implied by position in a `CREATE STREAM ... ON QUERY` join.

Delta semantics apply to **inserts only**. Updates and deletes on the
source table are NOT reflected in the consumer's result set.

## When to use

- **Changes-only materialized views** — incrementally enrich newly-arrived
  source rows by joining against static lookup tables, without re-emitting
  rows that were already published on prior refreshes.
- **Table-driven streams** — publish only the inserts that match a
  membership predicate (e.g. positions falling inside an active geofence
  list, orders for currently-watched customers).

## Restrictions (BOTH features)

The marked delta source must be a **regular table**. It cannot be any of:

- external table
- filter view
- join view
- logical view
- materialized view

For query-based streams, the join must also satisfy
[Kinetica join sharding rules](ddl-reference.md): either both tables are
sharded on the equality-joined columns, or one of the tables is replicated.

## Changes-Only Materialized Views

Use the `KI_HINT_DELTA_TABLE` scoped hint, placed immediately after the
table name and **before** any alias. Each source table you want treated as
a delta table needs its own hint.

```sql
-- Only emit weather events received since the last MV refresh,
-- enriched with the static geo_zone they fell into.
CREATE MATERIALIZED VIEW "example"."weather_zone" AS
SELECT
    "w"."name" AS "event_name",
    "w"."type" AS "event_type",
    "gz"."name" AS "zone"
FROM "example"."weather" /*+ KI_HINT_DELTA_TABLE */ "w"
JOIN "example"."geo_zone" "gz"
  ON STXY_INTERSECTS("w"."lon", "w"."lat", "gz"."zone")
```

Refresh-cycle behavior: each `REFRESH` advances the delta watermark, so a
follow-up `SELECT` against the MV returns only inserts that arrived since
the previous refresh.

```text
-- After first refresh:
+--------+------------+-----------+
| name   | type       | zone      |
+--------+------------+-----------+
| Anna   | Hurricane  | Northeast |
| Bob    | Monsoon    | Northwest |
| Civic  | High Winds | Southwest |

-- After next refresh (only the new arrival shows):
+--------+------------+-----------+
| Dened  | Hurricane  | Southeast |
```

### Materialized view refresh options

These options are independent of delta tables but are commonly paired with
them. Full grammar:

```sql
CREATE [OR REPLACE] MATERIALIZED VIEW "schema"."mv"
[REFRESH
    < ON CHANGE
    | EVERY <number> <SECOND[S] | MINUTE[S] | HOUR[S] | DAY[S]>
        [STARTING AT '<YYYY-MM-DD [HH:MM[:SS]]>']
    >
]
[STOP AFTER <number> <SECOND[S] | MINUTE[S] | HOUR[S] | DAY[S]>]
AS (<select query>)
[WITH OPTIONS (EXECUTE AS = '<username>')]
```

- `REFRESH ON CHANGE` — re-evaluate whenever a source table changes.
- `REFRESH EVERY <n> <unit> [STARTING AT '<ts>']` — periodic refresh; the
  optional `STARTING AT` anchors the schedule.
- `STOP AFTER <n> <unit>` — auto-disable refreshes after the given window.
- `EXECUTE AS = '<user>'` — run refreshes with that user's privileges
  (falls back to creator, then admin, if the user no longer exists).

```sql
-- Refresh every 30 minutes, replace existing
CREATE OR REPLACE MATERIALIZED VIEW "example"."mv_sales"
REFRESH EVERY .5 HOURS AS
(
    SELECT "a", "b", "c", "d", KI_SHARD_KEY("a", "b")
    FROM "example"."sales"
)

-- Refresh every minute, scheduled window, run as a service user
CREATE MATERIALIZED VIEW "example"."mv_2025"
REFRESH EVERY 1 MINUTE
STARTING AT '2025-01-01 00:00:00'
STOP AFTER 365 DAYS
AS
(
    SELECT * FROM "example"."events"
)
WITH OPTIONS (EXECUTE AS = 'mv_user')
```

## Query-Based Streams (Delta + Lookup)

`CREATE STREAM ... ON QUERY` requires this exact shape:

```sql
SELECT *
FROM <delta_table> dt
LEFT SEMI JOIN <lookup_table> lt
  ON <join_clause>
```

- `<delta_table>` (aliased `dt`) — the data table being monitored. The
  same regular-table restriction as above applies.
- `<lookup_table>` (aliased `lt`) — membership criteria; only rows of
  `dt` for which the join finds a match are streamed.

```sql
-- Publish position fixes only for vehicles whose tracked geofence
-- currently contains them.
CREATE STREAM "tracking"."geofence_alerts"
ON QUERY (
    SELECT *
    FROM "tracking"."positions" "dt"
    LEFT SEMI JOIN "geo"."zones" "lt"
      ON STXY_CONTAINSPOINT("lt"."geom", "dt"."x", "dt"."y")
)
REFRESH EVERY 30 SECONDS
WITH OPTIONS (DATASINK_NAME = 'kafka_out')
```

Note that streams are dropped automatically if the source delta table is
altered or dropped.

## Common pitfalls

- **Hint placement matters.** `FROM tbl /*+ KI_HINT_DELTA_TABLE */ alias` is
  correct. Putting the hint before the table name or after the alias is
  silently ignored.
- **Updates / deletes are invisible.** If your join logic depends on
  observing modifications (not just inserts), delta tables are the wrong
  tool — use `REFRESH ON CHANGE` on a non-delta MV, or a CDC stream
  (`CREATE STREAM ... ON TABLE ... REFRESH ON CHANGE`).
- **Marking a non-regular table.** Hinting an external/filter/join/
  logical/materialized view as a delta table will fail at MV creation
  time — re-shape the source into a regular table first.
- **Forgetting to refresh.** Delta watermark only advances on `REFRESH`.
  An MV with no `REFRESH EVERY ...` schedule and no manual
  `REFRESH MATERIALIZED VIEW` call will keep showing the same first batch.

## Related

- [ddl-reference.md](ddl-reference.md) — Materialized View, Stream, and
  CTAS DDL grammar this document extends.
- [sql-patterns.md](sql-patterns.md) — Window-function deltas
  (`value - prev_value`); unrelated to this delta-table feature but a
  common source of search confusion.
