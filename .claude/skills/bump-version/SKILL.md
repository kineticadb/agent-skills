---
name: bump-version
description: >-
  Bump the Kinetica plugin version across all 4 source files (2 SKILL.md
  frontmatter + 2 JSON configs) and run build.sh to sync mirrored copies.
  Accepts patch (default), minor, or major.
user-invocable: true
argument-hint: "[patch|minor|major]"
---

# Bump Version

You are a version-bump automation skill. When invoked, bump the Kinetica plugin
version across all canonical source files, then run the build to propagate changes.

## Instructions

### Step 1 — Parse arguments

The user may pass `patch`, `minor`, or `major` as an argument. Default to `patch`
if no argument is given or the argument is empty.

Reject any argument that is not one of those three values.

### Step 2 — Read current version

Read `plugins/kinetica/.claude-plugin/plugin.json` and extract the top-level
`"version"` field. This is the canonical version string (e.g. `"1.0.32"`).

Parse it into three integers: `MAJOR.MINOR.PATCH`.

### Step 3 — Calculate new version

Apply semver rules:
- `patch` → increment PATCH, keep MAJOR and MINOR
- `minor` → increment MINOR, reset PATCH to 0, keep MAJOR
- `major` → increment MAJOR, reset MINOR and PATCH to 0

### Step 4 — Edit the 4 source files

Use the **Edit** tool (not Bash sed) to update each file. Match the OLD version
string exactly and replace with the NEW version string.

**2 SKILL.md files** — edit the `version:` line inside the YAML frontmatter
`metadata:` block. The line looks like:

```
  version: "OLD_VERSION"
```

Replace with:

```
  version: "NEW_VERSION"
```

Files:
1. `skills/kinetica-code/SKILL.md`
2. `skills/kinetica-execute/SKILL.md`

**marketplace.json** — edit ONLY the `plugins[0].version` field:

```
      "version": "OLD_VERSION",
```

Replace with:

```
      "version": "NEW_VERSION",
```

CRITICAL: Do NOT touch `"metadata": { "version": "1.0.0" }` — that is the
marketplace schema version and must stay at `1.0.0`.

**plugin.json** — edit the top-level `version` field:

```
  "version": "OLD_VERSION",
```

Replace with:

```
  "version": "NEW_VERSION",
```

File: `plugins/kinetica/.claude-plugin/plugin.json`

### Step 5 — Run build

Execute `./build.sh` from the repository root. This syncs the 4 source files
into mirrored copies under `plugins/kinetica/skills/`.

### Step 6 — Report results

Print a summary:
- Version change: `OLD_VERSION` → `NEW_VERSION`
- List all 4 source files that were edited
- Confirm build.sh completed successfully
- Remind the user: "Changes are staged but **not committed**. Run `/commit` or
  `git commit` when ready."

Do NOT create a git commit.
