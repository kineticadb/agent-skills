#!/usr/bin/env bash
# build.sh — Assembles each plugin by copying knowledge files listed in its REFS.
#
# For each plugin directory (kinetica-query, kinetica-code, kinetica-admin):
#   1. Reads the plugin's REFS file (one filename per line)
#   2. Copies those files from knowledge/ into the plugin's skills/<name>/references/
#
# This means each plugin ships with only the reference files it needs.
# Run this after modifying knowledge/ or any REFS file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KNOWLEDGE_DIR="$SCRIPT_DIR/knowledge"

if [ ! -d "$KNOWLEDGE_DIR" ]; then
    echo "Error: knowledge/ directory not found at $KNOWLEDGE_DIR" >&2
    exit 1
fi

# Find all plugin directories (those containing a REFS file)
built=0
errors=0

for refs_file in "$SCRIPT_DIR"/*/REFS; do
    [ -f "$refs_file" ] || continue

    plugin_dir="$(dirname "$refs_file")"
    plugin_name="$(basename "$plugin_dir")"
    skill_refs_dir="$plugin_dir/skills/$plugin_name/references"

    echo "Building $plugin_name..."

    # Clean and recreate references directory
    rm -rf "$skill_refs_dir"
    mkdir -p "$skill_refs_dir"

    # Copy each file listed in REFS
    copied=0
    while IFS= read -r filename || [ -n "$filename" ]; do
        # Skip empty lines and comments
        filename="$(echo "$filename" | xargs)"
        [ -z "$filename" ] && continue
        [[ "$filename" == \#* ]] && continue

        src="$KNOWLEDGE_DIR/$filename"
        if [ ! -f "$src" ]; then
            echo "  WARNING: $filename not found in knowledge/" >&2
            errors=$((errors + 1))
            continue
        fi

        cp "$src" "$skill_refs_dir/"
        copied=$((copied + 1))
    done < "$refs_file"

    echo "  Copied $copied reference files to skills/$plugin_name/references/"
    built=$((built + 1))
done

echo ""
echo "Done. Built $built plugins."

if [ "$errors" -gt 0 ]; then
    echo "WARNING: $errors missing reference files. Check output above." >&2
    exit 1
fi
