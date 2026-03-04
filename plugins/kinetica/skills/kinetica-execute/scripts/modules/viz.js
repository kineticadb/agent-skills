'use strict';

/**
 * Visualization module for the Kinetica CLI (Node.js).
 *
 * Provides 5 commands: chart, heatmap, isochrone, classbreak, wms.
 *
 * Each export follows the category module contract:
 *   { fn: async (db, args) => void, desc: string }
 */

const fs = require('fs');
const { die, out, parseCsvArg } = require('./helpers');

// ---------------------------------------------------------------------------
// Image output helpers
// ---------------------------------------------------------------------------

/**
 * Write image data to file or report its length.
 * Auto-detects whether image_data is raw binary (PNG header) or base64-encoded.
 * @param {object} resp - Kinetica API response containing image_data
 * @param {string|undefined} outputPath - File path to write the image to
 */
function handleImageOutput(resp, outputPath) {
  const imageData = resp.image_data || '';
  if (outputPath) {
    // Detect raw binary PNG (starts with \x89PNG) vs base64
    const isRawBinary = imageData.length >= 4 &&
      imageData.charCodeAt(0) === 0x89 &&
      imageData.slice(1, 4) === 'PNG';
    const decoded = isRawBinary
      ? Buffer.from(imageData, 'binary')
      : Buffer.from(imageData, 'base64');
    fs.writeFileSync(outputPath, decoded);
    out({
      status: 'ok',
      output: outputPath,
      size_bytes: decoded.length,
    });
  } else {
    out({
      status: 'ok',
      image_data_length: imageData.length,
    });
  }
}

/**
 * Write raw binary image data to file or report its size.
 * Used by WMS-based commands (heatmap, classbreak, wms).
 * @param {Buffer} buffer - Raw PNG bytes from WMS
 * @param {string|undefined} outputPath - File path to write the image to
 */
function handleBinaryImageOutput(buffer, outputPath) {
  if (outputPath) {
    fs.writeFileSync(outputPath, buffer);
    out({
      status: 'ok',
      output: outputPath,
      size_bytes: buffer.length,
    });
  } else {
    out({
      status: 'ok',
      size_bytes: buffer.length,
    });
  }
}

// ---------------------------------------------------------------------------
// WMS parameter builder
// ---------------------------------------------------------------------------

/**
 * Build a flat WMS parameter object with sensible defaults.
 * @param {object} opts - Structured options
 * @param {string} opts.table - LAYERS value (table name)
 * @param {string} [opts.styles] - WMS STYLES value (e.g. 'heatmap', 'cb_raster')
 * @param {string} [opts.srs='EPSG:4326'] - Spatial reference system
 * @param {number} [opts.minX=-180] - Bounding box min X
 * @param {number} [opts.minY=-90] - Bounding box min Y
 * @param {number} [opts.maxX=180] - Bounding box max X
 * @param {number} [opts.maxY=90] - Bounding box max Y
 * @param {number} [opts.width=800] - Image width
 * @param {number} [opts.height=600] - Image height
 * @param {string} [opts.xAttr] - X attribute column
 * @param {string} [opts.yAttr] - Y attribute column
 * @param {object} [opts.extra={}] - Additional WMS params merged last
 * @returns {object} Flat WMS parameter dict
 */
function buildWmsParams(opts) {
  const params = {
    REQUEST: 'GetMap',
    FORMAT: 'image/png',
    SRS: opts.srs || 'EPSG:4326',
    LAYERS: opts.table,
    BBOX: [
      opts.minX != null ? opts.minX : -180,
      opts.minY != null ? opts.minY : -90,
      opts.maxX != null ? opts.maxX : 180,
      opts.maxY != null ? opts.maxY : 90,
    ].join(','),
    WIDTH: opts.width || 800,
    HEIGHT: opts.height || 600,
  };

  if (opts.styles) params.STYLES = opts.styles;
  if (opts.xAttr) params.X_ATTR = opts.xAttr;
  if (opts.yAttr) params.Y_ATTR = opts.yAttr;

  return { ...params, ...(opts.extra || {}) };
}

// ---------------------------------------------------------------------------
// Config file loader
// ---------------------------------------------------------------------------

/**
 * Load a JSON config from a @file path or inline string.
 * @param {string} configArg - Either "@path/to/file.json" or inline JSON
 * @returns {object} Parsed config object
 */
function loadConfig(configArg) {
  if (!configArg) {
    die('--config is required (e.g. --config @file.json or inline JSON)');
  }

  if (configArg.startsWith('@')) {
    const filePath = configArg.slice(1);
    if (!fs.existsSync(filePath)) {
      die(`Config file not found: ${filePath}`);
    }
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      die(`Invalid JSON in config file ${filePath}: ${err.message}`);
    }
  }

  try {
    return JSON.parse(configArg);
  } catch (err) {
    die(`Invalid inline JSON config: ${err.message}`);
  }

  // Unreachable, but keeps linters happy
  return {};
}

// ---------------------------------------------------------------------------
// chart
// ---------------------------------------------------------------------------

async function cmdChart(db, args) {
  const tableName = args.positional[0];
  if (!tableName) {
    die(
      'Usage: viz chart <table> --x-column COL --y-column COL ' +
        '[--type line|bar|scatter] [--min-x N --max-x N --min-y N --max-y N] ' +
        '[--width 800] [--height 600] [--bg-color FFFFFF] [--output file.png]'
    );
  }

  const xColumn = args.flags['x-column'];
  const yColumn = args.flags['y-column'];
  if (!xColumn || !yColumn) {
    die('--x-column and --y-column are required');
  }

  const chartType = args.flags.type || 'line';
  const minX = parseFloat(args.flags['min-x'] || '0');
  const maxX = parseFloat(args.flags['max-x'] || '0');
  const minY = parseFloat(args.flags['min-y'] || '0');
  const maxY = parseFloat(args.flags['max-y'] || '0');
  const width = parseInt(args.flags.width || '800', 10);
  const height = parseInt(args.flags.height || '600', 10);
  const bgColor = args.flags['bg-color'] || 'FFFFFF';

  const styleOptions = { chart_type: chartType };

  const resp = await db.visualize_image_chart(
    tableName,
    [xColumn],
    [yColumn],
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    bgColor,
    styleOptions,
    {}
  );

  handleImageOutput(resp, args.flags.output);
}

// ---------------------------------------------------------------------------
// heatmap (WMS-based)
// ---------------------------------------------------------------------------

async function cmdHeatmap(db, args) {
  const tableName = args.positional[0];
  if (!tableName) {
    die(
      'Usage: viz heatmap <table> --x-col COL --y-col COL ' +
        '[--value-col COL] [--srs EPSG:4326] [--blur-radius 5] [--colormap jet] ' +
        '[--min-x N --max-x N --min-y N --max-y N] ' +
        '[--width 800] [--height 600] [--output file.png]'
    );
  }

  const xCol = args.flags['x-col'];
  const yCol = args.flags['y-col'];
  if (!xCol || !yCol) {
    die('--x-col and --y-col are required');
  }

  const extra = {};
  const valueCol = args.flags['value-col'];
  if (valueCol) extra.VALUE_ATTR = valueCol;

  const blurRadius = args.flags['blur-radius'];
  if (blurRadius) extra.BLUR_RADIUS = blurRadius;

  const colormap = args.flags.colormap;
  if (colormap) extra.COLORMAP = colormap;

  const params = buildWmsParams({
    table: tableName,
    styles: 'heatmap',
    srs: args.flags.srs || 'EPSG:4326',
    minX: parseFloat(args.flags['min-x'] || '-180'),
    minY: parseFloat(args.flags['min-y'] || '-90'),
    maxX: parseFloat(args.flags['max-x'] || '180'),
    maxY: parseFloat(args.flags['max-y'] || '90'),
    width: parseInt(args.flags.width || '800', 10),
    height: parseInt(args.flags.height || '600', 10),
    xAttr: xCol,
    yAttr: yCol,
    extra,
  });

  const buffer = await db.wms_request(params);
  handleBinaryImageOutput(buffer, args.flags.output);
}

// ---------------------------------------------------------------------------
// isochrone
// ---------------------------------------------------------------------------

async function cmdIsochrone(db, args) {
  const graphName = args.positional[0];
  if (!graphName) {
    die(
      'Usage: viz isochrone <graph> --source NODE ' +
        '[--max-radius N] [--num-levels N] [--levels-table NAME] [--output file.png]'
    );
  }

  const sourceNode = args.flags.source;
  if (!sourceNode) {
    die('--source is required');
  }

  const maxRadius = parseFloat(args.flags['max-radius'] || '100');
  const numLevels = parseInt(args.flags['num-levels'] || '4', 10);
  const levelsTable = args.flags['levels-table'] || '';
  const weightsOnEdges = parseCsvArg(args.flags['weights-on-edges']);
  const restrictions = parseCsvArg(args.flags.restrictions);
  const outputPath = args.flags.output;

  // Generate image only when --output is provided or no levels-table
  const generateImage = Boolean(outputPath) || !levelsTable;

  const resp = await db.visualize_isochrone(
    graphName,
    sourceNode,
    maxRadius,
    weightsOnEdges,
    restrictions,
    numLevels,
    generateImage,
    levelsTable,
    {},
    {},
    {},
    {}
  );

  if (generateImage) {
    handleImageOutput(resp, outputPath);
  } else {
    out({
      status: 'ok',
      levels_table: levelsTable,
    });
  }
}

// ---------------------------------------------------------------------------
// classbreak (WMS-based)
// ---------------------------------------------------------------------------

function buildClassbreakParams(config) {
  const base = buildWmsParams({
    table: config.table || config.LAYERS,
    styles: 'cb_raster',
    srs: config.srs || config.SRS,
    minX: config.min_x,
    minY: config.min_y,
    maxX: config.max_x,
    maxY: config.max_y,
    width: config.width || config.WIDTH,
    height: config.height || config.HEIGHT,
    xAttr: config.x_attr,
    yAttr: config.y_attr,
    extra: config.BBOX ? { BBOX: config.BBOX } : {},
  });

  if (!base.LAYERS) die('Config must include "LAYERS" or "table"');

  // Pass through uppercase WMS keys not already set
  const passthrough = {};
  for (const [key, val] of Object.entries(config)) {
    if (key === key.toUpperCase() && !base[key]) passthrough[key] = val;
  }
  return { ...base, ...passthrough };
}

async function cmdClassbreak(db, args) {
  const configArg = args.flags.config;
  const config = loadConfig(configArg);
  const outputPath = args.flags.output;

  const params = buildClassbreakParams(config);
  const buffer = await db.wms_request(params);
  handleBinaryImageOutput(buffer, outputPath);
}

// ---------------------------------------------------------------------------
// wms (general-purpose WMS command)
// ---------------------------------------------------------------------------

async function cmdWms(db, args) {
  const configArg = args.flags.config;
  const config = loadConfig(configArg);
  const outputPath = args.flags.output;

  // Apply defaults, then merge user config
  const params = {
    REQUEST: 'GetMap',
    FORMAT: 'image/png',
    SRS: 'EPSG:4326',
    WIDTH: 800,
    HEIGHT: 600,
    ...config,
  };

  if (!params.LAYERS) {
    die('Config must include "LAYERS" (table name)');
  }
  if (!params.BBOX) {
    die('Config must include "BBOX" (e.g. "-180,-90,180,90")');
  }

  const buffer = await db.wms_request(params);
  handleBinaryImageOutput(buffer, outputPath);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  chart: {
    fn: cmdChart,
    desc: 'Generate a chart image (line, bar, scatter, etc.)',
  },
  heatmap: {
    fn: cmdHeatmap,
    desc: 'Generate a heatmap image via WMS',
  },
  isochrone: {
    fn: cmdIsochrone,
    desc: 'Generate isochrone contours from a graph',
  },
  classbreak: {
    fn: cmdClassbreak,
    desc: 'Generate a class-break visualization via WMS',
  },
  wms: {
    fn: cmdWms,
    desc: 'Send a custom WMS request and save the image',
  },
};
