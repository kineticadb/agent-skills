# Kinetica Agent Skills

[![Version](https://img.shields.io/badge/version-1.0.35-blue)](https://github.com/kineticadb/agent-skills)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![CI](https://github.com/kineticadb/agent-skills/actions/workflows/check-refs.yml/badge.svg)](https://github.com/kineticadb/agent-skills/actions/workflows/check-refs.yml)

Knowledge skills that teach AI coding agents to work with [Kinetica](https://www.kinetica.com), a real-time GPU-accelerated analytical database. The agent learns Kinetica's SQL dialect, Python SDK, admin operations, and interactive CLI — then activates the right skill automatically based on what you're doing.

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

## 🖥️ Supported Platforms

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

## 📦 Install

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
cp -r skills/kinetica-query .claude/skills/    # Claude Code
cp -r skills/kinetica-query .cursor/skills/    # Cursor
cp -r skills/kinetica-query .agents/skills/    # Codex, Windsurf, Roo, etc.
```

Copy all four skill directories for the full experience, or just the ones you need.

## 🧠 Skills

| Skill | Audience | What it teaches | Refs |
| ----- | -------- | --------------- | ---- |
| **kinetica-query** | 📊 Data analysts | SQL analytics — geospatial, time-series, vector search, graph, JSON | 15 |
| **kinetica-code** | 💻 App developers | Python SDK (`gpudb`), REST API, data pipelines, embedded SQL | 7 |
| **kinetica-admin** | 🔧 DBAs | System tables, EXPLAIN plans, resource groups, security, tiered storage | 7 |
| **kinetica-execute** | ⚡ Interactive ops | Live CLI for SQL, graph analytics, geospatial, visualization, import/export | 16 |

All four install together. Each `SKILL.md` has a `description` field in its frontmatter that tells the agent when to activate — a SQL question triggers `kinetica-query`, a Python SDK question triggers `kinetica-code`, a `describe this table` command triggers `kinetica-execute`, etc.

## 🚀 Quick Start

After installing, just ask your agent naturally. The right skill activates automatically:

**📊 SQL analytics** (activates `kinetica-query`):
> "Find all delivery trucks within 5 km of the warehouse in the last hour"

**💻 Application code** (activates `kinetica-code`):
> "Write a Python script that bulk-inserts sensor data using the gpudb SDK"

**🔧 Admin tasks** (activates `kinetica-admin`):
> "Show me the EXPLAIN plan for this query and suggest index improvements"

**⚡ Interactive operations** (activates `kinetica-execute`):
> "Run `SELECT COUNT(*) FROM vehicle_tracks` against my Kinetica instance"

The `kinetica-execute` skill includes a dual-runtime CLI (Node.js + Python) that connects to your database, runs queries, generates visualizations, and returns results directly in the chat.

## ⚙️ How It Works

Each skill is a directory with a standard layout:

```text
skills/kinetica-query/
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

skills/kinetica-query/references/     ← 15 files (all domains)
skills/kinetica-code/references/      ← 7 files  (SDK + DDL/DML)
skills/kinetica-admin/references/     ← 7 files  (security + system tables)
skills/kinetica-execute/references/   ← 16 files (all domains + API)
```

Each skill gets only the references relevant to its audience — a data analyst doesn't need security docs, and a DBA doesn't need vector search patterns.

## 📁 Project Structure

```text
agent-skills/
├── skills/                  # Canonical skill definitions
│   ├── kinetica-query/      #   SKILL.md + REFS + references/
│   ├── kinetica-code/
│   ├── kinetica-admin/
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

## 🛠️ Development

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

## 🤝 Contributing

1. **Edit knowledge** — Modify or add a `.md` file in `knowledge/`
2. **Map to skills** — Add the filename to the relevant skill's `REFS` file in `skills/<name>/REFS`
3. **Reference it** — Link from the skill's `SKILL.md` using `references/` paths
4. **Build** — Run `./build.sh` to distribute references and update the plugin mirror
5. **Test** — Run `npm test` in `skills/kinetica-execute/scripts/` if you changed CLI code
6. **Commit** — Include the updated `references/` and `plugins/` directories

The CI check will fail if `references/` are out of sync with `knowledge/`, so always run `build.sh` before pushing.

## 🧹 Uninstall / Reset

Remove the plugin from Claude Code:

```bash
/plugin marketplace remove kinetica-skills
```

**Upgrading from the old multi-plugin format?** If you previously installed `kinetica-query`, `kinetica-code`, or `kinetica-admin` as separate plugins, clean up first:

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

## 📄 License

[Apache-2.0](LICENSE)
