'use strict';

/**
 * Integration tests for core CLI commands against a live Kinetica instance.
 *
 * Requires KINETICA_DB_SKILL_URL (+ auth env vars) to be set.
 * Run with:  npm run test:integration
 * Skips automatically when env is not configured.
 */

const { connect } = require('../../modules/helpers');
const core = require('../../modules/core');
const { capturedOutput, makeArgs, testTableName } = require('./helpers');

const DB_URL = process.env.KINETICA_DB_SKILL_URL;

// ---------------------------------------------------------------------------
// Suite — skips entirely when KINETICA_DB_SKILL_URL is not set
// ---------------------------------------------------------------------------

describe.runIf(DB_URL)('core commands (integration)', () => {
  const TEST_TABLE = testTableName('core');
  let db;
  let logSpy;

  // ── Setup: create a real table with seed data ─────────────────────────

  beforeAll(async () => {
    db = connect();

    await db.execute_sql_request({
      statement: `CREATE OR REPLACE TABLE "${TEST_TABLE}" (
        id INT NOT NULL,
        name VARCHAR(64),
        lat FLOAT,
        lon FLOAT,
        score FLOAT
      )`,
      limit: -9999,
      offset: 0,
      encoding: 'json',
      options: {},
    });

    await db.insert_records_from_json(
      [
        { id: 1, name: 'Alice', lat: 40.7128, lon: -74.006, score: 85.5 },
        { id: 2, name: 'Bob', lat: 34.0522, lon: -118.2437, score: 92.0 },
        { id: 3, name: 'Charlie', lat: 41.8781, lon: -87.6298, score: 78.3 },
      ],
      TEST_TABLE,
      {},
      {}
    );
  });

  // ── Teardown: drop the test table ─────────────────────────────────────

  afterAll(async () => {
    try {
      await db.clear_table(TEST_TABLE, '', {});
    } catch {
      // best-effort cleanup
    }
  });

  // ── Per-test spy setup ────────────────────────────────────────────────

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── health ────────────────────────────────────────────────────────────

  it('health reports ok against live DB', async () => {
    await core.health.fn(db);

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.url).toBe(DB_URL);
  });

  // ── query ─────────────────────────────────────────────────────────────

  it('query executes SQL and returns rows', async () => {
    await core.query.fn(
      db,
      makeArgs([`SELECT id, name FROM "${TEST_TABLE}" ORDER BY id`])
    );

    const result = capturedOutput(logSpy);
    expect(result.total_number_of_records).toBe(3);
    expect(result.records).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 3, name: 'Charlie' },
    ]);
  });

  it('query respects limit and offset', async () => {
    await core.query.fn(
      db,
      makeArgs(
        [`SELECT id FROM "${TEST_TABLE}" ORDER BY id`],
        { limit: '2', offset: '1' }
      )
    );

    const result = capturedOutput(logSpy);
    expect(result.records).toEqual([{ id: 2 }, { id: 3 }]);
  });

  // ── show-tables ───────────────────────────────────────────────────────

  it('show-tables returns top-level entries', async () => {
    // Called with no args, show_table('') returns schemas / top-level entities
    await core['show-tables'].fn(db, makeArgs([]));

    const result = capturedOutput(logSpy);
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.total).toBeGreaterThan(0);
    expect(result.tables[0]).toHaveProperty('table_name');
  });

  it('show-tables lists tables within a schema', async () => {
    // Tables are created under a default schema (e.g. ki_home).
    // Discover the schema via show_table with show_children=false, then
    // verify show-tables returns our test table when scoped to that schema.
    const meta = await db.show_table(TEST_TABLE, {
      show_children: 'false',
    });
    const schema = (meta.additional_info || [{}])[0].schema_name;
    if (!schema) return; // skip if schema info unavailable

    await core['show-tables'].fn(db, makeArgs([schema]));

    const result = capturedOutput(logSpy);
    const match = result.tables.find((t) => t.table_name === TEST_TABLE);
    expect(match).toBeDefined();
    expect(match.size).toBeGreaterThanOrEqual(3);
  });

  // ── describe-table ────────────────────────────────────────────────────

  it('describe-table returns column metadata', async () => {
    await core['describe-table'].fn(db, makeArgs([TEST_TABLE]));

    const result = capturedOutput(logSpy);
    expect(result.table_name).toBe(TEST_TABLE);
    expect(result.size).toBeGreaterThanOrEqual(3);

    const colNames = result.columns.map((c) => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('name');
    expect(colNames).toContain('lat');
    expect(colNames).toContain('lon');
    expect(colNames).toContain('score');
  });

  // ── get-records ───────────────────────────────────────────────────────

  it('get-records retrieves all rows by default', async () => {
    await core['get-records'].fn(db, makeArgs([TEST_TABLE]));

    const result = capturedOutput(logSpy);
    expect(result.total_number_of_records).toBe(3);
    expect(result.records).toHaveLength(3);
  });

  it('get-records filters with expression', async () => {
    await core['get-records'].fn(
      db,
      makeArgs([TEST_TABLE], { expression: 'score > 80' })
    );

    const result = capturedOutput(logSpy);
    expect(result.records).toHaveLength(2);
    const names = result.records.map((r) => r.name).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('get-records selects specific columns', async () => {
    await core['get-records'].fn(
      db,
      makeArgs([TEST_TABLE], { columns: 'id,name', limit: '1' })
    );

    const result = capturedOutput(logSpy);
    expect(result.records).toHaveLength(1);
    const keys = Object.keys(result.records[0]).sort();
    expect(keys).toEqual(['id', 'name']);
  });

  // ── aggregate ─────────────────────────────────────────────────────────

  it('aggregate performs group-by on live data', async () => {
    await core.aggregate.fn(db, makeArgs([TEST_TABLE, 'count(*)']));

    const result = capturedOutput(logSpy);
    expect(result.total_number_of_records).toBe(1);
    expect(result.records[0]['count(*)']).toBe(3);
  });

  // ── show-types ────────────────────────────────────────────────────────

  it('show-types returns at least one type', async () => {
    await core['show-types'].fn(db, makeArgs([]));

    const result = capturedOutput(logSpy);
    expect(result.types.length).toBeGreaterThan(0);
    expect(result.types[0]).toHaveProperty('type_id');
    expect(result.types[0]).toHaveProperty('schema');
  });

  // ── insert-json (mutating — runs after read-only tests) ───────────────

  it('insert-json adds a record to the table', async () => {
    const json = JSON.stringify({
      id: 4,
      name: 'Diana',
      lat: 0,
      lon: 0,
      score: 99,
    });

    await core['insert-json'].fn(db, makeArgs([TEST_TABLE, json]));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.count_inserted).toBeGreaterThanOrEqual(1);
  });

  // ── delete-records (mutating — runs after insert) ─────────────────────

  it('delete-records removes matching row', async () => {
    await core['delete-records'].fn(db, makeArgs([TEST_TABLE, 'id = 4']));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.count_deleted).toBeGreaterThanOrEqual(1);
  });

  // ── clear-table (uses a separate disposable table) ────────────────────

  it('clear-table drops a table', async () => {
    const tmpTable = testTableName('clear');

    await db.execute_sql_request({
      statement: `CREATE TABLE "${tmpTable}" (x INT)`,
      limit: -9999,
      offset: 0,
      encoding: 'json',
      options: {},
    });

    await core['clear-table'].fn(db, makeArgs([tmpTable]));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.message).toContain(tmpTable);
  });
});
