"""Graph module for the Kinetica CLI (Python).

Provides 6 commands: create, solve, query, match, delete, show.

Each command follows the category module contract:
    COMMANDS = { "name": {"fn": callable, "desc": str, "build_args": callable} }
"""

from modules.helpers import check_status, die, out, parse_csv_arg, parse_float_csv


# ---------------------------------------------------------------------------
# Solver-type constants
# ---------------------------------------------------------------------------

SOLVER_TYPES = [
    "SHORTEST_PATH",
    "PAGE_RANK",
    "PROBABILITY_RANK",
    "CENTRALITY",
    "MULTIPLE_ROUTING",
    "ALLPATHS",
    "INVERSE_SHORTEST_PATH",
    "BACKHAUL_ROUTING",
    "TSP",
    "CLOSENESS",
]

SOLVE_METHODS = [
    "markov_chain",
    "match_od_pairs",
    "match_supply_demand",
    "match_batch_solves",
]


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------

def _build_create_args(parser):
    parser.add_argument("graph_name", help="Name for the new graph")
    parser.add_argument(
        "--directed", action="store_true", default=False,
        help="Create a directed graph (default: undirected)",
    )
    parser.add_argument("--nodes", default="", help="Comma-separated node identifiers")
    parser.add_argument("--edges", default="", help="Comma-separated edge identifiers")
    parser.add_argument("--weights", default="", help="Comma-separated weight identifiers")
    parser.add_argument("--restrictions", default="", help="Comma-separated restriction identifiers")
    parser.add_argument(
        "--recreate", action="store_true", default=False,
        help="Drop and recreate if the graph already exists",
    )
    parser.add_argument(
        "--persist", action="store_true", default=False,
        help="Save graph to persist across restarts",
    )


def cmd_create(db, args):
    graph_name = args.graph_name
    if not graph_name:
        die("Usage: graph create <graph_name> [--edges ...] [--nodes ...] [--weights ...] [--restrictions ...] [--directed] [--recreate] [--persist]")

    nodes = parse_csv_arg(args.nodes)
    edges = parse_csv_arg(args.edges)
    weights = parse_csv_arg(args.weights)
    restrictions = parse_csv_arg(args.restrictions)

    options = {}
    if args.recreate:
        options["recreate"] = "true"
    if args.persist:
        options["save_persist"] = "true"

    resp = db.create_graph(
        graph_name=graph_name,
        directed_graph=args.directed,
        nodes=nodes,
        edges=edges,
        weights=weights,
        restrictions=restrictions,
        options=options,
    )
    check_status(resp, "create_graph")

    out({
        "graph_name": graph_name,
        "status": "ok",
        "directed": args.directed,
        "num_nodes": resp.get("num_nodes", 0),
        "num_edges": resp.get("num_edges", 0),
    })


# ---------------------------------------------------------------------------
# solve
# ---------------------------------------------------------------------------

def _build_solve_args(parser):
    parser.add_argument("graph_name", help="Name of the graph to solve")
    parser.add_argument(
        "--solver-type", dest="solver_type", default="SHORTEST_PATH",
        choices=SOLVER_TYPES,
        help="Solver algorithm (default: SHORTEST_PATH)",
    )
    parser.add_argument("--source-nodes", dest="source_nodes", default="", help="Comma-separated source node IDs")
    parser.add_argument("--dest-nodes", dest="dest_nodes", default="", help="Comma-separated destination node IDs")
    parser.add_argument("--solution-table", dest="solution_table", default="", help="Output table name for results")
    parser.add_argument("--weights-on-edges", dest="weights_on_edges", default="", help="Comma-separated weight identifiers")
    parser.add_argument("--restrictions", default="", help="Comma-separated restriction identifiers")
    parser.add_argument("--max-solution-targets", dest="max_solution_targets", default=None, help="Max targets to return")
    parser.add_argument("--output-wkt", dest="output_wkt", action="store_true", default=False, help="Include WKT path in output")
    parser.add_argument("--output-edge-path", dest="output_edge_path", action="store_true", default=False, help="Include edge path in output")


def cmd_solve(db, args):
    graph_name = args.graph_name
    if not graph_name:
        die("Usage: graph solve <graph_name> [--solver-type TYPE] [--source-nodes ...] [--dest-nodes ...] [--solution-table TABLE]")

    weights_on_edges = parse_csv_arg(args.weights_on_edges)
    restrictions = parse_csv_arg(args.restrictions)
    source_nodes = parse_csv_arg(args.source_nodes)
    dest_nodes = parse_csv_arg(args.dest_nodes)

    options = {}
    if args.max_solution_targets is not None:
        options["max_solution_targets"] = args.max_solution_targets
    if args.output_wkt:
        options["output_wkt_path"] = "true"
    if args.output_edge_path:
        options["output_edge_path"] = "true"

    resp = db.solve_graph(
        graph_name=graph_name,
        weights_on_edges=weights_on_edges,
        restrictions=restrictions,
        solver_type=args.solver_type,
        source_nodes=source_nodes,
        destination_nodes=dest_nodes,
        solution_table=args.solution_table,
        options=options,
    )
    check_status(resp, "solve_graph")

    out({
        "graph_name": graph_name,
        "status": "ok",
        "solver_type": args.solver_type,
        "solution_table": args.solution_table,
        "result": resp.get("result", {}),
    })


# ---------------------------------------------------------------------------
# query
# ---------------------------------------------------------------------------

def _build_query_args(parser):
    parser.add_argument("graph_name", help="Name of the graph to query")
    parser.add_argument("--queries", default="", help="Comma-separated query identifiers")
    parser.add_argument("--restrictions", default="", help="Comma-separated restriction identifiers")
    parser.add_argument("--adjacency-table", dest="adjacency_table", default="", help="Output adjacency table name")
    parser.add_argument("--rings", type=int, default=1, help="Number of rings (hops) for adjacency (default: 1)")
    parser.add_argument("--force-undirected", dest="force_undirected", action="store_true", default=False, help="Treat graph as undirected")
    parser.add_argument("--limit", type=int, default=None, help="Max results to return")
    parser.add_argument("--output-wkt", dest="output_wkt", action="store_true", default=False, help="Include WKT path in output")


def cmd_query(db, args):
    graph_name = args.graph_name
    if not graph_name:
        die("Usage: graph query <graph_name> [--queries ...] [--adjacency-table TABLE] [--rings N]")

    queries = parse_csv_arg(args.queries)
    restrictions = parse_csv_arg(args.restrictions)

    options = {}
    if args.force_undirected:
        options["force_undirected"] = "true"
    if args.limit is not None:
        options["limit"] = str(args.limit)
    if args.output_wkt:
        options["output_wkt_path"] = "true"

    resp = db.query_graph(
        graph_name=graph_name,
        queries=queries,
        restrictions=restrictions,
        adjacency_table=args.adjacency_table,
        rings=args.rings,
        options=options,
    )
    check_status(resp, "query_graph")

    out({
        "graph_name": graph_name,
        "status": "ok",
        "adjacency_table": args.adjacency_table,
        "rings": args.rings,
        "result": resp.get("result", {}),
    })


# ---------------------------------------------------------------------------
# match
# ---------------------------------------------------------------------------

def _build_match_args(parser):
    parser.add_argument("graph_name", help="Name of the graph to match against")
    parser.add_argument("--sample-points", dest="sample_points", default="", help="Comma-separated sample point identifiers")
    parser.add_argument(
        "--solve-method", dest="solve_method", default="markov_chain",
        choices=SOLVE_METHODS,
        help="Solve method (default: markov_chain)",
    )
    parser.add_argument("--solution-table", dest="solution_table", default="", help="Output table name for results")


def cmd_match(db, args):
    graph_name = args.graph_name
    if not graph_name:
        die("Usage: graph match <graph_name> [--sample-points ...] [--solve-method METHOD] [--solution-table TABLE]")

    sample_points = parse_csv_arg(args.sample_points)

    resp = db.match_graph(
        graph_name=graph_name,
        sample_points=sample_points,
        solve_method=args.solve_method,
        solution_table=args.solution_table,
        options={},
    )
    check_status(resp, "match_graph")

    out({
        "graph_name": graph_name,
        "status": "ok",
        "solve_method": args.solve_method,
        "solution_table": args.solution_table,
        "result": resp.get("result", {}),
    })


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------

def _build_delete_args(parser):
    parser.add_argument("graph_name", help="Name of the graph to delete")
    parser.add_argument(
        "--delete-persist", dest="delete_persist", action="store_true",
        default=False, help="Also remove persisted graph data",
    )


def cmd_delete(db, args):
    graph_name = args.graph_name
    if not graph_name:
        die("Usage: graph delete <graph_name> [--delete-persist]")

    options = {}
    if args.delete_persist:
        options["delete_persist"] = "true"

    resp = db.delete_graph(
        graph_name=graph_name,
        options=options,
    )
    check_status(resp, "delete_graph")

    out({
        "graph_name": graph_name,
        "status": "ok",
        "message": f"Graph '{graph_name}' deleted",
    })


# ---------------------------------------------------------------------------
# show
# ---------------------------------------------------------------------------

def _build_show_args(parser):
    parser.add_argument(
        "graph_name", nargs="?", default="",
        help="Graph name to show details for (omit to list all)",
    )


def cmd_show(db, args):
    graph_name = args.graph_name or ""

    resp = db.show_graph(
        graph_name=graph_name,
        options={},
    )
    check_status(resp, "show_graph")

    graph_names = resp.get("graph_names", [])
    directed = resp.get("directed", [])
    num_nodes = resp.get("num_nodes", [])
    num_edges = resp.get("num_edges", [])
    info = resp.get("info", [])

    graphs = []
    for i, name in enumerate(graph_names):
        graphs.append({
            "graph_name": name,
            "directed": directed[i] if i < len(directed) else None,
            "num_nodes": num_nodes[i] if i < len(num_nodes) else None,
            "num_edges": num_edges[i] if i < len(num_edges) else None,
            "info": info[i] if i < len(info) else None,
        })

    out({"graphs": graphs, "total": len(graphs)})


# ---------------------------------------------------------------------------
# COMMANDS dict
# ---------------------------------------------------------------------------

COMMANDS = {
    "create": {
        "fn": cmd_create,
        "desc": "Create a graph from table data",
        "build_args": _build_create_args,
    },
    "solve": {
        "fn": cmd_solve,
        "desc": "Run a solver on a graph (shortest path, page rank, etc.)",
        "build_args": _build_solve_args,
    },
    "query": {
        "fn": cmd_query,
        "desc": "Query graph adjacency or connectivity",
        "build_args": _build_query_args,
    },
    "match": {
        "fn": cmd_match,
        "desc": "Match sample points to a graph",
        "build_args": _build_match_args,
    },
    "delete": {
        "fn": cmd_delete,
        "desc": "Delete a graph",
        "build_args": _build_delete_args,
    },
    "show": {
        "fn": cmd_show,
        "desc": "Show graph details or list all graphs",
        "build_args": _build_show_args,
    },
}
