"""Geospatial filtering commands for the Kinetica CLI (Python).

Provides six filter commands that create server-side views:
  filter-by-radius, filter-by-box, filter-by-area,
  filter-by-geometry, filter-by-range, filter-by-string.

Each command returns ``{"count": N, "view_name": "..."}`` on success.
"""

from modules.helpers import check_status, die, out, parse_csv_arg, parse_float_csv


# ---------------------------------------------------------------------------
# Valid operations / modes (used for input validation)
# ---------------------------------------------------------------------------

_GEOMETRY_OPERATIONS = frozenset([
    "contains",
    "crosses",
    "disjoint",
    "equals",
    "intersects",
    "overlaps",
    "touches",
    "within",
])

_STRING_MODES = frozenset([
    "search",
    "equals",
    "contains",
    "starts_with",
    "regex",
])


# ---------------------------------------------------------------------------
# Result helper
# ---------------------------------------------------------------------------

def _filter_result(resp, operation_label):
    """Extract count and view_name from a successful filter response."""
    check_status(resp, operation_label)
    return {
        "count": resp.get("count", 0),
        "view_name": resp.get("info", {}).get("qualified_result_table_name", ""),
    }


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

def cmd_filter_by_radius(db, args):
    table = args.table_name
    if not table:
        die("Usage: geo filter-by-radius <table> --x-col COL --y-col COL "
            "--center-x N --center-y N --radius N [--view-name NAME]")

    resp = db.filter_by_radius(
        table_name=table,
        view_name=args.view_name or "",
        x_column_name=args.x_col,
        x_center=args.center_x,
        y_column_name=args.y_col,
        y_center=args.center_y,
        radius=args.radius,
        options={},
    )

    out(_filter_result(resp, "filter_by_radius"))


def cmd_filter_by_box(db, args):
    table = args.table_name
    if not table:
        die("Usage: geo filter-by-box <table> --x-col COL --y-col COL "
            "--min-x N --max-x N --min-y N --max-y N [--view-name NAME]")

    resp = db.filter_by_box(
        table_name=table,
        view_name=args.view_name or "",
        x_column_name=args.x_col,
        min_x=args.min_x,
        max_x=args.max_x,
        y_column_name=args.y_col,
        min_y=args.min_y,
        max_y=args.max_y,
        options={},
    )

    out(_filter_result(resp, "filter_by_box"))


def cmd_filter_by_area(db, args):
    table = args.table_name
    if not table:
        die("Usage: geo filter-by-area <table> --x-col COL --y-col COL "
            "--x-vertices N,N,N --y-vertices N,N,N [--view-name NAME]")

    x_vertices = parse_float_csv(args.x_vertices)
    y_vertices = parse_float_csv(args.y_vertices)

    if not x_vertices or not y_vertices:
        die("--x-vertices and --y-vertices must be comma-separated numbers")

    if len(x_vertices) != len(y_vertices):
        die("--x-vertices and --y-vertices must have the same number of values")

    resp = db.filter_by_area(
        table_name=table,
        view_name=args.view_name or "",
        x_column_name=args.x_col,
        x_vector=x_vertices,
        y_column_name=args.y_col,
        y_vector=y_vertices,
        options={},
    )

    out(_filter_result(resp, "filter_by_area"))


def cmd_filter_by_geometry(db, args):
    table = args.table_name
    if not table:
        die("Usage: geo filter-by-geometry <table> --column COL --wkt WKT "
            "--operation intersects [--view-name NAME]")

    operation = args.operation
    if operation not in _GEOMETRY_OPERATIONS:
        die(f"Invalid operation '{operation}'. "
            f"Must be one of: {', '.join(sorted(_GEOMETRY_OPERATIONS))}")

    resp = db.filter_by_geometry(
        table_name=table,
        view_name=args.view_name or "",
        column_name=args.column,
        input_wkt=args.wkt,
        operation=operation,
        options={},
    )

    out(_filter_result(resp, "filter_by_geometry"))


def cmd_filter_by_range(db, args):
    table = args.table_name
    if not table:
        die("Usage: geo filter-by-range <table> --column COL "
            "--lower N --upper N [--view-name NAME]")

    resp = db.filter_by_range(
        table_name=table,
        view_name=args.view_name or "",
        column_name=args.column,
        lower_bound=args.lower,
        upper_bound=args.upper,
        options={},
    )

    out(_filter_result(resp, "filter_by_range"))


def cmd_filter_by_string(db, args):
    table = args.table_name
    if not table:
        die("Usage: geo filter-by-string <table> --expression EXPR "
            "--mode contains --columns col1,col2 [--view-name NAME]")

    mode = args.mode
    if mode not in _STRING_MODES:
        die(f"Invalid mode '{mode}'. "
            f"Must be one of: {', '.join(sorted(_STRING_MODES))}")

    columns = parse_csv_arg(args.columns)
    if not columns:
        die("--columns is required (comma-separated column names)")

    resp = db.filter_by_string(
        table_name=table,
        view_name=args.view_name or "",
        expression=args.expression,
        mode=mode,
        column_names=columns,
        options={},
    )

    out(_filter_result(resp, "filter_by_string"))


# ---------------------------------------------------------------------------
# Argparse builders
# ---------------------------------------------------------------------------

def _build_filter_by_radius_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument("--x-col", required=True, dest="x_col",
                        help="Name of the X (longitude) column")
    parser.add_argument("--y-col", required=True, dest="y_col",
                        help="Name of the Y (latitude) column")
    parser.add_argument("--center-x", required=True, type=float, dest="center_x",
                        help="X coordinate of the center point")
    parser.add_argument("--center-y", required=True, type=float, dest="center_y",
                        help="Y coordinate of the center point")
    parser.add_argument("--radius", required=True, type=float,
                        help="Search radius")
    parser.add_argument("--view-name", default="", dest="view_name",
                        help="Name for the result view (auto-generated if omitted)")


def _build_filter_by_box_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument("--x-col", required=True, dest="x_col",
                        help="Name of the X (longitude) column")
    parser.add_argument("--y-col", required=True, dest="y_col",
                        help="Name of the Y (latitude) column")
    parser.add_argument("--min-x", required=True, type=float, dest="min_x",
                        help="Minimum X bound")
    parser.add_argument("--max-x", required=True, type=float, dest="max_x",
                        help="Maximum X bound")
    parser.add_argument("--min-y", required=True, type=float, dest="min_y",
                        help="Minimum Y bound")
    parser.add_argument("--max-y", required=True, type=float, dest="max_y",
                        help="Maximum Y bound")
    parser.add_argument("--view-name", default="", dest="view_name",
                        help="Name for the result view (auto-generated if omitted)")


def _build_filter_by_area_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument("--x-col", required=True, dest="x_col",
                        help="Name of the X (longitude) column")
    parser.add_argument("--y-col", required=True, dest="y_col",
                        help="Name of the Y (latitude) column")
    parser.add_argument("--x-vertices", required=True, dest="x_vertices",
                        help="Comma-separated X coordinates of polygon vertices")
    parser.add_argument("--y-vertices", required=True, dest="y_vertices",
                        help="Comma-separated Y coordinates of polygon vertices")
    parser.add_argument("--view-name", default="", dest="view_name",
                        help="Name for the result view (auto-generated if omitted)")


def _build_filter_by_geometry_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument("--column", required=True,
                        help="Name of the geometry column")
    parser.add_argument("--wkt", required=True,
                        help="WKT geometry string for the filter")
    parser.add_argument("--operation", required=True,
                        help="Spatial operation: " + ", ".join(sorted(_GEOMETRY_OPERATIONS)))
    parser.add_argument("--view-name", default="", dest="view_name",
                        help="Name for the result view (auto-generated if omitted)")


def _build_filter_by_range_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument("--column", required=True,
                        help="Column name to apply range filter on")
    parser.add_argument("--lower", required=True, type=float,
                        help="Lower bound of the range")
    parser.add_argument("--upper", required=True, type=float,
                        help="Upper bound of the range")
    parser.add_argument("--view-name", default="", dest="view_name",
                        help="Name for the result view (auto-generated if omitted)")


def _build_filter_by_string_args(parser):
    parser.add_argument("table_name", help="Source table name")
    parser.add_argument("--expression", required=True,
                        help="String expression to search for")
    parser.add_argument("--mode", required=True,
                        help="Match mode: " + ", ".join(sorted(_STRING_MODES)))
    parser.add_argument("--columns", required=True,
                        help="Comma-separated column names to search")
    parser.add_argument("--view-name", default="", dest="view_name",
                        help="Name for the result view (auto-generated if omitted)")


# ---------------------------------------------------------------------------
# COMMANDS dict -- consumed by the dispatcher
# ---------------------------------------------------------------------------

COMMANDS = {
    "filter-by-radius": {
        "fn": cmd_filter_by_radius,
        "desc": "Filter records within a radius of a point",
        "build_args": _build_filter_by_radius_args,
    },
    "filter-by-box": {
        "fn": cmd_filter_by_box,
        "desc": "Filter records within a bounding box",
        "build_args": _build_filter_by_box_args,
    },
    "filter-by-area": {
        "fn": cmd_filter_by_area,
        "desc": "Filter records within a polygon area",
        "build_args": _build_filter_by_area_args,
    },
    "filter-by-geometry": {
        "fn": cmd_filter_by_geometry,
        "desc": "Filter records by WKT geometry and spatial operation",
        "build_args": _build_filter_by_geometry_args,
    },
    "filter-by-range": {
        "fn": cmd_filter_by_range,
        "desc": "Filter records within a numeric range",
        "build_args": _build_filter_by_range_args,
    },
    "filter-by-string": {
        "fn": cmd_filter_by_string,
        "desc": "Filter records by string matching",
        "build_args": _build_filter_by_string_args,
    },
}
