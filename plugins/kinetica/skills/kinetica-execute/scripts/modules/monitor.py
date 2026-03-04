"""Monitor module for the Kinetica CLI (Python).

Provides 6 commands: create, show, clear, create-trigger, clear-trigger,
show-triggers.

Each command follows the category module contract:
    COMMANDS = { "name": {"fn": callable, "desc": str, "build_args": callable} }
"""

from modules.helpers import check_status, die, out, parse_csv_arg, parse_float_csv


# ---------------------------------------------------------------------------
# Valid event types for table monitors
# ---------------------------------------------------------------------------

_EVENT_TYPES = frozenset(["insert", "update", "delete"])


# ---------------------------------------------------------------------------
# create  --  create_table_monitor
# ---------------------------------------------------------------------------

def _build_create_args(parser):
    parser.add_argument("table_name", help="Table to monitor")
    parser.add_argument(
        "--event", default=None, choices=sorted(_EVENT_TYPES),
        help="Event type to monitor (insert, update, or delete)",
    )
    parser.add_argument("--monitor-id", dest="monitor_id", default=None, help="Custom monitor ID")
    parser.add_argument("--datasink-name", dest="datasink_name", default=None, help="Datasink name to route events to")
    parser.add_argument("--expression", default=None, help="Filter expression for monitored events")


def cmd_create(db, args):
    table_name = args.table_name
    if not table_name:
        die("Usage: monitor create <table> [--event insert|update|delete] "
            "[--monitor-id ID] [--expression EXPR]")

    options = {}
    if args.event:
        options["event"] = args.event
    if args.monitor_id:
        options["monitor_id"] = args.monitor_id
    if args.datasink_name:
        options["datasink_name"] = args.datasink_name
    if args.expression:
        options["expression"] = args.expression

    resp = db.create_table_monitor(
        table_name=table_name,
        options=options,
    )
    check_status(resp, "create_table_monitor")

    out({
        "table_name": table_name,
        "status": "ok",
        "topic_id": resp.get("topic_id", ""),
        "monitor_id": resp.get("monitor_id", ""),
        "type_schema": resp.get("type_schema", ""),
    })


# ---------------------------------------------------------------------------
# show  --  show_table_monitors
# ---------------------------------------------------------------------------

def _build_show_args(parser):
    parser.add_argument(
        "--monitor-ids", dest="monitor_ids", default=None,
        help="Comma-separated monitor IDs to show (omit to list all)",
    )


def cmd_show(db, args):
    monitor_ids = parse_csv_arg(args.monitor_ids) if args.monitor_ids else ["*"]

    resp = db.show_table_monitors(
        monitor_ids=monitor_ids,
        options={},
    )
    check_status(resp, "show_table_monitors")

    # Build a structured list from the response
    table_names = resp.get("table_names", [])
    result_monitor_ids = resp.get("monitor_ids", [])
    types = resp.get("types", [])
    events = resp.get("events", [])

    monitors = []
    for i, mid in enumerate(result_monitor_ids):
        monitors.append({
            "monitor_id": mid,
            "table_name": table_names[i] if i < len(table_names) else None,
            "type": types[i] if i < len(types) else None,
            "event": events[i] if i < len(events) else None,
        })

    out({"monitors": monitors, "total": len(monitors)})


# ---------------------------------------------------------------------------
# clear  --  clear_table_monitor
# ---------------------------------------------------------------------------

def _build_clear_args(parser):
    parser.add_argument("topic_id", help="Topic ID of the monitor to clear")


def cmd_clear(db, args):
    topic_id = args.topic_id
    if not topic_id:
        die("Usage: monitor clear <topic-id>")

    resp = db.clear_table_monitor(
        topic_id=topic_id,
        options={},
    )
    check_status(resp, "clear_table_monitor")

    out({
        "topic_id": topic_id,
        "status": "ok",
        "message": f"Monitor '{topic_id}' cleared",
    })


# ---------------------------------------------------------------------------
# create-trigger  --  create_trigger_by_area / create_trigger_by_range
# ---------------------------------------------------------------------------

_TRIGGER_TYPES = frozenset(["area", "range"])


def _build_create_trigger_args(parser):
    parser.add_argument("table_names", help="Comma-separated table names to attach the trigger to")
    parser.add_argument("--type", dest="trigger_type", required=True, choices=sorted(_TRIGGER_TYPES), help="Trigger type (area or range)")
    parser.add_argument("--trigger-id", dest="trigger_id", required=True, help="User-provided trigger ID")

    # Area-specific arguments
    parser.add_argument("--x-col", dest="x_col", default=None, help="X column name (area trigger)")
    parser.add_argument("--y-col", dest="y_col", default=None, help="Y column name (area trigger)")
    parser.add_argument("--x-vertices", dest="x_vertices", default=None, help="Comma-separated X polygon vertices (area trigger)")
    parser.add_argument("--y-vertices", dest="y_vertices", default=None, help="Comma-separated Y polygon vertices (area trigger)")

    # Range-specific arguments
    parser.add_argument("--column", default=None, help="Column name (range trigger)")
    parser.add_argument("--min", dest="range_min", type=float, default=None, help="Minimum value (range trigger)")
    parser.add_argument("--max", dest="range_max", type=float, default=None, help="Maximum value (range trigger)")


def cmd_create_trigger(db, args):
    table_names = parse_csv_arg(args.table_names)
    trigger_type = args.trigger_type
    trigger_id = args.trigger_id

    if not table_names:
        die("Usage: monitor create-trigger <table,...> --type area|range --trigger-id ID [options]")

    if trigger_type == "area":
        if not args.x_col or not args.y_col:
            die("Area trigger requires --x-col and --y-col")
        if not args.x_vertices or not args.y_vertices:
            die("Area trigger requires --x-vertices and --y-vertices")

        x_vector = parse_float_csv(args.x_vertices)
        y_vector = parse_float_csv(args.y_vertices)

        if len(x_vector) != len(y_vector):
            die("--x-vertices and --y-vertices must have the same number of values")

        resp = db.create_trigger_by_area(
            request_id=trigger_id,
            table_names=table_names,
            x_column_name=args.x_col,
            x_vector=x_vector,
            y_column_name=args.y_col,
            y_vector=y_vector,
            options={},
        )
        check_status(resp, "create_trigger_by_area")

        out({
            "trigger_id": trigger_id,
            "trigger_type": "area",
            "status": "ok",
            "table_names": table_names,
            "x_column": args.x_col,
            "y_column": args.y_col,
            "x_vertices": x_vector,
            "y_vertices": y_vector,
        })

    elif trigger_type == "range":
        if not args.column:
            die("Range trigger requires --column")
        if args.range_min is None or args.range_max is None:
            die("Range trigger requires --min and --max")

        resp = db.create_trigger_by_range(
            request_id=trigger_id,
            table_names=table_names,
            column_name=args.column,
            min=args.range_min,
            max=args.range_max,
            options={},
        )
        check_status(resp, "create_trigger_by_range")

        out({
            "trigger_id": trigger_id,
            "trigger_type": "range",
            "status": "ok",
            "table_names": table_names,
            "column": args.column,
            "min": args.range_min,
            "max": args.range_max,
        })


# ---------------------------------------------------------------------------
# clear-trigger  --  clear_trigger
# ---------------------------------------------------------------------------

def _build_clear_trigger_args(parser):
    parser.add_argument("trigger_id", help="Trigger ID to clear")


def cmd_clear_trigger(db, args):
    trigger_id = args.trigger_id
    if not trigger_id:
        die("Usage: monitor clear-trigger <trigger-id>")

    resp = db.clear_trigger(
        trigger_id=trigger_id,
        options={},
    )
    check_status(resp, "clear_trigger")

    out({
        "trigger_id": trigger_id,
        "status": "ok",
        "message": f"Trigger '{trigger_id}' cleared",
    })


# ---------------------------------------------------------------------------
# show-triggers  --  show_triggers
# ---------------------------------------------------------------------------

def _build_show_triggers_args(parser):
    parser.add_argument(
        "--trigger-ids", dest="trigger_ids", default=None,
        help="Comma-separated trigger IDs to show (omit to list all)",
    )


def cmd_show_triggers(db, args):
    trigger_ids = parse_csv_arg(args.trigger_ids) if args.trigger_ids else ["*"]

    resp = db.show_triggers(
        trigger_ids=trigger_ids,
        options={},
    )
    check_status(resp, "show_triggers")

    trigger_map = resp.get("trigger_map", {})

    triggers = []
    for tid, info in trigger_map.items():
        triggers.append({
            "trigger_id": tid,
            "info": info,
        })

    out({"triggers": triggers, "total": len(triggers)})


# ---------------------------------------------------------------------------
# COMMANDS dict
# ---------------------------------------------------------------------------

COMMANDS = {
    "create": {
        "fn": cmd_create,
        "desc": "Create a table monitor",
        "build_args": _build_create_args,
    },
    "show": {
        "fn": cmd_show,
        "desc": "Show table monitors",
        "build_args": _build_show_args,
    },
    "clear": {
        "fn": cmd_clear,
        "desc": "Clear (remove) a table monitor",
        "build_args": _build_clear_args,
    },
    "create-trigger": {
        "fn": cmd_create_trigger,
        "desc": "Create a trigger (area or range) on tables",
        "build_args": _build_create_trigger_args,
    },
    "clear-trigger": {
        "fn": cmd_clear_trigger,
        "desc": "Clear (remove) a trigger",
        "build_args": _build_clear_trigger_args,
    },
    "show-triggers": {
        "fn": cmd_show_triggers,
        "desc": "Show triggers",
        "build_args": _build_show_triggers_args,
    },
}
