# Architecture

`agent-loop` is a single-process Node.js application that orchestrates three
LLM-backed agents through a fixed five-phase workflow using LangGraph.js.
This document covers what the moving parts are and how they fit together.
For workflow semantics see `workflow-phases.md`; for agent contracts see
`agent-design.md`.

## Top-down view

```
┌─────────────────────────────────────────────────────────────┐
│                      src/index.js (CLI)                     │
│  parses --customer, builds run dir, wires logger + chk-pt.  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   src/graph (StateGraph)                    │
│  enrichment → techReview → humanGate → build → qc → END     │
│  (humanGate may short-circuit to END on rejection)          │
└──────────────────────────┬──────────────────────────────────┘
                           │ each node returns Partial<State>
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    src/nodes (one per step)                 │
│  Each node owns its loop semantics (round caps, consensus). │
│  Nodes call agents; nodes never call each other directly.   │
└─────────┬──────────┬──────────┬──────────┬──────────────────┘
          │          │          │          │
          ▼          ▼          ▼          ▼
        CSC      Compliance    Tech      Human (stdin)
   (src/agents)
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│            src/agents/base.js → Anthropic SDK               │
│  Loads system prompt from src/prompts/<role>.md, calls      │
│  Claude, parses structured JSON, returns AgentResponse.     │
└─────────────────────────────────────────────────────────────┘
```

## Module map

| Path                            | Responsibility                                                      |
| ------------------------------- | ------------------------------------------------------------------- |
| `src/index.js`                  | CLI entrypoint, env / arg parsing, run-dir setup, graph invocation. |
| `src/config.js`                 | All tunables: `MODEL`, `ROUND_CAPS`, `PATHS`.                       |
| `src/graph/state.js`            | LangGraph `Annotation.Root` state schema with reducers.             |
| `src/graph/edges.js`            | Pure functions deciding next node per phase.                        |
| `src/graph/index.js`            | StateGraph assembly + `compile()`.                                  |
| `src/nodes/*.js`                | One file per phase. Each exports `async (state) => Partial<State>`. |
| `src/agents/base.js`            | Anthropic client, prompt loading, JSON-response parser.             |
| `src/agents/csc.js`             | CSC user-message construction.                                      |
| `src/agents/compliance.js`      | Compliance user-message construction.                               |
| `src/agents/tech.js`            | Tech user-message construction (REVIEW / BUILD / QC).               |
| `src/prompts/*.md`              | Markdown system prompts, editable by non-engineers.                 |
| `src/lib/logger.js`             | The only module allowed to call `console.*`.                        |
| `src/lib/consensus.js`          | Pure approval-counting helpers.                                     |
| `src/lib/requirementsLoader.js` | Parses `REQUIREMENTS/<slug>.md` into structured state.              |
| `src/lib/checkpointer.js`       | Writes per-step state snapshots into a sqlite file.                 |
| `runs/`                         | Per-execution artifacts. Gitignored.                                |
| `REQUIREMENTS/`                 | Customer-authored input specs.                                      |

## State

State is a plain object whose shape is declared in `src/graph/state.js`.
Mutations happen only through node return values. Append-only fields
(`conversation`) use a concat reducer; merge-style fields (`enrichedSpec`,
`approvals`) use shallow-merge reducers.

Approvals are reset at the start of each phase by writing
`approvals: { csc: false, compliance: false, tech: false }`. We intentionally
do not carry an approval from one phase to the next — a Compliance approval
of the enriched spec does not constitute a Compliance approval of the
generated code.

## Logging and traces

- All console output goes through `src/lib/logger.js`. The ESLint config
  enforces this with `no-console: warn`, with overrides for `logger.js` and
  `index.js` (which prints the final summary).
- Each agent turn is appended to `runs/<run-id>/conversation.jsonl` as one
  JSON object per line — written incrementally so a crashed run still leaves
  a useful trace.
- Each node also writes a state snapshot to
  `runs/<run-id>/checkpoint.sqlite` via `src/lib/checkpointer.js`.

## Where the LLM is called

Only `src/agents/base.js`. Everything in `src/lib/` is pure — no API calls.
This separation is what lets us test parsing, consensus, and requirements
loading without burning tokens.

## Determinism and replay

Runs are not bit-for-bit reproducible (the model is stochastic) but the
inputs are: requirements file + config + git SHA fully describe what was
asked. The artifact set in `runs/<run-id>/` (raw conversation, enriched
spec, generated code, QC report, sqlite checkpoint) is sufficient for an
auditor to reconstruct what happened on any given run.
