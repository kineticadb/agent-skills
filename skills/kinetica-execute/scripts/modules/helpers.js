'use strict';

/**
 * Shared helpers for all Kinetica CLI modules (Node.js).
 *
 * Usage:
 *   const { env, die, out, connect, columnarToRows, parseArgs, parseCsvArg, parseFloatCsv } = require('./modules/helpers');
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// .env loader -- reads .env from CWD (expected to be project root)
// ---------------------------------------------------------------------------

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Only set if not already defined (real env takes precedence)
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

// Auto-load on require so env vars are available immediately
loadEnvFile();

// ---------------------------------------------------------------------------
// Environment / IO helpers
// ---------------------------------------------------------------------------

/**
 * Get an environment variable with an optional fallback.
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string|undefined}
 */
function env(key, fallback) {
  return process.env[key] || fallback;
}

/**
 * Print a JSON error to stderr and exit with code 1.
 * @param {string} msg
 */
function die(msg) {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

/**
 * Print a JSON object to stdout with pretty formatting.
 * @param {object} obj
 */
function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// ---------------------------------------------------------------------------
// Kinetica connection
// ---------------------------------------------------------------------------

/**
 * Create a GPUdb connection from environment variables.
 * Requires the @kinetica/gpudb package.
 * @returns {GPUdb}
 */
function connect() {
  const GPUdb = require('@kinetica/gpudb');

  const url = env('KINETICA_DB_SKILL_URL');
  if (!url) die('KINETICA_DB_SKILL_URL is not set');

  const opts = {};
  const token = env('KINETICA_DB_SKILL_OAUTH_TOKEN');
  if (token) {
    opts.oauth_token = token;
  } else {
    opts.username = env('KINETICA_DB_SKILL_USER', '');
    opts.password = env('KINETICA_DB_SKILL_PASS', '');
  }
  const timeout = parseInt(env('KINETICA_DB_SKILL_TIMEOUT', '30000'), 10);
  if (timeout > 0) opts.timeout = timeout;

  return new GPUdb(url, opts);
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

/**
 * Convert Kinetica columnar response to an array of row objects.
 * The response contains column_headers plus column_1, column_2, ...
 * @param {string[]} headers
 * @param {object} data
 * @returns {object[]}
 */
function columnarToRows(headers, data) {
  if (!headers || headers.length === 0) return [];
  const numRows = data['column_1'] ? data['column_1'].length : 0;
  const rows = [];
  for (let i = 0; i < numRows; i++) {
    const row = {};
    headers.forEach((h, j) => {
      row[h] = data[`column_${j + 1}`] ? data[`column_${j + 1}`][i] : null;
    });
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Argument parsing helpers
// ---------------------------------------------------------------------------

/**
 * Minimal arg parser (no external deps).
 * @param {string[]} argv - process.argv.slice(2) typically
 * @returns {{ cmd: string, positional: string[], flags: object }}
 */
function parseArgs(argv) {
  const cmd = argv[0];
  const positional = [];
  const flags = {};
  let i = 1;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 2;
      } else {
        flags[key] = true;
        i += 1;
      }
    } else {
      positional.push(a);
      i += 1;
    }
  }
  return { cmd, positional, flags };
}

/**
 * Split a comma-separated string into a list of trimmed strings.
 * Returns an empty array for falsy input.
 * @param {string} value
 * @returns {string[]}
 */
function parseCsvArg(value) {
  if (!value) return [];
  return value.split(',').map(s => s.trim());
}

/**
 * Split a comma-separated string into a list of floats.
 * Returns an empty array for falsy input.
 * @param {string} value
 * @returns {number[]}
 */
function parseFloatCsv(value) {
  if (!value) return [];
  return value.split(',').map(s => parseFloat(s.trim()));
}

// ---------------------------------------------------------------------------
// Type formatting
// ---------------------------------------------------------------------------

/**
 * Format an Avro type descriptor into a human-readable string.
 *
 * Handles simple strings ("string"), nullable unions (["string", "null"]),
 * array descriptors ({"type":"array","items":"string"}), and nested
 * combinations thereof.
 *
 * @param {string|object|Array} avroType
 * @returns {string}
 */
function formatAvroType(avroType) {
  if (typeof avroType === 'string') return avroType;
  if (avroType && typeof avroType === 'object' && !Array.isArray(avroType)) {
    if (avroType.type === 'array') return `array<${formatAvroType(avroType.items)}>`;
    return avroType.type || JSON.stringify(avroType);
  }
  if (Array.isArray(avroType)) {
    const nonNull = avroType.filter((t) => t !== 'null');
    return nonNull.map(formatAvroType).join('|');
  }
  return String(avroType);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
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
};
