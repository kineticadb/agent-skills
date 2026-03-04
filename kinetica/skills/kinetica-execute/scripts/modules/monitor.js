'use strict';

/**
 * Monitor module for the Kinetica CLI (Node.js).
 *
 * Provides 6 commands: create, show, clear, create-trigger, clear-trigger,
 * show-triggers.
 *
 * Each export follows the category module contract:
 *   { fn: async (db, args) => void, desc: string }
 */

const { die, out, parseCsvArg, parseFloatCsv } = require('./helpers');

// ---------------------------------------------------------------------------
// Valid event types for table monitors
// ---------------------------------------------------------------------------

const EVENT_TYPES = new Set(['insert', 'update', 'delete']);

// ---------------------------------------------------------------------------
// create  --  create_table_monitor
// ---------------------------------------------------------------------------

async function cmdCreate(db, args) {
  const tableName = args.positional[0];
  if (!tableName) {
    die(
      'Usage: monitor create <table> [--event insert|update|delete] ' +
        '[--monitor-id ID] [--expression EXPR]'
    );
  }

  const event = args.flags['event'];
  if (event && !EVENT_TYPES.has(event)) {
    die(`Invalid event type '${event}'. Must be one of: insert, update, delete`);
  }

  const options = {};
  if (event) options.event = event;
  if (args.flags['monitor-id']) options.monitor_id = args.flags['monitor-id'];
  if (args.flags['datasink-name']) options.datasink_name = args.flags['datasink-name'];
  if (args.flags['expression']) options.expression = args.flags['expression'];

  const resp = await db.create_table_monitor(tableName, options);

  out({
    table_name: tableName,
    status: 'ok',
    topic_id: resp.topic_id || '',
    monitor_id: resp.monitor_id || '',
    type_schema: resp.type_schema || '',
  });
}

// ---------------------------------------------------------------------------
// show  --  show_table_monitors
// ---------------------------------------------------------------------------

async function cmdShow(db, args) {
  const monitorIds = args.flags['monitor-ids']
    ? parseCsvArg(args.flags['monitor-ids'])
    : ['*'];

  const resp = await db.show_table_monitors(monitorIds, {});

  const tableNames = resp.table_names || [];
  const resultMonitorIds = resp.monitor_ids || [];
  const types = resp.types || [];
  const events = resp.events || [];

  const monitors = resultMonitorIds.map((mid, i) => ({
    monitor_id: mid,
    table_name: i < tableNames.length ? tableNames[i] : null,
    type: i < types.length ? types[i] : null,
    event: i < events.length ? events[i] : null,
  }));

  out({ monitors, total: monitors.length });
}

// ---------------------------------------------------------------------------
// clear  --  clear_table_monitor
// ---------------------------------------------------------------------------

async function cmdClear(db, args) {
  const topicId = args.positional[0];
  if (!topicId) die('Usage: monitor clear <topic-id>');

  await db.clear_table_monitor(topicId, {});

  out({
    topic_id: topicId,
    status: 'ok',
    message: `Monitor '${topicId}' cleared`,
  });
}

// ---------------------------------------------------------------------------
// create-trigger  --  create_trigger_by_area / create_trigger_by_range
// ---------------------------------------------------------------------------

const TRIGGER_TYPES = new Set(['area', 'range']);

async function cmdCreateTrigger(db, args) {
  const tableNamesRaw = args.positional[0];
  if (!tableNamesRaw) {
    die('Usage: monitor create-trigger <table,...> --type area|range --trigger-id ID [options]');
  }

  const tableNames = parseCsvArg(tableNamesRaw);
  const triggerType = args.flags['type'];
  const triggerId = args.flags['trigger-id'];

  if (!triggerType || !TRIGGER_TYPES.has(triggerType)) {
    die('--type is required and must be one of: area, range');
  }
  if (!triggerId) {
    die('--trigger-id is required');
  }

  if (triggerType === 'area') {
    const xCol = args.flags['x-col'];
    const yCol = args.flags['y-col'];
    if (!xCol || !yCol) die('Area trigger requires --x-col and --y-col');

    const xVerticesRaw = args.flags['x-vertices'];
    const yVerticesRaw = args.flags['y-vertices'];
    if (!xVerticesRaw || !yVerticesRaw) {
      die('Area trigger requires --x-vertices and --y-vertices');
    }

    const xVector = parseFloatCsv(xVerticesRaw);
    const yVector = parseFloatCsv(yVerticesRaw);

    if (xVector.length !== yVector.length) {
      die('--x-vertices and --y-vertices must have the same number of values');
    }

    await db.create_trigger_by_area(
      triggerId,
      tableNames,
      xCol,
      xVector,
      yCol,
      yVector,
      {}
    );

    out({
      trigger_id: triggerId,
      trigger_type: 'area',
      status: 'ok',
      table_names: tableNames,
      x_column: xCol,
      y_column: yCol,
      x_vertices: xVector,
      y_vertices: yVector,
    });
  } else if (triggerType === 'range') {
    const column = args.flags['column'];
    if (!column) die('Range trigger requires --column');

    const minVal = args.flags['min'];
    const maxVal = args.flags['max'];
    if (minVal === undefined || maxVal === undefined) {
      die('Range trigger requires --min and --max');
    }

    const minNum = parseFloat(minVal);
    const maxNum = parseFloat(maxVal);

    if (Number.isNaN(minNum) || Number.isNaN(maxNum)) {
      die('--min and --max must be valid numbers');
    }

    await db.create_trigger_by_range(
      triggerId,
      tableNames,
      column,
      minNum,
      maxNum,
      {}
    );

    out({
      trigger_id: triggerId,
      trigger_type: 'range',
      status: 'ok',
      table_names: tableNames,
      column,
      min: minNum,
      max: maxNum,
    });
  }
}

// ---------------------------------------------------------------------------
// clear-trigger  --  clear_trigger
// ---------------------------------------------------------------------------

async function cmdClearTrigger(db, args) {
  const triggerId = args.positional[0];
  if (!triggerId) die('Usage: monitor clear-trigger <trigger-id>');

  await db.clear_trigger(triggerId, {});

  out({
    trigger_id: triggerId,
    status: 'ok',
    message: `Trigger '${triggerId}' cleared`,
  });
}

// ---------------------------------------------------------------------------
// show-triggers  --  show_triggers
// ---------------------------------------------------------------------------

async function cmdShowTriggers(db, args) {
  const triggerIds = args.flags['trigger-ids']
    ? parseCsvArg(args.flags['trigger-ids'])
    : ['*'];

  const resp = await db.show_triggers(triggerIds, {});

  const triggerMap = resp.trigger_map || {};

  const triggers = Object.entries(triggerMap).map(([tid, info]) => ({
    trigger_id: tid,
    info,
  }));

  out({ triggers, total: triggers.length });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  create: { fn: cmdCreate, desc: 'Create a table monitor' },
  show: { fn: cmdShow, desc: 'Show table monitors' },
  clear: { fn: cmdClear, desc: 'Clear (remove) a table monitor' },
  'create-trigger': {
    fn: cmdCreateTrigger,
    desc: 'Create a trigger (area or range) on tables',
  },
  'clear-trigger': {
    fn: cmdClearTrigger,
    desc: 'Clear (remove) a trigger',
  },
  'show-triggers': {
    fn: cmdShowTriggers,
    desc: 'Show triggers',
  },
};
