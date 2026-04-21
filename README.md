# Kinetica Agent Skills

[![Version](https://img.shields.io/badge/version-1.0.46-blue)](https://github.com/kineticadb/agent-skills)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![CI](https://github.com/kineticadb/agent-skills/actions/workflows/check-refs.yml/badge.svg)](https://github.com/kineticadb/agent-skills/actions/workflows/check-refs.yml)

Knowledge skills that teach AI coding agents to work with [Kinetica](https://www.kinetica.com), a real-time GPU-accelerated analytical database. The agent learns Kinetica's SQL dialect, Python SDK, and interactive CLI — then activates the right skill automatically based on what you're doing.

## Table of Contents

- [🖥️ Supported Platforms](#supported-platforms)
- [📦 Install](#install)
- [🧠 Skills](#skills)
- [🚀 Quick Start](#quick-start)
- [⚙️ How It Works](#how-it-works)
- [📁 Project Structure](#project-structure)
- [🛠️ Development](#development)
- [🤝 Contributing](#contributing)
- [🧹 Uninstall / Reset](#uninstall--reset)
- [📄 License](#license)

## <a id="supported-platforms"></a>🖥️ Supported Platforms

Works with any agent that supports the skills directory convention:

| Platform | Install method |
| -------- | -------------- |
| **Claude Code** | Marketplace plugin or manual copy to `.claude/skills/` |
| **Cursor** | Manual copy to `.cursor/skills/` |
| **OpenAI Codex** | Manual copy to `.agents/skills/` |
| **Windsurf** | Manual copy to `.agents/skills/` |
| **Gemini CLI** | Manual copy to `.agents/skills/` |
| **GitHub Copilot** | Manual copy to `.agents/skills/` |
| **Roo Code** | Manual copy to `.agents/skills/` |
| **Cline** | Manual copy to `.agents/skills/` |
| **Aider** | Manual copy to `.agents/skills/` |
| **Continue** | Manual copy to `.agents/skills/` |
| **Amazon Q** | Manual copy to `.agents/skills/` |
| Others | Any agent that reads `SKILL.md` files from a skills directory |

## <a id="install"></a>📦 Install

**🌐 Universal** (auto-detects your agent):

```bash
npx skills add kineticadb/agent-skills
```

**🤖 Claude Code** (marketplace):

```bash
/plugin marketplace add kineticadb/agent-skills
/plugin install kineticadb@kinetica-skills
```

**📋 Manual** (any agent):

```bash
# Pick the directory convention your agent uses:
cp -r skills/kinetica-execute .claude/skills/    # Claude Code
cp -r skills/kinetica-execute .cursor/skills/    # Cursor
cp -r skills/kinetica-execute .agents/skills/    # Codex, Windsurf, Roo, etc.
```

Copy both skill directories for the full experience, or just the one you need.

## <a id="skills"></a>🧠 Skills

| Skill | Audience | What it teaches | Refs |
| ----- | -------- | --------------- | ---- |
| **kinetica-code** | 💻 App developers | Python SDK (`gpudb`), REST API, data pipelines, embedded SQL | 7 |
| **kinetica-execute** | ⚡ All users | SQL analytics, graph, geospatial, time-series, visualization, security & admin — with a live dual-runtime CLI | 17 |

Both install together. Each `SKILL.md` has a `description` field in its frontmatter that tells the agent when to activate — `kinetica-code` handles Python SDK and application development, while `kinetica-execute` covers everything else: SQL queries, analytics, administration, and interactive operations.

## <a id="quick-start"></a>🚀 Quick Start

After installing, just ask your agent naturally. The right skill activates automatically:

**💻 Application code** (activates `kinetica-code`):
> "Write a Python script that bulk-inserts sensor data using the gpudb SDK"

**📊 SQL analytics** (activates `kinetica-execute`):
> "Find all delivery trucks within 5 km of the warehouse in the last hour"

**🔧 Admin tasks** (activates `kinetica-execute`):
> "Show me the EXPLAIN plan for this query and suggest index improvements"

**⚡ Interactive operations** (activates `kinetica-execute`):
> "Run `SELECT COUNT(*) FROM vehicle_tracks` against my Kinetica instance"

The `kinetica-execute` skill includes a dual-runtime CLI (Node.js + Python) that connects to your database, runs queries, generates visualizations, and returns results directly in the chat.

## <a id="how-it-works"></a>⚙️ How It Works

Each skill is a directory with a standard layout:

```text
skills/kinetica-execute/
├── SKILL.md       # Entry point — always loaded into agent context
├── REFS           # Build manifest — lists which knowledge files this skill needs
└── references/    # Detailed docs — agent reads on demand
```

The architecture uses a **two-tier loading strategy**:

1. **SKILL.md** (always loaded) — Contains the skill's activation trigger, critical rules, and links to reference files. This is small enough to stay in the agent's context without consuming much of the token budget.

2. **references/** (loaded on demand) — Detailed domain docs that the agent reads only when the question requires it. A simple `GROUP BY` question won't trigger geospatial references; a `ST_CONTAINS` question will.

This lazy-loading pattern keeps the agent fast for simple questions while providing deep knowledge for complex ones.

### 🔀 Knowledge Pipeline

All reference files originate from a single `knowledge/` directory (17 source files, ~5,100 lines). The `build.sh` script distributes them to each skill based on its `REFS` manifest:

```text
knowledge/                    # Single source of truth
    ├── kinetica-core-rules.md
    ├── geospatial-functions.md
    ├── graph-functions.md
    └── ...

         ↓  build.sh reads REFS

skills/kinetica-code/references/      ← 7 files  (SDK + DDL/DML)
skills/kinetica-execute/references/   ← 17 files (all domains + API + security)
```

Each skill gets only the references relevant to its audience — `kinetica-code` focuses on SDK and DDL/DML docs for app developers, while `kinetica-execute` carries the full reference set to handle SQL analytics, geospatial, graph, security, and administration.

## <a id="project-structure"></a>📁 Project Structure

```text
agent-skills/
├── skills/                  # Canonical skill definitions
│   ├── kinetica-code/       #   SKILL.md + REFS + references/
│   └── kinetica-execute/    #   Also includes scripts/ (dual-runtime CLI)
│       └── scripts/
│           ├── kinetica-cli.js       # Node.js entry point
│           ├── kinetica-cli.py       # Python entry point
│           ├── modules/              # 8 category modules (JS + Python)
│           │   ├── core.*            #   SQL, schema, table ops
│           │   ├── graph.*           #   Graph creation, solving, Cypher
│           │   ├── geo.*             #   Geospatial filters
│           │   ├── viz.*             #   Charts, heatmaps, WMS
│           │   ├── io_cmd.*          #   File I/O, KiFS, import/export
│           │   ├── monitor.*         #   Table monitors
│           │   ├── helpers.*         #   Connection, auth, .env loading
│           │   └── image-preview.*   #   Image display
│           └── __tests__/            # Vitest unit + integration tests
├── knowledge/               # Source of truth for all reference docs (17 files)
├── plugins/                 # Claude Code marketplace mirror (generated by build.sh)
│   └── kinetica/
├── .claude-plugin/          # Marketplace metadata (marketplace.json)
├── .github/workflows/       # CI: verifies references stay in sync
├── build.sh                 # knowledge/ → references/ + plugin mirror
└── LICENSE                  # Apache-2.0
```

## <a id="development"></a>🛠️ Development

### 📋 Prerequisites

- **Node.js 18+** — required for the `kinetica-execute` CLI and tests
- **Python 3.8–3.13** — optional alternative runtime for `kinetica-execute`
- A running Kinetica instance (for integration tests)

### 🏗️ Build

After editing files in `knowledge/` or changing a skill's `REFS` manifest:

```bash
./build.sh
```

This copies the referenced knowledge files into each skill's `references/` directory and mirrors the skills into `plugins/kinetica/` for the Claude Code marketplace.

### 🧪 Tests

Tests live in `skills/kinetica-execute/scripts/__tests__/` and use [Vitest](https://vitest.dev):

```bash
cd skills/kinetica-execute/scripts

npm install               # Install dependencies
npm test                  # Run unit tests
npm run test:coverage     # Run with coverage report
npm run test:integration  # Run integration tests (requires live Kinetica)
```

### ✅ CI

The GitHub Actions workflow (`.github/workflows/check-refs.yml`) runs on every pull request to verify that `build.sh` output matches what's committed — ensuring `knowledge/` and `references/` never drift out of sync.

## <a id="contributing"></a>🤝 Contributing

1. **Edit knowledge** — Modify or add a `.md` file in `knowledge/`
2. **Map to skills** — Add the filename to the relevant skill's `REFS` file in `skills/<name>/REFS`
3. **Reference it** — Link from the skill's `SKILL.md` using `references/` paths
4. **Build** — Run `./build.sh` to distribute references and update the plugin mirror
5. **Test** — Run `npm test` in `skills/kinetica-execute/scripts/` if you changed CLI code
6. **Commit** — Include the updated `references/` and `plugins/` directories

The CI check will fail if `references/` are out of sync with `knowledge/`, so always run `build.sh` before pushing.

## <a id="uninstall--reset"></a>🧹 Uninstall / Reset

Remove the plugin from Claude Code:

```bash
/plugin marketplace remove kinetica-skills
```

**Upgrading from a previous install?** If you previously installed skills as separate plugins, clean up first:

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

## <a id="license"></a>📄 License

[Apache-2.0](LICENSE)
