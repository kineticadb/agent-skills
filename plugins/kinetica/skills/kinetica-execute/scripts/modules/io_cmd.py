"""Import/Export and KiFS commands for Kinetica CLI (Python).

Provides 8 commands for file import/export and KiFS (Kinetica File System)
operations. Named ``io_cmd`` to avoid shadowing Python's built-in ``io`` module.

Each command has signature ``(db, args)`` where *db* is a GPUdb connection
and *args* is an argparse Namespace.
"""

import base64
import os

from modules.helpers import check_status, die, out, parse_csv_arg


# ---------------------------------------------------------------------------
# Argument builders
# ---------------------------------------------------------------------------


def _build_import_files_args(parser):
    """Add arguments for the import-files command."""
    parser.add_argument("table", help="Target table name")
    parser.add_argument(
        "--file-path", required=True, dest="file_path",
        help="Server-side or KiFS file path(s), comma-separated",
    )
    parser.add_argument("--batch-size", dest="batch_size", default=None, help="Batch size")
    parser.add_argument(
        "--columns-to-load", dest="columns_to_load", default=None,
        help="Comma-separated column names to load",
    )
    parser.add_argument(
        "--type-inference-mode", dest="type_inference_mode", default=None,
        help="Type inference mode",
    )


def _build_export_files_args(parser):
    """Add arguments for the export-files command."""
    parser.add_argument("table", help="Source table name")
    parser.add_argument(
        "--file-path", required=True, dest="file_path",
        help="Destination file path on the server",
    )
    parser.add_argument(
        "--format", dest="file_type", default="csv",
        choices=["csv", "json", "parquet"],
        help="Output format (default: csv)",
    )
    parser.add_argument("--batch-size", dest="batch_size", default=None, help="Batch size")


def _build_export_table_args(parser):
    """Add arguments for the export-table command."""
    parser.add_argument("table", help="Source table name")
    parser.add_argument(
        "--datasource", required=True, dest="datasource",
        help="Data sink / datasource name",
    )
    parser.add_argument(
        "--remote-table", required=True, dest="remote_table",
        help="Remote table or query expression",
    )
    parser.add_argument("--batch-size", dest="batch_size", default=None, help="Batch size")
    parser.add_argument(
        "--jdbc-session-init", dest="jdbc_session_init", default=None,
        help="JDBC session init statement",
    )


def _build_kifs_upload_args(parser):
    """Add arguments for the kifs-upload command."""
    parser.add_argument("kifs_path", help="Destination path in KiFS")
    parser.add_argument(
        "--file-path", required=True, dest="file_path",
        help="Local file path to upload",
    )


def _build_kifs_download_args(parser):
    """Add arguments for the kifs-download command."""
    parser.add_argument("kifs_path", help="Source path in KiFS")
    parser.add_argument(
        "--output", dest="output", default=None,
        help="Local file path to write the downloaded content",
    )


def _build_kifs_list_args(parser):
    """Add arguments for the kifs-list command."""
    parser.add_argument(
        "kifs_path", nargs="?", default="",
        help="KiFS path to list (default: root)",
    )


def _build_kifs_mkdir_args(parser):
    """Add arguments for the kifs-mkdir command."""
    parser.add_argument("kifs_path", help="Directory path to create in KiFS")


def _build_kifs_delete_args(parser):
    """Add arguments for the kifs-delete command."""
    parser.add_argument("kifs_path", help="KiFS path to delete")
    parser.add_argument(
        "--directory", action="store_true", default=False,
        help="Delete a directory instead of a file",
    )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_import_files(db, args):
    """Import files from server-side or KiFS paths into a table."""
    table = args.table
    filepaths = parse_csv_arg(args.file_path)
    if not filepaths:
        die("At least one --file-path is required")

    options = {}
    if args.batch_size is not None:
        options["batch_size"] = args.batch_size
    if args.columns_to_load is not None:
        options["columns_to_load"] = args.columns_to_load
    if args.type_inference_mode is not None:
        options["type_inference_mode"] = args.type_inference_mode

    resp = db.insert_records_from_files(
        table_name=table,
        filepaths=filepaths,
        modify_columns={},
        create_table_options={},
        options=options,
    )

    check_status(resp, "import-files")

    out({
        "table_name": table,
        "status": "ok",
        "count_inserted": resp.get("count_inserted", 0),
        "count_skipped": resp.get("count_skipped", 0),
        "count_updated": resp.get("count_updated", 0),
    })


def cmd_export_files(db, args):
    """Export table records to a file on the server."""
    table = args.table
    filepath = args.file_path

    options = {}
    if args.file_type:
        options["file_type"] = args.file_type
    if args.batch_size is not None:
        options["batch_size"] = args.batch_size

    resp = db.export_records_to_files(
        table_name=table,
        filepath=filepath,
        options=options,
    )

    check_status(resp, "export-files")

    out({
        "table_name": table,
        "status": "ok",
        "filepath": filepath,
        "count_exported": resp.get("count_inserted", 0),
    })


def cmd_export_table(db, args):
    """Export table records to a remote data sink."""
    table = args.table
    remote_table = args.remote_table

    options = {}
    if args.datasource:
        options["datasink_name"] = args.datasource
    if args.batch_size is not None:
        options["batch_size"] = args.batch_size
    if args.jdbc_session_init is not None:
        options["jdbc_session_init_statement"] = args.jdbc_session_init

    resp = db.export_records_to_table(
        table_name=table,
        remote_query=remote_table,
        options=options,
    )

    check_status(resp, "export-table")

    out({
        "table_name": table,
        "status": "ok",
        "remote_table": remote_table,
        "count_exported": resp.get("count_inserted", 0),
    })


def cmd_kifs_upload(db, args):
    """Upload a local file to KiFS."""
    kifs_path = args.kifs_path
    local_path = args.file_path

    if not os.path.isfile(local_path):
        die(f"Local file not found: {local_path}")

    with open(local_path, "rb") as f:
        file_data = base64.b64encode(f.read()).decode("ascii")

    resp = db.upload_files(
        file_names=[kifs_path],
        file_data=[file_data],
        options={},
    )

    check_status(resp, "kifs-upload")

    out({
        "kifs_path": kifs_path,
        "status": "ok",
        "message": f"Uploaded '{local_path}' to '{kifs_path}'",
    })


def cmd_kifs_download(db, args):
    """Download a file from KiFS."""
    kifs_path = args.kifs_path
    output_path = args.output

    resp = db.download_files(
        file_names=[kifs_path],
        read_offsets=[0],
        read_lengths=[-1],
        options={},
    )

    check_status(resp, "kifs-download")

    file_data = resp.get("file_data", [""])[0]

    if output_path:
        with open(output_path, "wb") as f:
            f.write(base64.b64decode(file_data))
        out({
            "kifs_path": kifs_path,
            "status": "ok",
            "output": output_path,
            "message": f"Downloaded '{kifs_path}' to '{output_path}'",
        })
    else:
        out({
            "kifs_path": kifs_path,
            "status": "ok",
            "file_data_base64": file_data,
        })


def cmd_kifs_list(db, args):
    """List files and directories in KiFS."""
    kifs_path = args.kifs_path or ""

    # List directories
    dir_resp = db.show_directories(
        directory_name=kifs_path,
        options={},
    )

    check_status(dir_resp, "kifs-list (directories)")

    directories = dir_resp.get("directory_names", [])

    # List files
    paths = [kifs_path] if kifs_path else []
    file_resp = db.show_files(
        paths=paths,
        options={},
    )

    check_status(file_resp, "kifs-list (files)")

    file_names = file_resp.get("file_names", [])
    sizes = file_resp.get("sizes", [])
    files = []
    for i, name in enumerate(file_names):
        files.append({
            "name": name,
            "size": sizes[i] if i < len(sizes) else None,
        })

    out({
        "path": kifs_path or "/",
        "directories": directories,
        "files": files,
    })


def cmd_kifs_mkdir(db, args):
    """Create a directory in KiFS."""
    kifs_path = args.kifs_path

    resp = db.create_directory(
        directory_name=kifs_path,
        options={},
    )

    check_status(resp, "kifs-mkdir")

    out({
        "kifs_path": kifs_path,
        "status": "ok",
        "message": f"Directory '{kifs_path}' created",
    })


def cmd_kifs_delete(db, args):
    """Delete a file or directory from KiFS."""
    kifs_path = args.kifs_path
    is_directory = args.directory

    if is_directory:
        resp = db.delete_directory(
            directory_name=kifs_path,
            options={},
        )
        check_status(resp, "kifs-delete (directory)")
        out({
            "kifs_path": kifs_path,
            "status": "ok",
            "message": f"Directory '{kifs_path}' deleted",
        })
    else:
        resp = db.delete_files(
            file_names=[kifs_path],
            options={},
        )
        check_status(resp, "kifs-delete (file)")
        out({
            "kifs_path": kifs_path,
            "status": "ok",
            "message": f"File '{kifs_path}' deleted",
        })


# ---------------------------------------------------------------------------
# COMMANDS dict -- module contract for the dispatcher
# ---------------------------------------------------------------------------

COMMANDS = {
    "import-files": {
        "fn": cmd_import_files,
        "desc": "Import server-side or KiFS files into a table",
        "build_args": _build_import_files_args,
    },
    "export-files": {
        "fn": cmd_export_files,
        "desc": "Export table records to a file on the server",
        "build_args": _build_export_files_args,
    },
    "export-table": {
        "fn": cmd_export_table,
        "desc": "Export table records to a remote data sink",
        "build_args": _build_export_table_args,
    },
    "kifs-upload": {
        "fn": cmd_kifs_upload,
        "desc": "Upload a local file to KiFS",
        "build_args": _build_kifs_upload_args,
    },
    "kifs-download": {
        "fn": cmd_kifs_download,
        "desc": "Download a file from KiFS",
        "build_args": _build_kifs_download_args,
    },
    "kifs-list": {
        "fn": cmd_kifs_list,
        "desc": "List files and directories in KiFS",
        "build_args": _build_kifs_list_args,
    },
    "kifs-mkdir": {
        "fn": cmd_kifs_mkdir,
        "desc": "Create a directory in KiFS",
        "build_args": _build_kifs_mkdir_args,
    },
    "kifs-delete": {
        "fn": cmd_kifs_delete,
        "desc": "Delete a file or directory from KiFS",
        "build_args": _build_kifs_delete_args,
    },
}
