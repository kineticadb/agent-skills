# Kinetica Agent Skills

Knowledge skills that teach AI agents to work with [Kinetica](https://www.kinetica.com), a real-time and GPU-accelerated database. Works on **17+ platforms** including Claude Code, Cursor, Codex, Windsurf, Gemini CLI, GitHub Copilot, and more.

## Install

```bash
npx skills add kineticadb/agent-skills
```

That's it. The CLI detects your agents and installs all four skills. Claude picks the right one based on what you're doing.

**Claude Code** (marketplace):

```bash
/plugin marketplace add kineticadb/agent-skills
/plugin install kineticadb@kinetica-skills
```

**Manual** (any agent):

```bash
cp -r skills/kinetica-query .claude/skills/    # Claude Code
cp -r skills/kinetica-query .cursor/skills/    # Cursor
cp -r skills/kinetica-query .agents/skills/    # Codex, Windsurf, Roo, etc.
```

## Skills

| Skill | Audience | What it teaches | References |
| ----- | -------- | --------------- | ---------- |
| **kinetica-query** | Data analysts | SQL analytics — geospatial, time-series, vector search, graph, JSON | 15 files |
| **kinetica-code** | App developers | Python SDK, REST API, data pipelines, embedded SQL | 7 files |
| **kinetica-admin** | DBAs | System tables, EXPLAIN, resource groups, security, tier management | 7 files |
| **kinetica-execute** | Interactive ops | CLI for SQL, graph analytics, geospatial, visualization, data import/export, monitoring | 16 files |

All four install together. Each SKILL.md has a `description` field that tells the agent when to activate it — a SQL query question triggers `kinetica-query`, a Python SDK question triggers `kinetica-code`, an interactive operation triggers `kinetica-execute`, etc.

## How It Works

Each skill is a directory with a standard layout:

```text
skills/kinetica-query/
├── SKILL.md       # Entry point — agent reads this first
└── references/    # Detailed docs — agent reads on demand
```

**SKILL.md** is always loaded. It contains key rules and links to reference files. The agent only reads a reference when the question requires it — a simple GROUP BY won't trigger geospatial references.

**references/** contains domain-specific docs built from the `knowledge/` source directory. Each skill gets only the references relevant to its audience.

## Project Structure

```text
agent-skills/
├── skills/                # All skills live here (canonical)
│   ├── kinetica-query/    #   SKILL.md + REFS + references/
│   ├── kinetica-code/
│   ├── kinetica-admin/
│   └── kinetica-execute/
├── plugins/               # Claude Code marketplace plugin (mirrored by build.sh)
│   └── kinetica/
├── knowledge/             # Source of truth for all reference files
├── .claude-plugin/        # Claude Code marketplace config
├── build.sh               # knowledge/ → references/ + Claude plugin mirror
└── .github/workflows/     # CI: verifies references stay in sync
```

## Uninstall / Reset

To remove the plugin from Claude Code:

```bash
/plugin marketplace remove kinetica-skills
```

**Upgrading from the old 3-plugin format?** If you previously installed `kinetica-query`, `kinetica-code`, or `kinetica-admin` as separate plugins, remove all old data first:

```bash
rm -rf ~/.claude/plugins/cache/kinetica-skills
rm -rf ~/.claude/plugins/marketplaces/kinetica-skills
rm -rf ~/.claude/plugins/cache/kineticadb-agent-skills
rm -rf ~/.claude/plugins/marketplaces/kineticadb-agent-skills
```

Then install fresh:

```bash
/plugin marketplace add kineticadb/agent-skills
/plugin install kineticadb@kinetica-skills
```

## Contributing

1. Edit a `.md` file in `knowledge/` (or add a new one)
2. Add the filename to the relevant skill's `REFS` file in `skills/<name>/REFS`
3. Reference it from the skill's `SKILL.md` using `references/` paths
4. Run `./build.sh`
5. Commit everything including the updated `references/`

## License

Apache-2.0
