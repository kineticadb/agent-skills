#!/usr/bin/env bash
# build.sh — Assembles each plugin by copying knowledge files listed in its REFS.
#
# For each plugin directory (kinetica-query, kinetica-code, kinetica-admin):
#   1. Reads the plugin's REFS file (one filename per line)
#   2. Copies those files from knowledge/ into the plugin's skills/<name>/references/
#   3. Mirrors each skill into top-level skills/<name>/ for universal platform support
#
# The top-level skills/ directory follows the Agent Skills open standard
# (skills.sh, Codex, Cursor, Windsurf, Gemini CLI, etc.).
# The plugin-specific directories follow Claude Code's plugin format.
#
# Run this after modifying knowledge/, SKILL.md, or any REFS file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KNOWLEDGE_DIR="$SCRIPT_DIR/knowledge"
SKILLS_DIR="$SCRIPT_DIR/skills"

if [ ! -d "$KNOWLEDGE_DIR" ]; then
    echo "Error: knowledge/ directory not found at $KNOWLEDGE_DIR" >&2
    exit 1
fi

# Clean and recreate top-level skills/ directory
rm -rf "$SKILLS_DIR"
mkdir -p "$SKILLS_DIR"

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

    echo "  Copied $copied reference files to $plugin_name/skills/$plugin_name/references/"

    # Mirror to top-level skills/ directory (universal Agent Skills standard)
    top_skill_dir="$SKILLS_DIR/$plugin_name"
    rm -rf "$top_skill_dir"
    cp -R "$plugin_dir/skills/$plugin_name" "$top_skill_dir"
    echo "  Mirrored to skills/$plugin_name/"

    built=$((built + 1))
done

echo ""
echo "Done. Built $built plugins + top-level skills/ directory."

if [ "$errors" -gt 0 ]; then
    echo "WARNING: $errors missing reference files. Check output above." >&2
    exit 1
fi
