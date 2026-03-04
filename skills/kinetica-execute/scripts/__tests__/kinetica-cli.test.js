'use strict';

/**
 * Unit tests for scripts/kinetica-cli.js (dispatcher).
 *
 * Strategy: Real modules run (helpers, core, categories). We mock only:
 * - @kinetica/gpudb via require.cache (mock constructor returns mock db)
 * - fs via vi.spyOn (prevent .env reads)
 * - process.exit / console.log / console.error via vi.spyOn
 * - Environment variables for connect()
 *
 * The module exports { main } and guards auto-execution with
 * require.main === module, so main() is called explicitly per test.
 */

// ---------------------------------------------------------------------------
// Setup: mock GPUdb via require.cache BEFORE any module loads
// NOTE: vi.spyOn() at module level breaks CJS require() in Vitest v4
// ---------------------------------------------------------------------------

// Mock GPUdb constructor — returns an object with all SDK methods stubbed
const gpudbPath = require.resolve('@kinetica/gpudb');
let lastMockDb;
function MockGPUdb(url) {
  lastMockDb = createMockDb();
  lastMockDb.url = url;
  return lastMockDb;
}
require.cache[gpudbPath] = {
  id: gpudbPath,
  filename: gpudbPath,
  loaded: true,
  exports: MockGPUdb,
};

// Now import the CLI (main does NOT auto-run)
const { main } = require('../kinetica-cli');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let logSpy;
let exitSpy;
let errorSpy;

beforeEach(() => {
  lastMockDb = null;

  // Set env so connect() succeeds
  process.env.KINETICA_DB_SKILL_URL = 'http://test-kinetica:9191';
  process.env.KINETICA_DB_SKILL_USER = 'admin';
  process.env.KINETICA_DB_SKILL_PASS = 'pass';
  delete process.env.KINETICA_DB_SKILL_OAUTH_TOKEN;

  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`EXIT_${code}`);
  });
});

/** Run the CLI dispatcher with given args. Catches expected exit throws. */
async function runCli(args) {
  process.argv = ['node', 'kinetica-cli.js', ...args];
  try {
    await main();
  } catch (e) {
    if (!e.message.startsWith('EXIT_')) {
      throw e;
    }
  }
}

/** Parse the JSON string passed to console.log */
function capturedOutput() {
  if (logSpy.mock.calls.length === 0) return null;
  const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1];
  try {
    return JSON.parse(lastCall[0]);
  } catch {
    return lastCall[0];
  }
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

describe('--help', () => {
  it('prints help and exits 0 when no args', async () => {
    await runCli([]);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('Usage:');
    expect(output).toContain('health');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('prints help when --help flag is passed', async () => {
    await runCli(['--help']);

    expect(logSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

// ---------------------------------------------------------------------------
// Core command dispatch
// ---------------------------------------------------------------------------

describe('core command dispatch', () => {
  it('dispatches health command', async () => {
    await runCli(['health']);

    expect(lastMockDb).not.toBeNull();
    expect(lastMockDb.show_table).toHaveBeenCalled();
    const result = capturedOutput();
    expect(result.status).toBe('ok');
  });

  it('dies on unknown command', async () => {
    await runCli(['nonexistent-cmd']);

    expect(errorSpy).toHaveBeenCalled();
    const errOutput = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(errOutput.error).toContain('Unknown command');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Category dispatch
// ---------------------------------------------------------------------------

describe('category dispatch', () => {
  it('prints category help when --help given', async () => {
    await runCli(['graph', '--help']);

    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls[0][0];
    expect(output).toContain('Actions:');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('dies on unknown action in category', async () => {
    await runCli(['graph', 'nonexistent-action']);

    expect(errorSpy).toHaveBeenCalled();
    const errOutput = JSON.parse(errorSpy.mock.calls[0][0]);
    expect(errOutput.error).toContain('Unknown action');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('catches SDK errors and exits 1', async () => {
    // Make the SDK method fail
    const dbOverride = createMockDb({
      show_table: vi.fn().mockRejectedValue(new Error('SDK timeout')),
    });
    // Replace the mock constructor to return our failing db
    const origExports = require.cache[gpudbPath].exports;
    require.cache[gpudbPath].exports = function () {
      return dbOverride;
    };

    await runCli(['health']);

    // cmdHealth handles errors internally (first output), then process.exit
    // throws (mocked), which main's catch also catches (second output).
    // Check the first output from cmdHealth.
    const firstCall = logSpy.mock.calls[0];
    const result = JSON.parse(firstCall[0]);
    expect(result.status).toBe('error');
    expect(result.message).toBe('SDK timeout');
    expect(exitSpy).toHaveBeenCalledWith(1);

    // Restore
    require.cache[gpudbPath].exports = origExports;
  });
});
