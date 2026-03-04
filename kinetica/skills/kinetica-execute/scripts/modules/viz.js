'use strict';

/**
 * Visualization module for the Kinetica CLI (Node.js).
 *
 * Provides 4 commands: chart, heatmap, isochrone, classbreak.
 *
 * Each export follows the category module contract:
 *   { fn: async (db, args) => void, desc: string }
 */

const fs = require('fs');
const { die, out, parseCsvArg } = require('./helpers');

// ---------------------------------------------------------------------------
// Image output helper
// ---------------------------------------------------------------------------

/**
 * Write decoded base64 image to file or report its length.
 * @param {object} resp - Kinetica API response containing image_data
 * @param {string|undefined} outputPath - File path to write the image to
 */
function handleImageOutput(resp, outputPath) {
  const imageData = resp.image_data || '';
  if (outputPath) {
    const decoded = Buffer.from(imageData, 'base64');
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
// heatmap
// ---------------------------------------------------------------------------

async function cmdHeatmap(db, args) {
  const tableName = args.positional[0];
  if (!tableName) {
    die(
      'Usage: viz heatmap <table> --x-col COL --y-col COL ' +
        '[--value-col COL] [--min-x N --max-x N --min-y N --max-y N] ' +
        '[--width 800] [--height 600] [--output file.png]'
    );
  }

  const xCol = args.flags['x-col'];
  const yCol = args.flags['y-col'];
  if (!xCol || !yCol) {
    die('--x-col and --y-col are required');
  }

  const valueCol = args.flags['value-col'] || '';
  const geometryCol = args.flags['geometry-col'] || '';
  const minX = parseFloat(args.flags['min-x'] || '-180');
  const maxX = parseFloat(args.flags['max-x'] || '180');
  const minY = parseFloat(args.flags['min-y'] || '-90');
  const maxY = parseFloat(args.flags['max-y'] || '90');
  const width = parseInt(args.flags.width || '800', 10);
  const height = parseInt(args.flags.height || '600', 10);
  const projection = args.flags.projection || 'PLATE_CARREE';

  const resp = await db.visualize_image_heatmap(
    [tableName],
    xCol,
    yCol,
    valueCol,
    geometryCol,
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    projection,
    {},
    {}
  );

  handleImageOutput(resp, args.flags.output);
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
// classbreak
// ---------------------------------------------------------------------------

async function cmdClassbreak(db, args) {
  const configArg = args.flags.config;
  const config = loadConfig(configArg);
  const outputPath = args.flags.output;

  const resp = await db.visualize_image_classbreak(config);

  handleImageOutput(resp, outputPath);
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
    desc: 'Generate a heatmap image from table data',
  },
  isochrone: {
    fn: cmdIsochrone,
    desc: 'Generate isochrone contours from a graph',
  },
  classbreak: {
    fn: cmdClassbreak,
    desc: 'Generate a class-break visualization from JSON config',
  },
};
