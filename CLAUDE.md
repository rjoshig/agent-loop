# CLAUDE.md

This file gives Claude Code the conventions, structure, and guardrails for working in this repo. Read it fully before scaffolding or editing.

## Project Overview

`agent-loop` is a multi-agent orchestration system for a credit bureau's customer onboarding workflow. Three agents (CSC, Compliance, Tech) deliberate over customer requirements, enrich them with regulatory considerations, generate Python monitoring code, and QC the result.

- **Orchestration:** LangGraph.js (`@langchain/langgraph`)
- **LLM:** Anthropic Claude API, model `claude-sonnet-4-5`
- **Runtime:** Node.js 20+, ESM modules
- **One customer per invocation** — invoked as `node src/index.js --customer <slug>`

## Repository Structure

```
agent-loop/
├── CLAUDE.md
├── README.md
├── package.json
├── .env.example
├── .gitignore
├── .eslintrc.json
├── .prettierrc
│
├── REQUIREMENTS/              # customer-authored input specs
│   ├── _TEMPLATE.md
│   └── <customer-slug>.md
│
├── src/
│   ├── index.js               # CLI entry point
│   ├── config.js              # constants: round caps, model, paths
│   ├── graph/
│   │   ├── index.js           # StateGraph assembly
│   │   ├── state.js           # state schema
│   │   └── edges.js           # conditional routing
│   ├── agents/
│   │   ├── base.js            # Claude API wrapper
│   │   ├── csc.js
│   │   ├── compliance.js
│   │   └── tech.js
│   ├── nodes/                 # one file per graph node
│   │   ├── enrichment.js
│   │   ├── techReview.js
│   │   ├── humanGate.js
│   │   ├── build.js
│   │   └── qc.js
│   ├── prompts/               # agent system prompts (markdown)
│   │   ├── csc.md
│   │   ├── compliance.md
│   │   └── tech.md
│   └── lib/                   # pure utilities, no LLM calls
│       ├── logger.js
│       ├── consensus.js
│       ├── requirementsLoader.js
│       └── checkpointer.js
│
├── runs/                      # gitignored; per-execution artifacts
│   └── <YYYY-MM-DD>_<slug>_<hash>/
│       ├── enriched-spec.json
│       ├── conversation.jsonl
│       ├── human-decision.json
│       ├── code/
│       ├── qc-report.md
│       └── checkpoint.sqlite
│
└── docs/
    ├── architecture.md
    ├── agent-design.md
    └── workflow-phases.md
```

## Directory Rules

- **`REQUIREMENTS/`** holds customer-authored input. Claude Code writes the `_TEMPLATE.md` and one seed example (`meridian-auto-finance.md`) during scaffolding, but does not author customer requirements during normal operation — those are human inputs. Filenames are kebab-case slugs of the customer name.
- **`src/`** holds engine code. Never put customer data or run artifacts here.
- **`runs/`** holds outputs from executions. Gitignored except `.gitkeep`. One folder per run, named `YYYY-MM-DD_<customer-slug>_<6-char-hash>`.
- **`src/nodes/`** vs **`src/agents/`** — a node is a graph step, an agent is a role. One node may invoke multiple agents; one agent may be invoked from multiple nodes. Keep them separate.
- **`src/prompts/`** holds agent system prompts as markdown so non-engineers (compliance, CSC leads) can review and edit them without touching code.
- **`src/lib/`** is for pure utilities. Anything in `lib/` must not call the Claude API directly.

## Coding Style

### Language and Modules
- ESM only (`"type": "module"` in package.json). Use `import`/`export`, never `require`.
- Node 20+ features are fair game (top-level await, native fetch, etc.).
- One default export per module when the module has a clear primary thing; otherwise named exports.

### Naming
- **JS files and identifiers:** camelCase (`requirementsLoader.js`, `runEnrichment`).
- **Folders:** lowercase, kebab-case if multi-word.
- **Customer slugs:** kebab-case (`meridian-auto-finance`).
- **Constants:** `SCREAMING_SNAKE_CASE` exported from `config.js`.
- **Generated Python:** snake_case, follows Python conventions in its own folder.

### Structure
- Keep functions small and single-purpose. If a function exceeds ~40 lines, split it.
- Each node file exports a single async function `(state) => Partial<State>`.
- Each agent file exports a single async function `(state, context) => AgentResponse`.
- Avoid classes unless there's a clear stateful object. Prefer plain functions and objects.

### Async and Errors
- Always use async/await, never raw `.then()` chains.
- Wrap Claude API calls in try/catch with explicit error logging via the shared logger.
- Never swallow errors. If a node fails, log clearly and let the graph halt or escalate.
- Use early returns to reduce nesting.

### Comments
- Comment **why**, not **what**. Don't narrate code.
- Each node file starts with a 2–4 line comment describing its role in the workflow.
- Each prompt file starts with a YAML-ish header listing version, last-edited date, and reviewer.

### Imports
- Group imports: stdlib → third-party → local. Blank line between groups.
- Use absolute-from-src style where helpful: configure path aliases if it helps readability, otherwise relative is fine.

## Linting and Formatting

- **ESLint** with `eslint:recommended` plus rules for unused vars (error), no console outside `lib/logger.js` (warn), and prefer-const (error).
- **Prettier** with: 2-space indent, single quotes, semicolons, trailing commas (`es5`), 100-char line limit.
- Both must pass before any code is considered done. Add `lint` and `format` scripts to package.json.
- No pre-commit hooks for the prototype; just scripts.

## Agent Design Conventions

- Every agent returns structured JSON matching this schema:
  ```json
  {
    "message": "string",
    "approved": true,
    "concerns": ["string"],
    "spec_updates": {}
  }
  ```
- Prompts must explicitly require this format. Validate on parse; throw clearly on malformed output.
- Agents do not have memory between calls — pass relevant state in each invocation.
- Agents never call other agents directly. Only nodes orchestrate.

## State Conventions

- State is a plain object, defined in `src/graph/state.js`.
- Mutations happen only through node return values. Never mutate state in place.
- Conversation history (`state.conversation`) is append-only.
- Approvals reset between phases — don't carry Phase 1 approvals into Phase 2.

## Logging

- All logging goes through `src/lib/logger.js`. No `console.log` elsewhere.
- Color per agent: CSC=cyan, Compliance=yellow, Tech=green, System=gray, Human=magenta.
- Format: `[Phase N · Round M · AgentName]` header, then indented body.
- Every agent turn is also appended to `runs/<run-id>/conversation.jsonl` as one JSON object per line.

## Configuration

- All tunable values live in `src/config.js`:
  ```js
  export const MODEL = 'claude-sonnet-4-5';
  export const ROUND_CAPS = { enrichment: 4, techReview: 3, qc: 2 };
  export const PATHS = { requirements: 'REQUIREMENTS', runs: 'runs', prompts: 'src/prompts' };
  ```
- API key from `process.env.ANTHROPIC_API_KEY` only. Never hardcode.

## Requirements Files

- Live in `REQUIREMENTS/<customer-slug>.md`.
- Must follow `REQUIREMENTS/_TEMPLATE.md` structure: customer metadata, original spec, contract notes, sales handoff notes.
- Loaded by `src/lib/requirementsLoader.js` which parses markdown sections into a structured object.
- If a required section is missing, loader throws with a clear message — do not silently default.

## Run Artifacts

- Each invocation creates `runs/<YYYY-MM-DD>_<customer-slug>_<hash>/`.
- All artifacts written there, never elsewhere.
- `conversation.jsonl` is append-only and written incrementally as the run proceeds, not at the end. This means a crashed run still leaves a useful trace.

## What Claude Code Should Do When Scaffolding

1. Create the full directory tree above.
2. Write `package.json` with dependencies pinned to recent stable versions.
3. Write `.env.example`, `.gitignore` (include `runs/`, `node_modules/`, `.env`), `.eslintrc.json`, `.prettierrc`.
4. Write all source files with real implementations — no placeholders, no TODO comments standing in for logic.
5. Write `REQUIREMENTS/_TEMPLATE.md` and `REQUIREMENTS/meridian-auto-finance.md` with the seed scenario.
6. Write `docs/architecture.md`, `docs/agent-design.md`, `docs/workflow-phases.md`.
7. Write a README explaining setup, env vars, how to run, and how to interpret console output.
8. Run `npm install`, `npm run lint`, `npm run format` and confirm clean.
9. Run the system end-to-end against the Meridian seed and paste full console output back to the user.

## What Claude Code Should Not Do

- Do not commit `.env` or anything in `runs/`.
- Do not write tests for the prototype.
- Do not invent customer requirements — only the seed example.
- Do not generate Python code into `src/` or commit it. Generated code lives only in `runs/<run-id>/code/`.
- Do not add dependencies beyond what's needed. Justify any package not listed in this file.

## Approved Dependencies

- `@langchain/langgraph`
- `@anthropic-ai/sdk`
- `chalk` (logging colors)
- `yargs` or `commander` (CLI args)
- `dotenv`
- `better-sqlite3` (LangGraph checkpointer)
- `eslint`, `prettier`, and their standard plugin set (dev)

Anything else requires explicit user approval before adding.
