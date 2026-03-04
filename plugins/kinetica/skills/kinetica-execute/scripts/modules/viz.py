"""Visualization module for the Kinetica CLI (Python).

Provides 5 commands: chart, heatmap, isochrone, classbreak, wms.

Each command follows the category module contract:
    COMMANDS = { "name": {"fn": callable, "desc": str, "build_args": callable} }
"""

import base64
import json
import urllib.error
import urllib.parse
import urllib.request

from modules.helpers import build_auth_headers, check_status, die, env, out


CHART_TYPES = [
    "line",
    "bar",
    "scatter",
    "area",
    "stacked_bar",
    "stacked_area",
]


# ---------------------------------------------------------------------------
# Image output helpers
# ---------------------------------------------------------------------------

def _handle_image_output(resp, output_path):
    """Write image data to file or report its length.

    Auto-detects whether image_data is raw binary (PNG header) or base64-encoded.
    """
    image_data = resp.get("image_data", "")
    if output_path:
        # Detect raw binary PNG (starts with \x89PNG) vs base64
        if isinstance(image_data, bytes):
            decoded = image_data
        elif len(image_data) >= 4 and image_data[:4] == '\x89PNG':
            decoded = image_data.encode("latin-1")
        else:
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


def _handle_binary_image_output(data, output_path):
    """Write raw binary image data to file or report its size.

    Used by WMS-based commands (heatmap, classbreak, wms).
    """
    if output_path:
        with open(output_path, "wb") as f:
            f.write(data)
        out({
            "status": "ok",
            "output": output_path,
            "size_bytes": len(data),
        })
    else:
        out({
            "status": "ok",
            "size_bytes": len(data),
        })


# ---------------------------------------------------------------------------
# WMS parameter builder
# ---------------------------------------------------------------------------

def _build_wms_params(opts):
    """Build a flat WMS parameter dict with sensible defaults.

    Args:
        opts: dict with keys table, styles, srs, min_x, min_y, max_x, max_y,
              width, height, x_attr, y_attr, extra.
    Returns:
        Flat dict of WMS query parameters.
    """
    min_x = opts.get("min_x", -180)
    min_y = opts.get("min_y", -90)
    max_x = opts.get("max_x", 180)
    max_y = opts.get("max_y", 90)

    params = {
        "REQUEST": "GetMap",
        "FORMAT": "image/png",
        "SRS": opts.get("srs", "EPSG:4326"),
        "LAYERS": opts["table"],
        "BBOX": f"{min_x},{min_y},{max_x},{max_y}",
        "WIDTH": str(opts.get("width", 800)),
        "HEIGHT": str(opts.get("height", 600)),
    }

    if opts.get("styles"):
        params["STYLES"] = opts["styles"]
    if opts.get("x_attr"):
        params["X_ATTR"] = opts["x_attr"]
    if opts.get("y_attr"):
        params["Y_ATTR"] = opts["y_attr"]

    extra = opts.get("extra", {})
    return {**params, **extra}


# ---------------------------------------------------------------------------
# WMS HTTP request (Python has no SDK method for this)
# ---------------------------------------------------------------------------

def _wms_request(params):
    """Send a WMS request to Kinetica and return raw PNG bytes.

    Reads connection info from environment variables (same as helpers.connect).
    """
    base_url = env("KINETICA_DB_SKILL_URL")
    if not base_url:
        die("KINETICA_DB_SKILL_URL is not set")

    query_string = urllib.parse.urlencode(params)
    url = f"{base_url.rstrip('/')}/wms?{query_string}"

    req = urllib.request.Request(url)

    for key, val in build_auth_headers().items():
        req.add_header(key, val)

    try:
        with urllib.request.urlopen(req) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            body = "(unreadable)"
        die(f"WMS request failed (HTTP {exc.code}): {body}")
    except urllib.error.URLError as exc:
        die(f"WMS request failed: {exc.reason}")


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
    parser.add_argument("--srs", default="EPSG:4326", help="Spatial reference system (default: EPSG:4326)")
    parser.add_argument("--blur-radius", dest="blur_radius", type=int, default=None, help="Blur radius (default: server default)")
    parser.add_argument("--colormap", default=None, help="Colormap name (e.g. jet, hot, viridis)")
    parser.add_argument("--min-x", dest="min_x", type=float, default=-180.0, help="Minimum X (default: -180)")
    parser.add_argument("--max-x", dest="max_x", type=float, default=180.0, help="Maximum X (default: 180)")
    parser.add_argument("--min-y", dest="min_y", type=float, default=-90.0, help="Minimum Y (default: -90)")
    parser.add_argument("--max-y", dest="max_y", type=float, default=90.0, help="Maximum Y (default: 90)")
    parser.add_argument("--width", type=int, default=800, help="Image width in pixels (default: 800)")
    parser.add_argument("--height", type=int, default=600, help="Image height in pixels (default: 600)")
    parser.add_argument("--output", default=None, help="Output file path for the image")


def cmd_heatmap(db, args):
    """Generate a heatmap image via WMS."""
    table_name = args.table_name
    if not table_name:
        die("Usage: viz heatmap <table> --x-col COL --y-col COL [options]")

    extra = {}
    if args.value_col:
        extra["VALUE_ATTR"] = args.value_col
    if args.blur_radius is not None:
        extra["BLUR_RADIUS"] = str(args.blur_radius)
    if args.colormap:
        extra["COLORMAP"] = args.colormap

    params = _build_wms_params({
        "table": table_name,
        "styles": "heatmap",
        "srs": args.srs,
        "min_x": args.min_x,
        "min_y": args.min_y,
        "max_x": args.max_x,
        "max_y": args.max_y,
        "width": args.width,
        "height": args.height,
        "x_attr": args.x_col,
        "y_attr": args.y_col,
        "extra": extra,
    })

    data = _wms_request(params)
    _handle_binary_image_output(data, args.output)


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


def _build_classbreak_params(config):
    """Map a classbreak JSON config to flat WMS params.

    Delegates to _build_wms_params for core WMS parameters, then adds
    classbreak-specific overrides and uppercase key passthrough.
    """
    extra = {}
    bbox_val = config.get("BBOX")
    if bbox_val is not None:
        if isinstance(bbox_val, (list, tuple)):
            bbox_val = ",".join(str(v) for v in bbox_val)
        extra["BBOX"] = str(bbox_val)

    base = _build_wms_params({
        "table": config.get("table") or config.get("LAYERS", ""),
        "styles": "cb_raster",
        "srs": config.get("srs") or config.get("SRS") or "EPSG:4326",
        "min_x": config.get("min_x", -180),
        "min_y": config.get("min_y", -90),
        "max_x": config.get("max_x", 180),
        "max_y": config.get("max_y", 90),
        "width": config.get("width") or config.get("WIDTH") or 800,
        "height": config.get("height") or config.get("HEIGHT") or 600,
        "x_attr": config.get("x_attr"),
        "y_attr": config.get("y_attr"),
        "extra": extra,
    })

    if not base["LAYERS"]:
        die('Config must include "LAYERS" or "table"')

    # Pass through uppercase WMS keys not already set
    passthrough = {}
    for key, val in config.items():
        if key == key.upper() and key not in base:
            passthrough[key] = str(val) if not isinstance(val, str) else val
    return {**base, **passthrough}


def cmd_classbreak(db, args):
    """Generate a class-break visualization via WMS."""
    config = _load_config(args.config)
    output_path = args.output

    params = _build_classbreak_params(config)
    data = _wms_request(params)
    _handle_binary_image_output(data, output_path)


# ---------------------------------------------------------------------------
# wms (general-purpose WMS command)
# ---------------------------------------------------------------------------

def _build_wms_args(parser):
    parser.add_argument(
        "--config", dest="config", required=True,
        help="JSON config: @file.json or inline JSON string with WMS params",
    )
    parser.add_argument("--output", default=None, help="Output file path for the image")


def cmd_wms(db, args):
    """Send a custom WMS request and save the image."""
    config = _load_config(args.config)
    output_path = args.output

    # Apply defaults, then merge user config
    params = {
        "REQUEST": "GetMap",
        "FORMAT": "image/png",
        "SRS": "EPSG:4326",
        "WIDTH": "800",
        "HEIGHT": "600",
    }
    for key, val in config.items():
        params[key] = str(val) if not isinstance(val, str) else val

    if not params.get("LAYERS"):
        die('Config must include "LAYERS" (table name)')
    if not params.get("BBOX"):
        die('Config must include "BBOX" (e.g. "-180,-90,180,90")')

    data = _wms_request(params)
    _handle_binary_image_output(data, output_path)


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
        "desc": "Generate a heatmap image via WMS",
        "build_args": _build_heatmap_args,
    },
    "isochrone": {
        "fn": cmd_isochrone,
        "desc": "Generate isochrone contours from a graph",
        "build_args": _build_isochrone_args,
    },
    "classbreak": {
        "fn": cmd_classbreak,
        "desc": "Generate a class-break visualization via WMS",
        "build_args": _build_classbreak_args,
    },
    "wms": {
        "fn": cmd_wms,
        "desc": "Send a custom WMS request and save the image",
        "build_args": _build_wms_args,
    },
}
