"""Core Kinetica CLI commands (Python).

Provides the original 10 commands extracted from kinetica-cli.py.
Each command has signature ``(db, args)`` where *db* is a GPUdb connection
and *args* is an argparse Namespace.
"""

import argparse
import json
import sys

from modules.helpers import (
    check_status,
    columnar_to_rows,
    die,
    extract_columnar_data,
    out,
)


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_health(db, args):
    try:
        db.show_table("", options={"show_children": "false"})
        out({"status": "ok", "message": "Connected to Kinetica", "url": db.host})
    except Exception as e:
        out({"status": "error", "message": str(e)})
        sys.exit(1)


def cmd_query(db, args):
    sql = args.sql
    if not sql:
        die("Usage: query <sql>")

    limit = args.limit if args.limit is not None else -9999
    offset = args.offset if args.offset is not None else 0

    resp = db.execute_sql(sql, offset=offset, limit=limit, encoding="json")

    check_status(resp, "Query")

    headers, data = extract_columnar_data(resp)
    rows = columnar_to_rows(headers, data)

    out({
        "total_number_of_records": resp.get("total_number_of_records", 0),
        "has_more_records": resp.get("has_more_records", False),
        "count_affected": resp.get("count_affected", 0),
        "records": rows,
    })


def cmd_show_tables(db, args):
    schema = args.schema or ""

    resp = db.show_table(schema, options={"get_sizes": "true", "show_children": "true"})

    table_names = resp.get("table_names", [])
    sizes = resp.get("sizes", [])
    type_ids = resp.get("type_ids", [])

    tables = []
    for i, name in enumerate(table_names):
        tables.append({
            "table_name": name,
            "size": sizes[i] if i < len(sizes) else None,
            "type_id": type_ids[i] if i < len(type_ids) else None,
        })

    out({"tables": tables, "total": len(tables)})


def cmd_describe_table(db, args):
    table_name = args.table_name
    if not table_name:
        die("Usage: describe-table <table_name>")

    resp = db.show_table(
        table_name,
        options={
            "get_sizes": "true",
            "show_children": "false",
            "get_column_info": "true",
        },
    )

    columns = []
    type_schemas = resp.get("type_schemas", [])
    if type_schemas:
        try:
            schema = json.loads(type_schemas[0])
            for f in schema.get("fields", []):
                ftype = f.get("type", "")
                if isinstance(ftype, list):
                    ftype = "|".join(t for t in ftype if t != "null")
                columns.append({"name": f["name"], "type": ftype})
        except (json.JSONDecodeError, KeyError):
            pass

    properties_list = resp.get("properties", [])
    if properties_list:
        try:
            props = (
                json.loads(properties_list[0])
                if isinstance(properties_list[0], str)
                else properties_list[0]
            )
            for col in columns:
                if col["name"] in props:
                    col["properties"] = props[col["name"]]
        except (json.JSONDecodeError, KeyError, TypeError):
            pass

    sizes = resp.get("sizes", [])
    type_ids = resp.get("type_ids", [])

    out({
        "table_name": table_name,
        "size": sizes[0] if sizes else None,
        "type_id": type_ids[0] if type_ids else None,
        "columns": columns,
    })


def cmd_get_records(db, args):
    table_name = args.table_name
    if not table_name:
        die("Usage: get-records <table> [--limit N] [--offset N] ...")

    limit = args.limit if args.limit is not None else 100
    offset = args.offset if args.offset is not None else 0
    column_names = args.columns.split(",") if args.columns else []

    opts = {}
    if args.expression:
        opts["expression"] = args.expression
    if args.sort_by:
        opts["sort_by"] = args.sort_by
    if args.sort_order:
        opts["sort_order"] = "descending" if args.sort_order == "desc" else "ascending"

    resp = db.get_records_by_column(
        table_name=table_name,
        column_names=column_names if column_names else ["*"],
        offset=offset,
        limit=limit,
        encoding="json",
        options=opts,
    )

    check_status(resp, "get_records")

    headers, data = extract_columnar_data(resp)
    rows = columnar_to_rows(headers, data)

    out({
        "table_name": table_name,
        "total_number_of_records": resp.get("total_number_of_records", 0),
        "has_more_records": resp.get("has_more_records", False),
        "records": rows,
    })


def cmd_insert_json(db, args):
    table_name = args.table_name
    json_arg = args.json_data
    if not table_name or not json_arg:
        die("Usage: insert-json <table> <json_or_@file>")

    if json_arg.startswith("@"):
        file_path = json_arg[1:]
        with open(file_path) as f:
            json_arg = f.read()

    try:
        records = json.loads(json_arg)
    except json.JSONDecodeError as e:
        die(f"Invalid JSON: {e}")

    if not isinstance(records, list):
        records = [records]

    # POST directly to /insert/records/json endpoint
    import base64
    import urllib.parse
    import urllib.request

    params = {"table_name": table_name}
    query_string = urllib.parse.urlencode(params)
    url = f"{db.host}/insert/records/json?{query_string}"

    req = urllib.request.Request(
        url,
        data=json.dumps(records).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    if hasattr(db, "username") and db.username:
        auth = base64.b64encode(f"{db.username}:{db.password}".encode()).decode()
        req.add_header("Authorization", f"Basic {auth}")

    try:
        with urllib.request.urlopen(req) as response:
            resp = json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        die(f"HTTP {e.code}: {body}")

    out({
        "table_name": table_name,
        "status": "ok",
        "count_inserted": resp.get("count_inserted", len(records)),
        "count_updated": resp.get("count_updated", 0),
    })


def cmd_delete_records(db, args):
    table_name = args.table_name
    expression = args.expression
    if not table_name or not expression:
        die("Usage: delete-records <table> <expression>")

    resp = db.delete_records(
        table_name=table_name, expressions=[expression], options={}
    )

    check_status(resp, "delete")

    out({
        "table_name": table_name,
        "status": "ok",
        "count_deleted": resp.get("count_deleted", 0),
    })


def cmd_clear_table(db, args):
    table_name = args.table_name
    if not table_name:
        die("Usage: clear-table <table>")

    resp = db.clear_table(table_name=table_name, authorization="", options={})

    check_status(resp, "clear_table")

    out({
        "table_name": table_name,
        "status": "ok",
        "message": f"Table '{table_name}' dropped",
    })


def cmd_show_types(db, args):
    type_id = args.type_id or ""
    label = args.label or ""

    resp = db.show_types(type_id=type_id, label=label, options={})

    type_ids = resp.get("type_ids", [])
    type_schemas = resp.get("type_schemas", [])
    labels = resp.get("labels", [])

    types = []
    for i, tid in enumerate(type_ids):
        schema = type_schemas[i] if i < len(type_schemas) else ""
        try:
            schema = json.loads(schema)
        except (json.JSONDecodeError, TypeError):
            pass
        types.append({
            "type_id": tid,
            "label": labels[i] if i < len(labels) else "",
            "schema": schema,
        })

    out({"types": types, "total": len(types)})


def cmd_aggregate(db, args):
    table_name = args.table_name
    columns_str = args.columns
    if not table_name or not columns_str:
        die("Usage: aggregate <table> <columns> [--limit N] [--offset N]")

    columns = [c.strip() for c in columns_str.split(",")]
    limit = args.limit if args.limit is not None else 100
    offset = args.offset if args.offset is not None else 0

    resp = db.aggregate_group_by(
        table_name=table_name,
        column_names=columns,
        offset=offset,
        limit=limit,
        encoding="json",
        options={},
    )

    check_status(resp, "aggregate")

    headers, data = extract_columnar_data(resp)
    rows = columnar_to_rows(headers, data)

    out({
        "table_name": table_name,
        "total_number_of_records": resp.get("total_number_of_records", 0),
        "records": rows,
    })


# ---------------------------------------------------------------------------
# COMMANDS dict + parser builder
# ---------------------------------------------------------------------------

COMMANDS = {
    "health": cmd_health,
    "query": cmd_query,
    "show-tables": cmd_show_tables,
    "describe-table": cmd_describe_table,
    "get-records": cmd_get_records,
    "insert-json": cmd_insert_json,
    "delete-records": cmd_delete_records,
    "clear-table": cmd_clear_table,
    "show-types": cmd_show_types,
    "aggregate": cmd_aggregate,
}


def build_parser():
    """Return an argparse parser with all core subcommands."""
    parser = argparse.ArgumentParser(
        prog="kinetica-cli",
        description="Kinetica GPU Database CLI",
    )
    sub = parser.add_subparsers(dest="command", help="Available commands")

    # health
    sub.add_parser("health", help="Verify connection to Kinetica")

    # query
    p = sub.add_parser("query", help="Execute any SQL statement")
    p.add_argument("sql", help="SQL statement to execute")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--offset", type=int, default=None)

    # show-tables
    p = sub.add_parser("show-tables", help="List tables (optionally by schema)")
    p.add_argument("schema", nargs="?", default="", help="Schema name")

    # describe-table
    p = sub.add_parser("describe-table", help="Show columns, types, properties, row count")
    p.add_argument("table_name", help="Table name")

    # get-records
    p = sub.add_parser("get-records", help="Retrieve records from a table")
    p.add_argument("table_name", help="Table name")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--offset", type=int, default=None)
    p.add_argument("--expression", default=None, help="Filter expression")
    p.add_argument("--columns", default=None, help="Comma-separated column names")
    p.add_argument("--sort-by", default=None, dest="sort_by", help="Sort column")
    p.add_argument("--sort-order", default=None, dest="sort_order", choices=["asc", "desc"])

    # insert-json
    p = sub.add_parser("insert-json", help="Insert JSON records into a table")
    p.add_argument("table_name", help="Table name")
    p.add_argument("json_data", help="JSON string or @filepath")

    # delete-records
    p = sub.add_parser("delete-records", help="Delete matching records")
    p.add_argument("table_name", help="Table name")
    p.add_argument("expression", help="Filter expression for deletion")

    # clear-table
    p = sub.add_parser("clear-table", help="Drop a table")
    p.add_argument("table_name", help="Table name")

    # show-types
    p = sub.add_parser("show-types", help="List registered types")
    p.add_argument("type_id", nargs="?", default="", help="Type ID filter")
    p.add_argument("label", nargs="?", default="", help="Label filter")

    # aggregate
    p = sub.add_parser("aggregate", help="Group-by aggregation")
    p.add_argument("table_name", help="Table name")
    p.add_argument("columns", help="Comma-separated columns (include aggregates)")
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--offset", type=int, default=None)

    return parser
