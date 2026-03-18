"""Shared helpers for all Kinetica CLI modules (Python)."""

import json
import os
import re
import sys
from pathlib import Path


# ---------------------------------------------------------------------------
# .env loader -- reads .env from CWD (expected to be project root)
# ---------------------------------------------------------------------------

def load_env_file():
    """Load .env from the project root (CWD) into os.environ."""
    env_path = Path.cwd() / ".env"
    if not env_path.is_file():
        return
    with open(env_path) as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            eq = line.find("=")
            if eq == -1:
                continue
            key = line[:eq].strip()
            val = line[eq + 1:].strip()
            # Strip surrounding quotes
            if len(val) >= 2 and val[0] == val[-1] and val[0] in ('"', "'"):
                val = val[1:-1]
            # Only set if not already defined (real env takes precedence)
            if key not in os.environ:
                os.environ[key] = val


# Auto-load on import so env vars are available immediately
load_env_file()


# ---------------------------------------------------------------------------
# Environment / IO helpers
# ---------------------------------------------------------------------------

def env(key, fallback=""):
    """Get an environment variable with an optional fallback."""
    return os.environ.get(key, fallback)


def die(msg):
    """Print a JSON error to stderr and exit with code 1."""
    print(json.dumps({"error": msg}), file=sys.stderr)
    sys.exit(1)


def out(obj):
    """Print a JSON object to stdout with pretty formatting."""
    print(json.dumps(obj, indent=2, default=str))


# ---------------------------------------------------------------------------
# HTTP auth helpers
# ---------------------------------------------------------------------------

def build_auth_headers():
    """Build HTTP auth headers from environment credentials."""
    token = env("KINETICA_DB_SKILL_OAUTH_TOKEN")
    if token:
        return {"Authorization": f"Bearer {token}"}
    username = env("KINETICA_DB_SKILL_USER", "")
    password = env("KINETICA_DB_SKILL_PASS", "")
    if username:
        import base64
        credentials = base64.b64encode(f"{username}:{password}".encode()).decode()
        return {"Authorization": f"Basic {credentials}"}
    return {}


# ---------------------------------------------------------------------------
# Kinetica connection
# ---------------------------------------------------------------------------

def connect():
    """Create a GPUdb connection from environment variables.

    Imports gpudb lazily so that modules loading helpers for non-DB tasks
    do not need the SDK installed.
    """
    import gpudb

    url = env("KINETICA_DB_SKILL_URL")
    if not url:
        die("KINETICA_DB_SKILL_URL is not set")

    token = env("KINETICA_DB_SKILL_OAUTH_TOKEN")
    opts = gpudb.GPUdb.Options()
    opts.disable_auto_discovery = True
    if token:
        opts.oauth_token = token
    else:
        username = env("KINETICA_DB_SKILL_USER", "")
        password = env("KINETICA_DB_SKILL_PASS", "")
        if username:
            opts.username = username
            opts.password = password

    timeout = int(env("KINETICA_DB_SKILL_TIMEOUT", "30000"))
    if timeout > 0:
        opts.timeout = timeout

    return gpudb.GPUdb(host=url, options=opts)


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------

def columnar_to_rows(headers, data):
    """Convert Kinetica columnar response to a list of row dicts."""
    if not headers:
        return []
    num_rows = len(data.get("column_1", []))
    rows = []
    for i in range(num_rows):
        row = {}
        for j, h in enumerate(headers):
            col_key = f"column_{j + 1}"
            row[h] = data[col_key][i] if col_key in data else None
        rows.append(row)
    return rows


def extract_columnar_data(resp):
    """Extract column headers and columnar data from a Kinetica response.

    The Python gpudb SDK returns columnar data inside a JSON string at
    ``json_encoded_response`` rather than as top-level ``column_N`` keys.
    This helper transparently handles both cases.
    """
    jer = resp.get("json_encoded_response", "")
    if jer:
        parsed = json.loads(jer)
        headers = parsed.get("column_headers", [])
        data = {
            k: v
            for k, v in parsed.items()
            if k.startswith("column_") and k != "column_headers" and k != "column_datatypes"
        }
    else:
        headers = resp.get("column_headers", [])
        data = {
            f"column_{i + 1}": resp.get(f"column_{i + 1}", [])
            for i in range(len(headers))
        }
    return headers, data


def check_status(resp, operation="operation"):
    """Check a Kinetica SDK response for ERROR status and die if found."""
    status_info = resp.get("status_info", {})
    if status_info.get("status") == "ERROR":
        die(status_info.get("message", f"{operation} failed"))


# ---------------------------------------------------------------------------
# Argument parsing helpers
# ---------------------------------------------------------------------------

def parse_csv_arg(value):
    """Split a comma-separated string into a list of stripped strings.

    Returns an empty list for falsy input.
    """
    if not value:
        return []
    return [s.strip() for s in value.split(",")]


def parse_float_csv(value):
    """Split a comma-separated string into a list of floats.

    Returns an empty list for falsy input.
    """
    if not value:
        return []
    return [float(s.strip()) for s in value.split(",")]


# ---------------------------------------------------------------------------
# Type formatting
# ---------------------------------------------------------------------------

def extract_array_type(properties):
    """Scan a column's properties list for an ``array(TYPE,...)`` pattern.

    Kinetica encodes array column info in the properties metadata rather than
    the Avro type schema.  For example, an array column has properties like::

        ["data", "array(string,-1)"]

    Returns a human-readable type string such as ``"array<string>"``, or
    ``None`` if the column is not an array type.
    """
    if not isinstance(properties, list):
        return None
    for p in properties:
        if not isinstance(p, str):
            continue
        m = re.match(r"^array\((\w+)", p)
        if m:
            return f"array<{m.group(1)}>"
    return None


def format_avro_type(avro_type):
    """Format an Avro type descriptor into a human-readable string.

    Handles simple strings ("string"), nullable unions (["string", "null"]),
    array descriptors ({"type":"array","items":"string"}), and nested
    combinations thereof.
    """
    if isinstance(avro_type, str):
        return avro_type
    if isinstance(avro_type, dict):
        if avro_type.get("type") == "array":
            return f"array<{format_avro_type(avro_type.get('items', ''))}>"
        return avro_type.get("type", str(avro_type))
    if isinstance(avro_type, list):
        non_null = [t for t in avro_type if t != "null"]
        return "|".join(format_avro_type(t) for t in non_null)
    return str(avro_type)


