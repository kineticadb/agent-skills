# Kinetica Agent Skills

Knowledge skills that teach AI agents to work with [Kinetica](https://www.kinetica.com), a GPU-accelerated database. Works on **17+ platforms** including Claude Code, Cursor, Codex, Windsurf, Gemini CLI, GitHub Copilot, and more.

## Quick Install

**Any platform** ([skills.sh](https://skills.sh)):
```bash
npx skills add kineticadb/agent-skills
```

**Claude Code** (marketplace):
```
/plugin marketplace add kineticadb/agent-skills
/plugin install kinetica-query@kineticadb-agent-skills
```

**Manual** (any agent that reads SKILL.md):
```bash
# Copy one skill into your project
cp -r skills/kinetica-query .claude/skills/    # Claude Code
cp -r skills/kinetica-query .cursor/skills/    # Cursor
cp -r skills/kinetica-query .agents/skills/    # Codex, Windsurf, Roo, etc.
```

## Skills

| Skill | Purpose | References |
|-------|---------|------------|
| **kinetica-query** | SQL analytics — geospatial, time-series, vector search, graph, JSON | 14 files |
| **kinetica-code** | Application development — Python SDK, REST API, data pipelines | 6 files |
| **kinetica-admin** | Database administration — system tables, EXPLAIN, resource groups, security | 6 files |

**Which one do I need?**
- Writing SQL queries or analytics? → `kinetica-query`
- Building Python apps that talk to Kinetica? → `kinetica-code`
- Monitoring, diagnosing, or managing a Kinetica cluster? → `kinetica-admin`

## Supported Platforms

The top-level `skills/` directory follows the [Agent Skills](https://agentskills.io) open standard. The `npx skills add` CLI installs to whichever agents you have:

| Platform | Install location |
|----------|-----------------|
| Claude Code | `.claude/skills/` or via marketplace |
| Cursor | `.cursor/skills/` |
| OpenAI Codex | `.agents/skills/` |
| Windsurf | `.agents/skills/` |
| Gemini CLI | `.agents/skills/` |
| GitHub Copilot | `.github/skills/` |
| Roo Code | `.agents/skills/` |
| Goose | `.agents/skills/` |
| Amp, Trae, OpenCode, Kilo, Kiro | `.agents/skills/` |

## Project Structure

```
agent-skills/
├── skills/              # Universal skills (Agent Skills standard)
│   ├── kinetica-query/  #   SKILL.md + references/
│   ├── kinetica-code/   #   SKILL.md + references/
│   └── kinetica-admin/  #   SKILL.md + references/
├── kinetica-query/      # Claude Code plugin wrapper
├── kinetica-code/       # Claude Code plugin wrapper
├── kinetica-admin/      # Claude Code plugin wrapper
├── knowledge/           # Shared reference files (source of truth)
├── .claude-plugin/      # Claude Code marketplace config
└── build.sh             # Assembles everything from knowledge/
```

**Two paths, same skills:**
- `skills/<name>/` — universal Agent Skills format (skills.sh, Codex, Cursor, etc.)
- `<name>/skills/<name>/` — Claude Code plugin format (marketplace)

Both are generated from the same source by `build.sh`.

## How It Works

**SKILL.md** is the entry point. When a skill activates, the agent reads SKILL.md which contains links to reference files like `See [references/geospatial-functions.md](references/geospatial-functions.md)`. The agent only reads a reference when the question requires it — a simple GROUP BY query won't trigger geospatial references.

**knowledge/** is the single source of truth for all reference markdown files. Multiple skills can share the same files without duplication in source.

**REFS** is a plain text file listing which knowledge files a skill needs (one per line). Each skill only ships the references relevant to its domain.

**build.sh** reads each skill's REFS file, copies listed files from `knowledge/` into references/, and mirrors everything to the top-level `skills/` directory. A CI check on PRs verifies everything stays in sync.

**Important:** Always edit files in `knowledge/`, never in `references/` directly — `build.sh` will overwrite them. SKILL.md must only link to `references/` paths, never to `knowledge/`.

## Contributing

1. Add or edit a `.md` file in `knowledge/`
2. Add the filename to the relevant skill's `REFS` file
3. Reference it from the skill's `SKILL.md` using `references/` paths
4. Run `./build.sh`
5. Commit everything including the updated `references/` and `skills/`

## License

MIT
