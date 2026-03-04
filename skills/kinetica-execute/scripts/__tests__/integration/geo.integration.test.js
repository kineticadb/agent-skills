'use strict';

/**
 * Integration tests for geo filter commands against a live Kinetica instance.
 *
 * Requires KINETICA_DB_SKILL_URL (+ auth env vars) to be set.
 * Run with:  npm run test:integration
 * Skips automatically when env is not configured.
 */

const { connect } = require('../../modules/helpers');
const geo = require('../../modules/geo');
const { capturedOutput, makeArgs, testTableName } = require('./helpers');

const DB_URL = process.env.KINETICA_DB_SKILL_URL;

// ---------------------------------------------------------------------------
// Suite — skips entirely when KINETICA_DB_SKILL_URL is not set
// ---------------------------------------------------------------------------

describe.runIf(DB_URL)('geo commands (integration)', () => {
  const TEST_TABLE = testTableName('geo');
  let db;
  let logSpy;

  // ── Setup: create table with geospatial seed data ─────────────────────

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

    // Three US cities with known coordinates:
    //   Alice  = NYC      (40.71, -74.01)
    //   Bob    = LA       (34.05, -118.24)
    //   Charlie = Chicago (41.88, -87.63)
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

  // ── Teardown: drop table (also removes server-side filter views) ──────

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

  // ── filter-by-radius ──────────────────────────────────────────────────

  it('filter-by-radius finds points near NYC', async () => {
    // Kinetica uses meters for radius with geographic (lat/lon) data.
    // Distances from NYC: Chicago ≈ 1,145 km, LA ≈ 3,944 km.
    // Radius of 2,000 km (2,000,000 m) should capture NYC + Chicago.
    await geo['filter-by-radius'].fn(
      db,
      makeArgs([TEST_TABLE], {
        'x-col': 'lon',
        'y-col': 'lat',
        'center-x': '-74.0',
        'center-y': '40.7',
        radius: '2000000',
      })
    );

    const result = capturedOutput(logSpy);
    expect(result.count).toBe(2);
  });

  // ── filter-by-box ─────────────────────────────────────────────────────

  it('filter-by-box finds points in eastern US', async () => {
    // Bounding box: lon [-90, -70], lat [35, 45]
    //   Alice   (lon=-74)  → inside
    //   Charlie (lon=-87)  → inside
    //   Bob     (lon=-118) → outside
    await geo['filter-by-box'].fn(
      db,
      makeArgs([TEST_TABLE], {
        'x-col': 'lon',
        'y-col': 'lat',
        'min-x': '-90',
        'max-x': '-70',
        'min-y': '35',
        'max-y': '45',
      })
    );

    const result = capturedOutput(logSpy);
    expect(result.count).toBe(2);
    // view_name may be empty when no explicit --view-name is given
  });

  // ── filter-by-range ───────────────────────────────────────────────────

  it('filter-by-range filters numeric column', async () => {
    // score range [80, 95]:
    //   Alice   (85.5) → inside
    //   Bob     (92.0) → inside
    //   Charlie (78.3) → outside
    await geo['filter-by-range'].fn(
      db,
      makeArgs([TEST_TABLE], {
        column: 'score',
        lower: '80',
        upper: '95',
      })
    );

    const result = capturedOutput(logSpy);
    expect(result.count).toBe(2);
    // view_name may be empty when no explicit --view-name is given
  });

  // ── filter-by-string ──────────────────────────────────────────────────

  it('filter-by-string matches substring in name column', async () => {
    // 'li' is contained in 'Alice' and 'Charlie', but not 'Bob'
    await geo['filter-by-string'].fn(
      db,
      makeArgs([TEST_TABLE], {
        expression: 'li',
        mode: 'contains',
        columns: 'name',
      })
    );

    const result = capturedOutput(logSpy);
    expect(result.count).toBe(2);
    // view_name may be empty when no explicit --view-name is given
  });
});
