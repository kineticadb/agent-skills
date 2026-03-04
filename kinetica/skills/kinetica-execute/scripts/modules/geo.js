'use strict';

/**
 * Geospatial filtering commands for the Kinetica CLI (Node.js).
 *
 * Provides six filter commands that create server-side views:
 *   filter-by-radius, filter-by-box, filter-by-area,
 *   filter-by-geometry, filter-by-range, filter-by-string.
 *
 * Each command returns {"count": N, "view_name": "..."} on success.
 */

const { die, out, parseCsvArg, parseFloatCsv } = require('./helpers');

// ---------------------------------------------------------------------------
// Valid operations / modes (used for input validation)
// ---------------------------------------------------------------------------

const GEOMETRY_OPERATIONS = new Set([
  'contains',
  'crosses',
  'disjoint',
  'equals',
  'intersects',
  'overlaps',
  'touches',
  'within',
]);

const STRING_MODES = new Set([
  'search',
  'equals',
  'contains',
  'starts_with',
  'regex',
]);

// ---------------------------------------------------------------------------
// Result helper
// ---------------------------------------------------------------------------

/**
 * Extract count and view_name from a successful filter response.
 * @param {object} resp - Kinetica API response
 * @returns {{ count: number, view_name: string }}
 */
function filterResult(resp) {
  const info = resp.info || {};
  return {
    count: resp.count || 0,
    view_name: info.qualified_result_table_name || '',
  };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdFilterByRadius(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: geo filter-by-radius <table> --x-col COL --y-col COL '
      + '--center-x N --center-y N --radius N [--view-name NAME]');
  }

  const xCol = args.flags['x-col'];
  const yCol = args.flags['y-col'];
  const centerX = parseFloat(args.flags['center-x']);
  const centerY = parseFloat(args.flags['center-y']);
  const radius = parseFloat(args.flags['radius']);

  if (!xCol) die('--x-col is required');
  if (!yCol) die('--y-col is required');
  if (isNaN(centerX)) die('--center-x must be a number');
  if (isNaN(centerY)) die('--center-y must be a number');
  if (isNaN(radius)) die('--radius must be a number');

  const viewName = args.flags['view-name'] || '';

  const resp = await db.filter_by_radius(
    table, viewName, xCol, centerX, yCol, centerY, radius, {}
  );

  out(filterResult(resp));
}

async function cmdFilterByBox(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: geo filter-by-box <table> --x-col COL --y-col COL '
      + '--min-x N --max-x N --min-y N --max-y N [--view-name NAME]');
  }

  const xCol = args.flags['x-col'];
  const yCol = args.flags['y-col'];
  const minX = parseFloat(args.flags['min-x']);
  const maxX = parseFloat(args.flags['max-x']);
  const minY = parseFloat(args.flags['min-y']);
  const maxY = parseFloat(args.flags['max-y']);

  if (!xCol) die('--x-col is required');
  if (!yCol) die('--y-col is required');
  if (isNaN(minX)) die('--min-x must be a number');
  if (isNaN(maxX)) die('--max-x must be a number');
  if (isNaN(minY)) die('--min-y must be a number');
  if (isNaN(maxY)) die('--max-y must be a number');

  const viewName = args.flags['view-name'] || '';

  const resp = await db.filter_by_box(
    table, viewName, xCol, minX, maxX, yCol, minY, maxY, {}
  );

  out(filterResult(resp));
}

async function cmdFilterByArea(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: geo filter-by-area <table> --x-col COL --y-col COL '
      + '--x-vertices N,N,N --y-vertices N,N,N [--view-name NAME]');
  }

  const xCol = args.flags['x-col'];
  const yCol = args.flags['y-col'];

  if (!xCol) die('--x-col is required');
  if (!yCol) die('--y-col is required');

  const xVertices = parseFloatCsv(args.flags['x-vertices']);
  const yVertices = parseFloatCsv(args.flags['y-vertices']);

  if (xVertices.length === 0 || yVertices.length === 0) {
    die('--x-vertices and --y-vertices must be comma-separated numbers');
  }
  if (xVertices.length !== yVertices.length) {
    die('--x-vertices and --y-vertices must have the same number of values');
  }

  const viewName = args.flags['view-name'] || '';

  const resp = await db.filter_by_area(
    table, viewName, xCol, xVertices, yCol, yVertices, {}
  );

  out(filterResult(resp));
}

async function cmdFilterByGeometry(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: geo filter-by-geometry <table> --column COL --wkt WKT '
      + '--operation intersects [--view-name NAME]');
  }

  const column = args.flags['column'];
  const wkt = args.flags['wkt'];
  const operation = args.flags['operation'];

  if (!column) die('--column is required');
  if (!wkt) die('--wkt is required');
  if (!operation) die('--operation is required');

  if (!GEOMETRY_OPERATIONS.has(operation)) {
    die(`Invalid operation '${operation}'. `
      + `Must be one of: ${[...GEOMETRY_OPERATIONS].sort().join(', ')}`);
  }

  const viewName = args.flags['view-name'] || '';

  const resp = await db.filter_by_geometry(
    table, viewName, column, wkt, operation, {}
  );

  out(filterResult(resp));
}

async function cmdFilterByRange(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: geo filter-by-range <table> --column COL '
      + '--lower N --upper N [--view-name NAME]');
  }

  const column = args.flags['column'];
  const lower = parseFloat(args.flags['lower']);
  const upper = parseFloat(args.flags['upper']);

  if (!column) die('--column is required');
  if (isNaN(lower)) die('--lower must be a number');
  if (isNaN(upper)) die('--upper must be a number');

  const viewName = args.flags['view-name'] || '';

  const resp = await db.filter_by_range(
    table, viewName, column, lower, upper, {}
  );

  out(filterResult(resp));
}

async function cmdFilterByString(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: geo filter-by-string <table> --expression EXPR '
      + '--mode contains --columns col1,col2 [--view-name NAME]');
  }

  const expression = args.flags['expression'];
  const mode = args.flags['mode'];
  const columnsRaw = args.flags['columns'];

  if (!expression) die('--expression is required');
  if (!mode) die('--mode is required');
  if (!columnsRaw) die('--columns is required (comma-separated column names)');

  if (!STRING_MODES.has(mode)) {
    die(`Invalid mode '${mode}'. `
      + `Must be one of: ${[...STRING_MODES].sort().join(', ')}`);
  }

  const columns = parseCsvArg(columnsRaw);
  if (columns.length === 0) {
    die('--columns must contain at least one column name');
  }

  const viewName = args.flags['view-name'] || '';

  const resp = await db.filter_by_string(
    table, viewName, expression, mode, columns, {}
  );

  out(filterResult(resp));
}

// ---------------------------------------------------------------------------
// Exports -- consumed by the dispatcher
// ---------------------------------------------------------------------------

module.exports = {
  'filter-by-radius': {
    fn: cmdFilterByRadius,
    desc: 'Filter records within a radius of a point',
  },
  'filter-by-box': {
    fn: cmdFilterByBox,
    desc: 'Filter records within a bounding box',
  },
  'filter-by-area': {
    fn: cmdFilterByArea,
    desc: 'Filter records within a polygon area',
  },
  'filter-by-geometry': {
    fn: cmdFilterByGeometry,
    desc: 'Filter records by WKT geometry and spatial operation',
  },
  'filter-by-range': {
    fn: cmdFilterByRange,
    desc: 'Filter records within a numeric range',
  },
  'filter-by-string': {
    fn: cmdFilterByString,
    desc: 'Filter records by string matching',
  },
};
