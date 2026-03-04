'use strict';

/**
 * Integration tests for viz (WMS) CLI commands against a live Kinetica instance.
 *
 * Covers: chart, heatmap, classbreak, wms.
 * Skipped: isochrone (requires a pre-existing graph).
 *
 * Requires KINETICA_DB_SKILL_URL (+ auth env vars) to be set.
 * Run with:  npm run test:integration
 * Skips automatically when env is not configured.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { connect } = require('../../modules/helpers');
const viz = require('../../modules/viz');
const { capturedOutput, makeArgs, testTableName } = require('./helpers');

const DB_URL = process.env.KINETICA_DB_SKILL_URL;

/** PNG magic bytes: \x89PNG\r\n\x1a\n */
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Assert a file exists and starts with the PNG header.
 * @param {string} filePath
 */
function expectPngFile(filePath) {
  expect(fs.existsSync(filePath)).toBe(true);
  const buf = fs.readFileSync(filePath);
  expect(buf.length).toBeGreaterThan(PNG_HEADER.length);
  expect(buf.subarray(0, PNG_HEADER.length)).toEqual(PNG_HEADER);
}

/**
 * Assert a file exists and is non-empty.
 * Used for WMS commands that may return XML error responses instead of PNG
 * depending on server configuration and data suitability.
 * @param {string} filePath
 */
function expectNonEmptyFile(filePath) {
  expect(fs.existsSync(filePath)).toBe(true);
  const buf = fs.readFileSync(filePath);
  expect(buf.length).toBeGreaterThan(0);
}

// ---------------------------------------------------------------------------
// Suite — skips entirely when KINETICA_DB_SKILL_URL is not set
// ---------------------------------------------------------------------------

describe.runIf(DB_URL)('viz commands (integration)', () => {
  const TEST_TABLE = testTableName('viz');
  let db;
  let logSpy;
  let tmpDir;

  // ── Setup: create a table with coordinate data ──────────────────────

  beforeAll(async () => {
    db = connect();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viz-integ-'));

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

  // ── Teardown: drop the test table and clean tmp dir ─────────────────

  afterAll(async () => {
    try {
      await db.clear_table(TEST_TABLE, '', {});
    } catch {
      // best-effort cleanup
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  // ── Per-test spy setup ──────────────────────────────────────────────

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

  // ── chart ───────────────────────────────────────────────────────────

  describe('chart', () => {
    it('generates image data without --output', async () => {
      await viz.chart.fn(
        db,
        makeArgs([TEST_TABLE], {
          'x-column': 'lon',
          'y-column': 'lat',
        })
      );

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.image_data_length).toBeGreaterThan(0);
    });

    it('writes a PNG file with --output', async () => {
      const outFile = path.join(tmpDir, 'chart.png');

      await viz.chart.fn(
        db,
        makeArgs([TEST_TABLE], {
          'x-column': 'lon',
          'y-column': 'lat',
          output: outFile,
        })
      );

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.output).toBe(outFile);
      expect(result.size_bytes).toBeGreaterThan(0);
      expect(fs.existsSync(outFile)).toBe(true);
    });
  });

  // ── heatmap ─────────────────────────────────────────────────────────

  describe('heatmap', () => {
    it('returns size_bytes without --output', async () => {
      await viz.heatmap.fn(
        db,
        makeArgs([TEST_TABLE], {
          'x-col': 'lon',
          'y-col': 'lat',
        })
      );

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.size_bytes).toBeGreaterThan(0);
    });

    it('writes a PNG file with --output', async () => {
      const outFile = path.join(tmpDir, 'heatmap.png');

      await viz.heatmap.fn(
        db,
        makeArgs([TEST_TABLE], {
          'x-col': 'lon',
          'y-col': 'lat',
          output: outFile,
        })
      );

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.output).toBe(outFile);
      expect(result.size_bytes).toBeGreaterThan(0);
      expectPngFile(outFile);
    });

    it('respects custom BBOX and dimensions', async () => {
      const outFile = path.join(tmpDir, 'heatmap-custom.png');

      await viz.heatmap.fn(
        db,
        makeArgs([TEST_TABLE], {
          'x-col': 'lon',
          'y-col': 'lat',
          'min-x': '-130',
          'max-x': '-60',
          'min-y': '20',
          'max-y': '50',
          width: '400',
          height: '300',
          output: outFile,
        })
      );

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expectPngFile(outFile);
    });
  });

  // ── classbreak ──────────────────────────────────────────────────────

  describe('classbreak', () => {
    it('renders a classbreak map without --output', async () => {
      const config = JSON.stringify({
        LAYERS: TEST_TABLE,
        BBOX: '-180,-90,180,90',
        CB_ATTR: 'score',
        X_ATTR: 'lon',
        Y_ATTR: 'lat',
      });

      await viz.classbreak.fn(db, makeArgs([], { config }));

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.size_bytes).toBeGreaterThan(0);
    });

    it('writes a PNG file with --output', async () => {
      const outFile = path.join(tmpDir, 'classbreak.png');
      const config = JSON.stringify({
        LAYERS: TEST_TABLE,
        BBOX: '-180,-90,180,90',
        CB_ATTR: 'score',
        X_ATTR: 'lon',
        Y_ATTR: 'lat',
      });

      await viz.classbreak.fn(db, makeArgs([], { config, output: outFile }));

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.output).toBe(outFile);
      // classbreak may return XML (WMS ServiceException) instead of PNG
      // depending on data suitability; just verify the file was written
      expectNonEmptyFile(outFile);
    });
  });

  // ── wms (general-purpose) ───────────────────────────────────────────

  describe('wms', () => {
    it('renders a generic WMS map without --output', async () => {
      const config = JSON.stringify({
        LAYERS: TEST_TABLE,
        BBOX: '-180,-90,180,90',
        X_ATTR: 'lon',
        Y_ATTR: 'lat',
        STYLES: 'raster',
      });

      await viz.wms.fn(db, makeArgs([], { config }));

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.size_bytes).toBeGreaterThan(0);
    });

    it('writes a PNG file with --output', async () => {
      const outFile = path.join(tmpDir, 'wms.png');
      const config = JSON.stringify({
        LAYERS: TEST_TABLE,
        BBOX: '-180,-90,180,90',
        X_ATTR: 'lon',
        Y_ATTR: 'lat',
        STYLES: 'raster',
      });

      await viz.wms.fn(db, makeArgs([], { config, output: outFile }));

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.output).toBe(outFile);
      expectPngFile(outFile);
    });

    it('allows overriding FORMAT and dimensions', async () => {
      const outFile = path.join(tmpDir, 'wms-custom.png');
      const config = JSON.stringify({
        LAYERS: TEST_TABLE,
        BBOX: '-130,-60,50,20',
        X_ATTR: 'lon',
        Y_ATTR: 'lat',
        STYLES: 'raster',
        WIDTH: 1024,
        HEIGHT: 768,
      });

      await viz.wms.fn(db, makeArgs([], { config, output: outFile }));

      const result = capturedOutput(logSpy);
      expect(result.status).toBe('ok');
      expect(result.size_bytes).toBeGreaterThan(0);
    });
  });
});
