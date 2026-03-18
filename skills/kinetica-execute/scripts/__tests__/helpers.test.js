'use strict';

/**
 * Unit tests for scripts/modules/helpers.js
 *
 * NOTE: vi.spyOn() at module level before require() breaks CJS module
 * resolution in Vitest v4 (required module returns empty object).
 * All vi.spyOn calls are done inside test functions or beforeEach instead.
 * GPUdb is mocked via require.cache replacement (safe at module level).
 */

const fs = require('fs');

// Replace @kinetica/gpudb in cache with a mock constructor
const gpudbPath = require.resolve('@kinetica/gpudb');
const MockGPUdb = vi.fn(function (url, opts) {
  this.url = url;
  this.opts = opts;
});
require.cache[gpudbPath] = {
  id: gpudbPath,
  filename: gpudbPath,
  loaded: true,
  exports: MockGPUdb,
};

// Load helpers (loadEnvFile() runs once with real fs — env is restored by setup.js)
const {
  loadEnvFile,
  env,
  die,
  out,
  connect,
  columnarToRows,
  parseArgs,
  parseCsvArg,
  parseFloatCsv,
  formatAvroType,
} = require('../modules/helpers');

// ---------------------------------------------------------------------------
// loadEnvFile
// ---------------------------------------------------------------------------

describe('loadEnvFile', () => {
  let existsSpy;
  let readFileSpy;

  beforeEach(() => {
    existsSpy = vi.spyOn(fs, 'existsSync');
    readFileSpy = vi.spyOn(fs, 'readFileSync');
  });

  it('does nothing when .env file does not exist', () => {
    existsSpy.mockReturnValue(false);
    loadEnvFile();
    expect(readFileSpy).not.toHaveBeenCalled();
  });

  it('parses KEY=value pairs', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue('MY_TEST_KEY=hello\nMY_OTHER=world');
    delete process.env.MY_TEST_KEY;
    delete process.env.MY_OTHER;

    loadEnvFile();

    expect(process.env.MY_TEST_KEY).toBe('hello');
    expect(process.env.MY_OTHER).toBe('world');
  });

  it('strips double quotes from values', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue('QUOTED_VAR="some value"');
    delete process.env.QUOTED_VAR;

    loadEnvFile();

    expect(process.env.QUOTED_VAR).toBe('some value');
  });

  it('strips single quotes from values', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue("SINGLE_Q='single val'");
    delete process.env.SINGLE_Q;

    loadEnvFile();

    expect(process.env.SINGLE_Q).toBe('single val');
  });

  it('skips comments and blank lines', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue(
      '# comment\n\n  \nVALID_KEY=yes\n# another comment'
    );
    delete process.env.VALID_KEY;

    loadEnvFile();

    expect(process.env.VALID_KEY).toBe('yes');
  });

  it('skips lines without = sign', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue('NOEQUALS\nHAS_EQ=good');
    delete process.env.NOEQUALS;
    delete process.env.HAS_EQ;

    loadEnvFile();

    expect(process.env.NOEQUALS).toBeUndefined();
    expect(process.env.HAS_EQ).toBe('good');
  });

  it('does not override existing env vars', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue('EXISTING_VAR=from_file');
    process.env.EXISTING_VAR = 'from_system';

    loadEnvFile();

    expect(process.env.EXISTING_VAR).toBe('from_system');
  });

  it('handles values with = in them', () => {
    existsSpy.mockReturnValue(true);
    readFileSpy.mockReturnValue('CONN_STR=host=localhost;port=9191');
    delete process.env.CONN_STR;

    loadEnvFile();

    expect(process.env.CONN_STR).toBe('host=localhost;port=9191');
  });
});

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------

describe('env', () => {
  it('returns env var value when set', () => {
    process.env.TEST_ENV_KEY = 'test_value';
    expect(env('TEST_ENV_KEY')).toBe('test_value');
  });

  it('returns fallback when env var is not set', () => {
    delete process.env.MISSING_KEY;
    expect(env('MISSING_KEY', 'default_val')).toBe('default_val');
  });

  it('returns undefined when no env var and no fallback', () => {
    delete process.env.TOTALLY_MISSING;
    expect(env('TOTALLY_MISSING')).toBeUndefined();
  });

  it('returns fallback when env var is empty string', () => {
    process.env.EMPTY_VAR = '';
    expect(env('EMPTY_VAR', 'fallback')).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// die
// ---------------------------------------------------------------------------

describe('die', () => {
  it('writes JSON error to stderr and exits with code 1', () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => die('something failed')).toThrow('process.exit');

    expect(stderrSpy).toHaveBeenCalledWith(
      JSON.stringify({ error: 'something failed' })
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// out
// ---------------------------------------------------------------------------

describe('out', () => {
  it('prints pretty JSON to stdout', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    out({ status: 'ok', count: 42 });

    expect(logSpy).toHaveBeenCalledWith(
      JSON.stringify({ status: 'ok', count: 42 }, null, 2)
    );
  });

  it('handles arrays', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    out([1, 2, 3]);

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify([1, 2, 3], null, 2));
  });
});

// ---------------------------------------------------------------------------
// columnarToRows
// ---------------------------------------------------------------------------

describe('columnarToRows', () => {
  it('converts columnar data to row objects', () => {
    const headers = ['name', 'age'];
    const data = {
      column_1: ['Alice', 'Bob'],
      column_2: [30, 25],
    };

    const rows = columnarToRows(headers, data);

    expect(rows).toEqual([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
  });

  it('returns empty array for empty headers', () => {
    expect(columnarToRows([], {})).toEqual([]);
  });

  it('returns empty array for null headers', () => {
    expect(columnarToRows(null, {})).toEqual([]);
  });

  it('handles missing column data gracefully', () => {
    const headers = ['a', 'b', 'c'];
    const data = {
      column_1: ['x', 'y'],
      column_2: [1, 2],
      // column_3 missing
    };

    const rows = columnarToRows(headers, data);

    expect(rows).toEqual([
      { a: 'x', b: 1, c: null },
      { a: 'y', b: 2, c: null },
    ]);
  });

  it('handles single-row data', () => {
    const headers = ['id'];
    const data = { column_1: [42] };

    expect(columnarToRows(headers, data)).toEqual([{ id: 42 }]);
  });
});

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe('parseArgs', () => {
  it('extracts command from first arg', () => {
    const result = parseArgs(['query']);
    expect(result.cmd).toBe('query');
    expect(result.positional).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it('collects positional arguments', () => {
    const result = parseArgs(['query', 'SELECT 1', 'extra']);
    expect(result.cmd).toBe('query');
    expect(result.positional).toEqual(['SELECT 1', 'extra']);
  });

  it('parses --key value flags', () => {
    const result = parseArgs(['get-records', 'mytable', '--limit', '50']);
    expect(result.flags.limit).toBe('50');
  });

  it('parses boolean flags (no value after --flag)', () => {
    const result = parseArgs(['cmd', '--verbose']);
    expect(result.flags.verbose).toBe(true);
  });

  it('handles mixed positional and flags', () => {
    const result = parseArgs([
      'get-records',
      'users',
      '--limit',
      '10',
      '--offset',
      '5',
    ]);

    expect(result.cmd).toBe('get-records');
    expect(result.positional).toEqual(['users']);
    expect(result.flags).toEqual({ limit: '10', offset: '5' });
  });

  it('treats --flag followed by --another as boolean', () => {
    const result = parseArgs(['cmd', '--verbose', '--debug']);
    expect(result.flags.verbose).toBe(true);
    expect(result.flags.debug).toBe(true);
  });

  it('returns undefined cmd for empty argv', () => {
    const result = parseArgs([]);
    expect(result.cmd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseCsvArg
// ---------------------------------------------------------------------------

describe('parseCsvArg', () => {
  it('splits comma-separated values', () => {
    expect(parseCsvArg('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace', () => {
    expect(parseCsvArg(' x , y , z ')).toEqual(['x', 'y', 'z']);
  });

  it('returns empty array for falsy input', () => {
    expect(parseCsvArg('')).toEqual([]);
    expect(parseCsvArg(null)).toEqual([]);
    expect(parseCsvArg(undefined)).toEqual([]);
  });

  it('returns single-element array for non-CSV input', () => {
    expect(parseCsvArg('single')).toEqual(['single']);
  });
});

// ---------------------------------------------------------------------------
// parseFloatCsv
// ---------------------------------------------------------------------------

describe('parseFloatCsv', () => {
  it('splits CSV into floats', () => {
    expect(parseFloatCsv('1.5,2.7,3.0')).toEqual([1.5, 2.7, 3.0]);
  });

  it('trims whitespace before parsing', () => {
    expect(parseFloatCsv(' 10 , 20.5 ')).toEqual([10, 20.5]);
  });

  it('returns empty array for falsy input', () => {
    expect(parseFloatCsv('')).toEqual([]);
    expect(parseFloatCsv(null)).toEqual([]);
  });

  it('returns NaN for non-numeric values', () => {
    const result = parseFloatCsv('abc');
    expect(result).toHaveLength(1);
    expect(Number.isNaN(result[0])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatAvroType
// ---------------------------------------------------------------------------

describe('formatAvroType', () => {
  it('returns simple string types as-is', () => {
    expect(formatAvroType('string')).toBe('string');
    expect(formatAvroType('int')).toBe('int');
  });

  it('strips null from nullable union types', () => {
    expect(formatAvroType(['string', 'null'])).toBe('string');
  });

  it('formats array type descriptors', () => {
    expect(formatAvroType({ type: 'array', items: 'string' })).toBe('array<string>');
  });

  it('formats nullable array types', () => {
    expect(formatAvroType([{ type: 'array', items: 'int' }, 'null'])).toBe('array<int>');
  });

  it('formats nested array types', () => {
    expect(
      formatAvroType({ type: 'array', items: { type: 'array', items: 'string' } })
    ).toBe('array<array<string>>');
  });

  it('falls back to .type for non-array object descriptors', () => {
    expect(formatAvroType({ type: 'map', values: 'string' })).toBe('map');
  });

  it('falls back to JSON.stringify for object without .type', () => {
    expect(formatAvroType({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });

  it('converts non-string/non-object/non-array to string', () => {
    expect(formatAvroType(42)).toBe('42');
    expect(formatAvroType(null)).toBe('null');
  });

  it('joins multiple non-null types with pipe', () => {
    expect(formatAvroType(['string', 'int'])).toBe('string|int');
  });
});

// ---------------------------------------------------------------------------
// connect
// ---------------------------------------------------------------------------

describe('connect', () => {
  beforeEach(() => {
    MockGPUdb.mockClear();
  });

  it('creates GPUdb with URL from env', () => {
    process.env.KINETICA_DB_SKILL_URL = 'http://test:9191';
    process.env.KINETICA_DB_SKILL_USER = 'admin';
    process.env.KINETICA_DB_SKILL_PASS = 'pass123';
    delete process.env.KINETICA_DB_SKILL_OAUTH_TOKEN;

    const db = connect();

    expect(MockGPUdb).toHaveBeenCalledWith(
      'http://test:9191',
      expect.objectContaining({ username: 'admin', password: 'pass123' })
    );
    expect(db).toBeInstanceOf(MockGPUdb);
  });

  it('uses oauth token when available', () => {
    process.env.KINETICA_DB_SKILL_URL = 'http://test:9191';
    process.env.KINETICA_DB_SKILL_OAUTH_TOKEN = 'my-token';

    connect();

    expect(MockGPUdb).toHaveBeenCalledWith(
      'http://test:9191',
      expect.objectContaining({ oauth_token: 'my-token' })
    );
    const opts = MockGPUdb.mock.calls[0][1];
    expect(opts.username).toBeUndefined();
  });

  it('dies when KINETICA_DB_SKILL_URL is not set', () => {
    delete process.env.KINETICA_DB_SKILL_URL;

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => connect()).toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('sets timeout from env', () => {
    process.env.KINETICA_DB_SKILL_URL = 'http://test:9191';
    process.env.KINETICA_DB_SKILL_TIMEOUT = '60000';
    delete process.env.KINETICA_DB_SKILL_OAUTH_TOKEN;

    connect();

    expect(MockGPUdb).toHaveBeenCalledWith(
      'http://test:9191',
      expect.objectContaining({ timeout: 60000 })
    );
  });
});
