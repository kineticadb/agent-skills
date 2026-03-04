"""Visualization module for the Kinetica CLI (Python).

Provides 4 commands: chart, heatmap, isochrone, classbreak.

Each command follows the category module contract:
    COMMANDS = { "name": {"fn": callable, "desc": str, "build_args": callable} }
"""

import base64
import json

from modules.helpers import check_status, die, out


# ---------------------------------------------------------------------------
# Projection constants
# ---------------------------------------------------------------------------

PROJECTIONS = [
    "PLATE_CARREE",
    "MERCATOR",
    "900913",
    "EPSG:4326",
    "EPSG:900913",
    "102100",
    "3857",
]

CHART_TYPES = [
    "line",
    "bar",
    "scatter",
    "area",
    "stacked_bar",
    "stacked_area",
]


# ---------------------------------------------------------------------------
# Image output helper
# ---------------------------------------------------------------------------

def _handle_image_output(resp, output_path):
    """Write decoded base64 image to file or report its length."""
    image_data = resp.get("image_data", "")
    if output_path:
        decoded = base64.b64decode(image_data)
        with open(output_path, "wb") as f:
            f.write(decoded)
        out({
            "status": "ok",
            "output": output_path,
            "size_bytes": len(decoded),
        })
    else:
        out({
            "status": "ok",
            "image_data_length": len(image_data),
        })


# ---------------------------------------------------------------------------
# Config file loader
# ---------------------------------------------------------------------------

def _load_config(config_arg):
    """Load a JSON config from a @file path or inline string.

    Returns the parsed dict.  Dies on parse/read errors.
    """
    if not config_arg:
        die("--config is required (e.g. --config @file.json or inline JSON)")

    if config_arg.startswith("@"):
        file_path = config_arg[1:]
        try:
            with open(file_path) as f:
                return json.load(f)
        except FileNotFoundError:
            die(f"Config file not found: {file_path}")
        except json.JSONDecodeError as exc:
            die(f"Invalid JSON in config file {file_path}: {exc}")
    else:
        try:
            return json.loads(config_arg)
        except json.JSONDecodeError as exc:
            die(f"Invalid inline JSON config: {exc}")

    # Unreachable, but keeps linters happy
    return {}


# ---------------------------------------------------------------------------
# chart
# ---------------------------------------------------------------------------

def _build_chart_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument(
        "--x-column", dest="x_column", required=True,
        help="Column name for the X axis",
    )
    parser.add_argument(
        "--y-column", dest="y_column", required=True,
        help="Column name for the Y axis",
    )
    parser.add_argument(
        "--type", dest="chart_type", default="line", choices=CHART_TYPES,
        help="Chart type (default: line)",
    )
    parser.add_argument("--min-x", dest="min_x", type=float, default=0, help="Minimum X value")
    parser.add_argument("--max-x", dest="max_x", type=float, default=0, help="Maximum X value")
    parser.add_argument("--min-y", dest="min_y", type=float, default=0, help="Minimum Y value")
    parser.add_argument("--max-y", dest="max_y", type=float, default=0, help="Maximum Y value")
    parser.add_argument("--width", type=int, default=800, help="Image width in pixels (default: 800)")
    parser.add_argument("--height", type=int, default=600, help="Image height in pixels (default: 600)")
    parser.add_argument("--bg-color", dest="bg_color", default="FFFFFF", help="Background color hex (default: FFFFFF)")
    parser.add_argument("--output", default=None, help="Output file path for the image")


def cmd_chart(db, args):
    """Generate a chart image from table data."""
    table_name = args.table_name
    if not table_name:
        die("Usage: viz chart <table> --x-column COL --y-column COL [options]")

    style_options = {
        "chart_type": args.chart_type,
    }

    resp = db.visualize_image_chart(
        table_name=table_name,
        x_column_names=[args.x_column],
        y_column_names=[args.y_column],
        min_x=args.min_x,
        max_x=args.max_x,
        min_y=args.min_y,
        max_y=args.max_y,
        width=args.width,
        height=args.height,
        bg_color=args.bg_color,
        style_options=style_options,
        options={},
    )
    check_status(resp, "visualize_image_chart")
    _handle_image_output(resp, args.output)


# ---------------------------------------------------------------------------
# heatmap
# ---------------------------------------------------------------------------

def _build_heatmap_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument(
        "--x-col", dest="x_col", required=True,
        help="Column name for X coordinate",
    )
    parser.add_argument(
        "--y-col", dest="y_col", required=True,
        help="Column name for Y coordinate",
    )
    parser.add_argument("--value-col", dest="value_col", default="", help="Column name for the heatmap value")
    parser.add_argument("--geometry-col", dest="geometry_col", default="", help="Column name for geometry (WKT)")
    parser.add_argument("--min-x", dest="min_x", type=float, default=-180.0, help="Minimum X (default: -180)")
    parser.add_argument("--max-x", dest="max_x", type=float, default=180.0, help="Maximum X (default: 180)")
    parser.add_argument("--min-y", dest="min_y", type=float, default=-90.0, help="Minimum Y (default: -90)")
    parser.add_argument("--max-y", dest="max_y", type=float, default=90.0, help="Maximum Y (default: 90)")
    parser.add_argument("--width", type=int, default=800, help="Image width in pixels (default: 800)")
    parser.add_argument("--height", type=int, default=600, help="Image height in pixels (default: 600)")
    parser.add_argument(
        "--projection", default="PLATE_CARREE", choices=PROJECTIONS,
        help="Map projection (default: PLATE_CARREE)",
    )
    parser.add_argument("--output", default=None, help="Output file path for the image")


def cmd_heatmap(db, args):
    """Generate a heatmap image from table data."""
    table_name = args.table_name
    if not table_name:
        die("Usage: viz heatmap <table> --x-col COL --y-col COL [options]")

    resp = db.visualize_image_heatmap(
        table_names=[table_name],
        x_column_name=args.x_col,
        y_column_name=args.y_col,
        value_column_name=args.value_col,
        geometry_column_name=args.geometry_col,
        min_x=args.min_x,
        max_x=args.max_x,
        min_y=args.min_y,
        max_y=args.max_y,
        width=args.width,
        height=args.height,
        projection=args.projection,
        style_options={},
        options={},
    )
    check_status(resp, "visualize_image_heatmap")
    _handle_image_output(resp, args.output)


# ---------------------------------------------------------------------------
# isochrone
# ---------------------------------------------------------------------------

def _build_isochrone_args(parser):
    parser.add_argument("graph_name", help="Name of the graph")
    parser.add_argument(
        "--source", dest="source_node", required=True,
        help="Source node identifier",
    )
    parser.add_argument(
        "--max-radius", dest="max_radius", type=float, default=100.0,
        help="Maximum solution radius (default: 100)",
    )
    parser.add_argument("--weights-on-edges", dest="weights_on_edges", default="", help="Comma-separated weight identifiers")
    parser.add_argument("--restrictions", default="", help="Comma-separated restriction identifiers")
    parser.add_argument(
        "--num-levels", dest="num_levels", type=int, default=4,
        help="Number of contour levels (default: 4)",
    )
    parser.add_argument("--levels-table", dest="levels_table", default="", help="Output table name for contour levels")
    parser.add_argument("--output", default=None, help="Output file path for the image")


def cmd_isochrone(db, args):
    """Generate an isochrone contour from a graph."""
    graph_name = args.graph_name
    if not graph_name:
        die("Usage: viz isochrone <graph> --source NODE [options]")

    # Parse CSV lists
    weights = [w.strip() for w in args.weights_on_edges.split(",") if w.strip()] if args.weights_on_edges else []
    restrictions = [r.strip() for r in args.restrictions.split(",") if r.strip()] if args.restrictions else []

    # Generate image only when --output is provided or no levels-table
    generate_image = bool(args.output) or not args.levels_table

    resp = db.visualize_isochrone(
        graph_name=graph_name,
        source_node=args.source_node,
        max_solution_radius=args.max_radius,
        weights_on_edges=weights,
        restrictions=restrictions,
        num_levels=args.num_levels,
        generate_image=generate_image,
        levels_table=args.levels_table,
        style_options={},
        solve_options={},
        contour_options={},
        options={},
    )
    check_status(resp, "visualize_isochrone")

    if generate_image:
        _handle_image_output(resp, args.output)
    else:
        out({
            "status": "ok",
            "levels_table": args.levels_table,
        })


# ---------------------------------------------------------------------------
# classbreak
# ---------------------------------------------------------------------------

def _build_classbreak_args(parser):
    parser.add_argument(
        "--config", dest="config", required=True,
        help="JSON config: @file.json or inline JSON string",
    )
    parser.add_argument("--output", default=None, help="Output file path for the image")


def cmd_classbreak(db, args):
    """Generate a class-break visualization from a JSON config."""
    config = _load_config(args.config)
    output_path = args.output

    resp = db.visualize_image_classbreak(**config)
    check_status(resp, "visualize_image_classbreak")
    _handle_image_output(resp, output_path)


# ---------------------------------------------------------------------------
# COMMANDS dict
# ---------------------------------------------------------------------------

COMMANDS = {
    "chart": {
        "fn": cmd_chart,
        "desc": "Generate a chart image (line, bar, scatter, etc.)",
        "build_args": _build_chart_args,
    },
    "heatmap": {
        "fn": cmd_heatmap,
        "desc": "Generate a heatmap image from table data",
        "build_args": _build_heatmap_args,
    },
    "isochrone": {
        "fn": cmd_isochrone,
        "desc": "Generate isochrone contours from a graph",
        "build_args": _build_isochrone_args,
    },
    "classbreak": {
        "fn": cmd_classbreak,
        "desc": "Generate a class-break visualization from JSON config",
        "build_args": _build_classbreak_args,
    },
}
