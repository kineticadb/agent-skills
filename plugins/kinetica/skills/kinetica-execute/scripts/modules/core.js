'use strict';

/**
 * Core Kinetica CLI commands (Node.js).
 *
 * Provides the original 10 commands extracted from kinetica-cli.js.
 * Each command has signature (db, args) where args comes from parseArgs.
 */

const fs = require('fs');
const {
  die,
  out,
  columnarToRows,
  formatAvroType,
  extractArrayType,
} = require('./helpers');

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdHealth(db) {
  try {
    await db.show_table('', { show_children: 'false' });
    out({ status: 'ok', message: 'Connected to Kinetica', url: db.url });
  } catch (err) {
    out({ status: 'error', message: err.message || String(err) });
    process.exit(1);
  }
}

async function cmdQuery(db, args) {
  const sql = args.positional[0];
  if (!sql) die('Usage: query <sql>');

  const limit = parseInt(args.flags.limit || '-9999', 10);
  const offset = parseInt(args.flags.offset || '0', 10);

  const resp = await db.execute_sql_request({
    statement: sql,
    offset,
    limit,
    encoding: 'json',
    options: {},
  });

  const data = resp.data || {};
  const headers = data.column_headers || resp.column_headers || [];
  const rows = columnarToRows(headers, data);
  out({
    total_number_of_records: resp.total_number_of_records,
    has_more_records: resp.has_more_records,
    count_affected: resp.count_affected,
    records: rows,
  });
}

async function cmdShowTables(db, args) {
  const schema = args.positional[0] || '';
  const tableName = schema || '';

  const resp = await db.show_table(tableName, {
    get_sizes: 'true',
    show_children: 'true',
  });

  const tables = (resp.table_names || []).map((name, i) => ({
    table_name: name,
    size: resp.sizes ? resp.sizes[i] : null,
    type_id: resp.type_ids ? resp.type_ids[i] : null,
  }));

  out({ tables, total: tables.length });
}

async function cmdDescribeTable(db, args) {
  const tableName = args.positional[0];
  if (!tableName) die('Usage: describe-table <table_name>');

  const resp = await db.show_table(tableName, {
    get_sizes: 'true',
    show_children: 'false',
    get_column_info: 'true',
  });

  let columns = [];
  if (resp.type_schemas && resp.type_schemas.length > 0) {
    try {
      const schema = JSON.parse(resp.type_schemas[0]);
      columns = (schema.fields || []).map((f) => ({
        name: f.name,
        type: formatAvroType(f.type),
      }));
    } catch (_) {
      /* ignore parse error */
    }
  }

  // Attach column properties and detect array types from properties metadata
  if (resp.properties && resp.properties.length > 0) {
    try {
      const raw = resp.properties[0];
      const props = typeof raw === 'string' ? JSON.parse(raw) : raw;
      columns = columns.map((col) => {
        if (!props[col.name]) return col;
        const colProps = props[col.name];
        const arrayType = extractArrayType(colProps);
        return {
          ...col,
          ...(arrayType ? { type: arrayType } : {}),
          properties: colProps,
        };
      });
    } catch (_) {
      /* ignore */
    }
  }

  out({
    table_name: tableName,
    size: resp.sizes ? resp.sizes[0] : null,
    type_id: resp.type_ids ? resp.type_ids[0] : null,
    columns,
  });
}

async function cmdGetRecords(db, args) {
  const tableName = args.positional[0];
  if (!tableName)
    die(
      'Usage: get-records <table> [--limit N] [--offset N] [--expression EXPR] [--columns col1,col2] [--sort-by COL] [--sort-order asc|desc]'
    );

  const limit = parseInt(args.flags.limit || '100', 10);
  const offset = parseInt(args.flags.offset || '0', 10);
  const columnNames = args.flags.columns
    ? args.flags.columns.split(',').map((c) => c.trim())
    : [];

  const opts = {};
  if (args.flags.expression) opts.expression = args.flags.expression;
  if (args.flags['sort-by']) opts.sort_by = args.flags['sort-by'];
  if (args.flags['sort-order']) {
    opts.sort_order =
      args.flags['sort-order'] === 'desc' ? 'descending' : 'ascending';
  }

  const resp = await db.get_records_by_column(
    tableName,
    columnNames.length > 0 ? columnNames : ['*'],
    offset,
    limit,
    opts
  );

  const grData = resp.data || {};
  const grHeaders = grData.column_headers || resp.column_headers || [];
  const rows = columnarToRows(grHeaders, grData);
  out({
    table_name: tableName,
    total_number_of_records: resp.total_number_of_records,
    has_more_records: resp.has_more_records,
    records: rows,
  });
}

async function cmdInsertJson(db, args) {
  const tableName = args.positional[0];
  let jsonArg = args.positional[1];
  if (!tableName || !jsonArg) die('Usage: insert-json <table> <json_or_@file>');

  // If starts with @, read from file
  if (jsonArg.startsWith('@')) {
    const filePath = jsonArg.slice(1);
    jsonArg = fs.readFileSync(filePath, 'utf8');
  }

  let records;
  try {
    records = JSON.parse(jsonArg);
  } catch (e) {
    die(`Invalid JSON: ${e.message}`);
  }

  // Ensure records is an array
  if (!Array.isArray(records)) records = [records];

  const resp = await db.insert_records_from_json(records, tableName, {}, {});
  out({
    table_name: tableName,
    status: 'ok',
    count_inserted: resp.count_inserted || records.length,
    count_updated: resp.count_updated || 0,
  });
}

async function cmdDeleteRecords(db, args) {
  const tableName = args.positional[0];
  const expression = args.positional[1];
  if (!tableName || !expression)
    die('Usage: delete-records <table> <expression>');

  const resp = await db.delete_records(tableName, [expression], {});
  out({
    table_name: tableName,
    status: 'ok',
    count_deleted: resp.count_deleted,
  });
}

async function cmdClearTable(db, args) {
  const tableName = args.positional[0];
  if (!tableName) die('Usage: clear-table <table>');

  await db.clear_table(tableName, '', {});
  out({
    table_name: tableName,
    status: 'ok',
    message: `Table '${tableName}' dropped`,
  });
}

async function cmdShowTypes(db, args) {
  const typeId = args.positional[0] || '';
  const label = args.positional[1] || '';

  const resp = await db.show_types(typeId, label, {});
  const types = (resp.type_ids || []).map((id, i) => {
    let schema = null;
    try {
      schema = JSON.parse(resp.type_schemas[i]);
    } catch (_) {
      schema = resp.type_schemas[i];
    }
    return {
      type_id: id,
      label: resp.labels ? resp.labels[i] : '',
      schema,
    };
  });

  out({ types, total: types.length });
}

async function cmdAggregate(db, args) {
  const tableName = args.positional[0];
  const columnsStr = args.positional[1];
  if (!tableName || !columnsStr)
    die('Usage: aggregate <table> <columns> [--limit N] [--offset N]');

  const columns = columnsStr.split(',').map((c) => c.trim());
  const limit = parseInt(args.flags.limit || '100', 10);
  const offset = parseInt(args.flags.offset || '0', 10);

  const resp = await db.aggregate_group_by(
    tableName,
    columns,
    offset,
    limit,
    {}
  );
  const aggData = resp.data || {};
  const aggHeaders = aggData.column_headers || resp.column_headers || [];
  const rows = columnarToRows(aggHeaders, aggData);
  out({
    table_name: tableName,
    total_number_of_records: resp.total_number_of_records,
    records: rows,
  });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  health: { fn: cmdHealth, desc: 'Verify connection to Kinetica' },
  query: { fn: cmdQuery, desc: 'Execute any SQL statement' },
  'show-tables': { fn: cmdShowTables, desc: 'List tables (optionally by schema)' },
  'describe-table': {
    fn: cmdDescribeTable,
    desc: 'Show columns, types, properties, row count',
  },
  'get-records': { fn: cmdGetRecords, desc: 'Retrieve records from a table' },
  'insert-json': {
    fn: cmdInsertJson,
    desc: 'Insert JSON records into a table',
  },
  'delete-records': { fn: cmdDeleteRecords, desc: 'Delete matching records' },
  'clear-table': { fn: cmdClearTable, desc: 'Drop a table' },
  'show-types': { fn: cmdShowTypes, desc: 'List registered types' },
  aggregate: { fn: cmdAggregate, desc: 'Group-by aggregation' },
};
