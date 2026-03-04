'use strict';

/**
 * Graph module for the Kinetica CLI (Node.js).
 *
 * Provides 6 commands: create, solve, query, match, delete, show.
 *
 * Each export follows the category module contract:
 *   { fn: async (db, args) => void, desc: string }
 */

const { die, out, parseCsvArg } = require('./helpers');

// ---------------------------------------------------------------------------
// Solver-type constants
// ---------------------------------------------------------------------------

const SOLVER_TYPES = [
  'SHORTEST_PATH',
  'PAGE_RANK',
  'PROBABILITY_RANK',
  'CENTRALITY',
  'MULTIPLE_ROUTING',
  'ALLPATHS',
  'INVERSE_SHORTEST_PATH',
  'BACKHAUL_ROUTING',
  'TSP',
  'CLOSENESS',
];

const SOLVE_METHODS = [
  'markov_chain',
  'match_od_pairs',
  'match_supply_demand',
  'match_batch_solves',
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function requireGraphName(args, action) {
  const name = args.positional[0];
  if (!name) {
    die(`Usage: graph ${action} <graph_name> [options]`);
  }
  return name;
}

function validateChoice(value, choices, label) {
  if (value && !choices.includes(value)) {
    die(`Invalid ${label}: '${value}'. Must be one of: ${choices.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

async function cmdCreate(db, args) {
  const graphName = requireGraphName(args, 'create');

  const nodes = parseCsvArg(args.flags.nodes);
  const edges = parseCsvArg(args.flags.edges);
  const weights = parseCsvArg(args.flags.weights);
  const restrictions = parseCsvArg(args.flags.restrictions);
  const directed = args.flags.directed === true || args.flags.directed === 'true';

  const options = {};
  if (args.flags.recreate) {
    options.recreate = 'true';
  }
  if (args.flags.persist) {
    options.save_persist = 'true';
  }

  const resp = await db.create_graph(
    graphName,
    directed,
    nodes,
    edges,
    weights,
    restrictions,
    options
  );

  out({
    graph_name: graphName,
    status: 'ok',
    directed,
    num_nodes: resp.num_nodes || 0,
    num_edges: resp.num_edges || 0,
  });
}

// ---------------------------------------------------------------------------
// solve
// ---------------------------------------------------------------------------

async function cmdSolve(db, args) {
  const graphName = requireGraphName(args, 'solve');

  const solverType = args.flags['solver-type'] || 'SHORTEST_PATH';
  validateChoice(solverType, SOLVER_TYPES, 'solver-type');

  const weightsOnEdges = parseCsvArg(args.flags['weights-on-edges']);
  const restrictions = parseCsvArg(args.flags.restrictions);
  const sourceNodes = parseCsvArg(args.flags['source-nodes']);
  const destNodes = parseCsvArg(args.flags['dest-nodes']);
  const solutionTable = args.flags['solution-table'] || '';

  const options = {};
  if (args.flags['max-solution-targets'] !== undefined) {
    options.max_solution_targets = String(args.flags['max-solution-targets']);
  }
  if (args.flags['output-wkt']) {
    options.output_wkt_path = 'true';
  }
  if (args.flags['output-edge-path']) {
    options.output_edge_path = 'true';
  }

  const resp = await db.solve_graph(
    graphName,
    weightsOnEdges,
    restrictions,
    solverType,
    sourceNodes,
    destNodes,
    solutionTable,
    options
  );

  out({
    graph_name: graphName,
    status: 'ok',
    solver_type: solverType,
    solution_table: solutionTable,
    result: resp.result || {},
  });
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

async function cmdQuery(db, args) {
  const graphName = requireGraphName(args, 'query');

  const queries = parseCsvArg(args.flags.queries);
  const restrictions = parseCsvArg(args.flags.restrictions);
  const adjacencyTable = args.flags['adjacency-table'] || '';
  const rings = parseInt(args.flags.rings || '1', 10);

  const options = {};
  if (args.flags['force-undirected']) {
    options.force_undirected = 'true';
  }
  if (args.flags.limit !== undefined) {
    options.limit = String(args.flags.limit);
  }
  if (args.flags['output-wkt']) {
    options.output_wkt_path = 'true';
  }

  const resp = await db.query_graph(
    graphName,
    queries,
    restrictions,
    adjacencyTable,
    rings,
    options
  );

  out({
    graph_name: graphName,
    status: 'ok',
    adjacency_table: adjacencyTable,
    rings,
    result: resp.result || {},
  });
}

// ---------------------------------------------------------------------------
// match
// ---------------------------------------------------------------------------

async function cmdMatch(db, args) {
  const graphName = requireGraphName(args, 'match');

  const samplePoints = parseCsvArg(args.flags['sample-points']);
  const solveMethod = args.flags['solve-method'] || 'markov_chain';
  validateChoice(solveMethod, SOLVE_METHODS, 'solve-method');
  const solutionTable = args.flags['solution-table'] || '';

  const resp = await db.match_graph(
    graphName,
    samplePoints,
    solveMethod,
    solutionTable,
    {}
  );

  out({
    graph_name: graphName,
    status: 'ok',
    solve_method: solveMethod,
    solution_table: solutionTable,
    result: resp.result || {},
  });
}

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

async function cmdDelete(db, args) {
  const graphName = requireGraphName(args, 'delete');

  const options = {};
  if (args.flags['delete-persist']) {
    options.delete_persist = 'true';
  }

  await db.delete_graph(graphName, options);

  out({
    graph_name: graphName,
    status: 'ok',
    message: `Graph '${graphName}' deleted`,
  });
}

// ---------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------

async function cmdShow(db, args) {
  const graphName = args.positional[0] || '';

  const resp = await db.show_graph(graphName, {});

  const graphNames = resp.graph_names || [];
  const directed = resp.directed || [];
  const numNodes = resp.num_nodes || [];
  const numEdges = resp.num_edges || [];
  const info = resp.info || [];

  const graphs = graphNames.map((name, i) => ({
    graph_name: name,
    directed: i < directed.length ? directed[i] : null,
    num_nodes: i < numNodes.length ? numNodes[i] : null,
    num_edges: i < numEdges.length ? numEdges[i] : null,
    info: i < info.length ? info[i] : null,
  }));

  out({ graphs, total: graphs.length });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  create: { fn: cmdCreate, desc: 'Create a graph from table data' },
  solve: { fn: cmdSolve, desc: 'Run a solver on a graph (shortest path, page rank, etc.)' },
  query: { fn: cmdQuery, desc: 'Query graph adjacency or connectivity' },
  match: { fn: cmdMatch, desc: 'Match sample points to a graph' },
  delete: { fn: cmdDelete, desc: 'Delete a graph' },
  show: { fn: cmdShow, desc: 'Show graph details or list all graphs' },
};
