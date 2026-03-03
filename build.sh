#!/usr/bin/env bash
# build.sh — Copies knowledge files into each skill's references/ directory.
#
# For each skill in skills/ (those containing a REFS file):
#   1. Reads the skill's REFS file (one filename per line)
#   2. Copies those files from knowledge/ into skills/<name>/references/
#
# Each skill ships with only the reference files it needs.
# Run this after modifying knowledge/, SKILL.md, or any REFS file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
KNOWLEDGE_DIR="$SCRIPT_DIR/knowledge"
SKILLS_DIR="$SCRIPT_DIR/skills"

if [ ! -d "$KNOWLEDGE_DIR" ]; then
    echo "Error: knowledge/ directory not found at $KNOWLEDGE_DIR" >&2
    exit 1
fi

if [ ! -d "$SKILLS_DIR" ]; then
    echo "Error: skills/ directory not found at $SKILLS_DIR" >&2
    exit 1
fi

built=0
errors=0

for refs_file in "$SKILLS_DIR"/*/REFS; do
    [ -f "$refs_file" ] || continue

    skill_dir="$(dirname "$refs_file")"
    skill_name="$(basename "$skill_dir")"
    refs_dir="$skill_dir/references"

    echo "Building $skill_name..."

    # Clean and recreate references directory
    rm -rf "$refs_dir"
    mkdir -p "$refs_dir"

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

        cp "$src" "$refs_dir/"
        copied=$((copied + 1))
    done < "$refs_file"

    echo "  Copied $copied reference files to skills/$skill_name/references/"
    built=$((built + 1))
done

echo ""
echo "Done. Built $built skills."

if [ "$errors" -gt 0 ]; then
    echo "WARNING: $errors missing reference files. Check output above." >&2
    exit 1
fi
