'use strict';

/**
 * Shared utilities for integration tests.
 * These tests hit a real Kinetica instance — no mocks.
 */

/**
 * Parse the last JSON string written to a console.log spy.
 * @param {object} logSpy - vi.spyOn(console, 'log') mock
 * @returns {object|null}
 */
function capturedOutput(logSpy) {
  if (logSpy.mock.calls.length === 0) return null;
  const lastCall = logSpy.mock.calls[logSpy.mock.calls.length - 1];
  return JSON.parse(lastCall[0]);
}

/**
 * Build a minimal args object matching parseArgs shape.
 * @param {string[]} positional
 * @param {object} flags
 * @returns {{ cmd: string, positional: string[], flags: object }}
 */
function makeArgs(positional = [], flags = {}) {
  return { cmd: 'test', positional, flags };
}

/**
 * Generate a unique test table name to avoid collisions between runs.
 * @param {string} prefix
 * @returns {string}
 */
function testTableName(prefix = 'integ') {
  const rand = Math.random().toString(36).slice(2, 6);
  return `_test_${prefix}_${Date.now()}_${rand}`;
}

module.exports = { capturedOutput, makeArgs, testTableName };
