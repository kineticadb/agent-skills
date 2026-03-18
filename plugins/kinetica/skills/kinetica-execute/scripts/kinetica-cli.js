#!/usr/bin/env node
'use strict';

/**
 * Kinetica GPU Database CLI -- thin dispatcher.
 *
 * Routes commands to core or category modules while maintaining backward
 * compatibility with all 10 original flat commands.
 */

const { connect, parseArgs, die, out } = require('./modules/helpers');

const CORE_COMMANDS = require('./modules/core');

// ---------------------------------------------------------------------------
// Category modules
// ---------------------------------------------------------------------------

const CATEGORY_MODULES = {
  graph: './modules/graph',
  geo: './modules/geo',
  viz: './modules/viz',
  io: './modules/io_cmd',
  monitor: './modules/monitor',
};

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  const lines = ['Usage: kinetica-cli <command> [args]\n', 'Commands:'];
  for (const [name, { desc }] of Object.entries(CORE_COMMANDS)) {
    lines.push(`  ${name.padEnd(18)} ${desc}`);
  }

  // List categories that are actually importable
  const categories = [];
  for (const [name, modPath] of Object.entries(CATEGORY_MODULES)) {
    try {
      const mod = require(modPath);
      const actions = Object.keys(mod).sort().join(', ');
      categories.push(`  ${name.padEnd(18)} ${actions || '(no actions)'}`);
    } catch (_) {
      // Module not yet implemented -- skip
    }
  }

  if (categories.length > 0) {
    lines.push('\nCategories:');
    for (const line of categories) {
      lines.push(line);
    }
  }

  lines.push(
    '\nEnvironment variables: KINETICA_DB_SKILL_URL, KINETICA_DB_SKILL_USER, KINETICA_DB_SKILL_PASS, KINETICA_DB_SKILL_OAUTH_TOKEN, KINETICA_DB_SKILL_TIMEOUT'
  );
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------
// Shared error handler for command dispatch
// ---------------------------------------------------------------------------

async function runHandler(fn, db, args) {
  try {
    await fn(db, args);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.includes('Unable to sort on array column')) {
      out({
        error: msg,
        fix: 'Remove the array column from ORDER BY, use a non-array column, or index into it: ORDER BY "col"[1]',
      });
    } else {
      out({ error: msg });
    }
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const first = argv[0];

  // Category dispatch
  if (first in CATEGORY_MODULES) {
    const modPath = CATEGORY_MODULES[first];
    let mod;
    try {
      mod = require(modPath);
    } catch (err) {
      die(`Category '${first}' is not available: ${err.message}`);
    }

    const rest = argv.slice(1);
    if (rest.length === 0 || rest[0] === '--help' || rest[0] === '-h') {
      const actionLines = [`Usage: kinetica-cli ${first} <action> [args]\n`, 'Actions:'];
      for (const [actionName, info] of Object.entries(mod)) {
        actionLines.push(`  ${actionName.padEnd(18)} ${info.desc || ''}`);
      }
      console.log(actionLines.join('\n'));
      process.exit(0);
    }

    const action = rest[0];
    const entry = mod[action];
    if (!entry) {
      die(
        `Unknown action '${action}' in category '${first}'. ` +
          `Available: ${Object.keys(mod).sort().join(', ')}`
      );
    }

    const args = parseArgs(rest);
    const db = connect();
    await runHandler(entry.fn, db, args);
    return;
  }

  // Core command dispatch
  const args = parseArgs(argv);
  const cmd = CORE_COMMANDS[args.cmd];
  if (!cmd) die(`Unknown command: ${args.cmd}. Run with --help for usage.`);

  const db = connect();
  await runHandler(cmd.fn, db, args);
}

// Auto-run when invoked directly; skip when require()'d by tests
if (require.main === module) {
  main();
}

module.exports = { main };
