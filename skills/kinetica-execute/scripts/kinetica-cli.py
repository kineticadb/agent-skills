#!/usr/bin/env python3
"""Kinetica GPU Database CLI -- thin dispatcher.

Routes commands to core or category modules while maintaining backward
compatibility with all 10 original flat commands.
"""

import warnings

# Suppress urllib3 warning about LibreSSL on macOS system Python.
# gpudb requires urllib3>=2 which expects OpenSSL 1.1.1+, but macOS Xcode
# Command Line Tools ship LibreSSL. The warning is cosmetic -- requests work fine.
warnings.filterwarnings("ignore", message=r"urllib3 v2.*only supports OpenSSL")

import importlib
import sys
from pathlib import Path

# Ensure the scripts directory is on sys.path so ``from modules.xxx`` works
_SCRIPTS_DIR = str(Path(__file__).resolve().parent)
if _SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, _SCRIPTS_DIR)

from modules.helpers import connect, die, env, load_env_file, out  # noqa: E402
from modules.core import COMMANDS as CORE_COMMANDS, build_parser  # noqa: E402

# Ensure .env is loaded (helpers auto-loads on import, but be explicit)
load_env_file()

# ---------------------------------------------------------------------------
# Category modules
# ---------------------------------------------------------------------------

CATEGORY_MODULES = {
    "graph": "modules.graph",
    "geo": "modules.geo",
    "viz": "modules.viz",
    "io": "modules.io_cmd",
    "monitor": "modules.monitor",
}


def _print_help():
    """Print combined help covering core commands and available categories."""
    parser = build_parser()
    parser.print_help()

    # List categories that are actually importable
    available = []
    for name, mod_path in sorted(CATEGORY_MODULES.items()):
        try:
            mod = importlib.import_module(mod_path)
            actions = ", ".join(sorted(getattr(mod, "COMMANDS", {}).keys()))
            available.append(f"  {name:18s} {actions or '(no actions)'}")
        except ImportError:
            pass

    if available:
        print("\nCategories:")
        for line in available:
            print(line)


def _run_handler(fn, db, args):
    """Run a command function with shared error handling."""
    try:
        fn(db, args)
    except Exception as e:
        msg = str(e)
        if "Unable to sort on array column" in msg:
            out({"error": msg, "fix": 'Remove the array column from ORDER BY, use a non-array column, or index into it: ORDER BY "col"[1]'})
        else:
            out({"error": msg})
        sys.exit(1)


def _dispatch_category(category, argv_rest):
    """Load a category module and dispatch to the requested action."""
    mod_path = CATEGORY_MODULES[category]
    try:
        mod = importlib.import_module(mod_path)
    except ImportError as exc:
        die(f"Category '{category}' is not available: {exc}")

    commands = getattr(mod, "COMMANDS", {})
    if not argv_rest or argv_rest[0] in ("--help", "-h"):
        lines = [f"Usage: kinetica-cli {category} <action> [args]\n", "Actions:"]
        for action_name, info in sorted(commands.items()):
            lines.append(f"  {action_name:18s} {info.get('desc', '')}")
        print("\n".join(lines))
        sys.exit(0)

    action = argv_rest[0]
    entry = commands.get(action)
    if not entry:
        die(f"Unknown action '{action}' in category '{category}'. "
            f"Available: {', '.join(sorted(commands.keys()))}")

    # Build an argparse parser for this action and parse remaining args
    import argparse
    action_parser = argparse.ArgumentParser(
        prog=f"kinetica-cli {category} {action}",
        description=entry.get("desc", ""),
    )
    build_args_fn = entry.get("build_args")
    if build_args_fn:
        build_args_fn(action_parser)

    args = action_parser.parse_args(argv_rest[1:])

    db = _connect_or_die()
    _run_handler(entry["fn"], db, args)


def _connect_or_die():
    """Connect to Kinetica, handling common connection errors."""
    try:
        return connect()
    except Exception as e:
        err_str = str(e)
        if "Connection refused" in err_str or "Failed to get database version" in err_str:
            url = env("KINETICA_DB_SKILL_URL", "(not set)")
            out({"error": f"Cannot connect to Kinetica at {url}. "
                          "Check KINETICA_DB_SKILL_URL and ensure the server is running."})
        else:
            out({"error": err_str[:500]})
        sys.exit(1)


def main():
    argv = sys.argv[1:]

    # No args or explicit help
    if not argv or argv[0] in ("--help", "-h"):
        _print_help()
        sys.exit(0)

    first = argv[0]

    # Category dispatch
    if first in CATEGORY_MODULES:
        _dispatch_category(first, argv[1:])
        return

    # Core command dispatch via argparse
    parser = build_parser()
    args = parser.parse_args(argv)

    if not args.command:
        parser.print_help()
        sys.exit(0)

    fn = CORE_COMMANDS.get(args.command)
    if not fn:
        die(f"Unknown command: {args.command}")

    db = _connect_or_die()
    _run_handler(fn, db, args)


if __name__ == "__main__":
    main()
