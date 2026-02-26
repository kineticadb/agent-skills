# Kinetica Agent Skills

Knowledge plugins that teach AI agents to work with [Kinetica](https://www.kinetica.com), a GPU-accelerated database.

## Plugins

| Plugin | Purpose | References |
|--------|---------|------------|
| **kinetica-query** | SQL analytics — geospatial, time-series, vector search, graph, JSON | 11 files |
| **kinetica-code** | Application development — Python SDK, REST API, data pipelines | 3 files |
| **kinetica-admin** | Database administration — system tables, EXPLAIN, resource groups, tiers | 2 files |

## Install

**Claude Code — add the marketplace, then install a plugin:**
```
/plugin marketplace add kineticadb/agent-skills
/plugin install kinetica-query@kineticadb-agent-skills
```

Or run `/plugin` to browse and install interactively.

**Uninstall:**
```
/plugin uninstall kinetica-query@kineticadb-agent-skills
/plugin marketplace remove kineticadb-agent-skills
```

**Manual:** Copy a plugin directory (e.g. `kinetica-query/`) into your project's `.claude/plugins/`.

## Project Structure

```
agent-skills/
├── knowledge/           # Shared reference files (source of truth)
├── kinetica-query/      # Plugin: SQL analyst
├── kinetica-code/       # Plugin: App developer
├── kinetica-admin/      # Plugin: DBA
└── build.sh             # Assembles plugins from knowledge/
```

Each plugin follows the same layout:

```
kinetica-query/
├── .claude-plugin/
│   └── plugin.json      # Plugin metadata
├── REFS                 # Which knowledge files this plugin needs
└── skills/
    └── kinetica-query/
        ├── SKILL.md     # Entry point — always loaded by the agent
        └── references/  # Copied from knowledge/ by build.sh
```

## How It Works

**SKILL.md** is the entry point. When a plugin activates, the agent reads SKILL.md which contains links to reference files like `See [references/geospatial-functions.md](references/geospatial-functions.md)`. The agent only reads a reference when the question requires it — a simple GROUP BY query won't trigger geospatial references.

**knowledge/** is the single source of truth for all reference markdown files. Multiple plugins can share the same files without duplication in source. Plugins cannot reference or import from sibling plugins — each one must be fully self-contained. That's why common files like `kinetica-core-rules.md` appear in multiple REFS files; they're one file in `knowledge/` but get copied into each plugin that needs them.

**REFS** is a plain text file listing which knowledge files a plugin needs (one per line). Each plugin only ships the references relevant to its domain.

**build.sh** is a dev-only tool. It reads each plugin's REFS file and copies the listed files from `knowledge/` into the plugin's `references/` directory. A CI check on PRs verifies references are in sync — if you forget to run it, the PR fails.

**Important:** SKILL.md must only link to `references/` paths, never to `knowledge/` directly. The `knowledge/` directory doesn't exist when a plugin is installed — only the plugin's own `references/` directory ships to end users. Always edit files in `knowledge/`, never in `references/` directly — `build.sh` will overwrite them.

## Contributing

1. Add or edit a `.md` file in `knowledge/`
2. Add the filename to the relevant plugin's `REFS` file
3. Reference it from the plugin's `SKILL.md` using `references/` paths
4. Run `./build.sh`
5. Commit everything including the updated `references/`

## License

MIT
