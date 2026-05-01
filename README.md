# agent-loop

Multi-agent orchestration for a credit bureau's customer onboarding workflow.
Three agents — **CSC**, **Compliance**, **Tech** — deliberate over a customer
spec, enrich it with regulatory and operational considerations, generate the
Python monitoring code, and QC the result. Built on LangGraph.js, with a
provider-agnostic LLM layer that supports both Anthropic (Claude) and Grok
(xAI) via a single `LLM_PROVIDER` env var.

## Setup

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
# Edit .env: pick LLM_PROVIDER and set the matching API key.
```

## LLM provider

`LLM_PROVIDER` in `.env` selects the backend. The agents and nodes are
provider-agnostic; only `src/agents/base.js` cares which one is in use.

| Provider    | SDK                     | Default model       | Required key        |
| ----------- | ----------------------- | ------------------- | ------------------- |
| `anthropic` | `@anthropic-ai/sdk`     | `claude-sonnet-4-5` | `ANTHROPIC_API_KEY` |
| `grok`      | `openai` (xAI base URL) | `grok-4`            | `XAI_API_KEY`       |

Override the model with `LLM_MODEL`. Override the base URL with `LLM_BASE_URL`
(useful for self-hosted OpenAI-compatible gateways).

## Run

One invocation = one customer = one run directory under `runs/`.

```bash
node src/index.js --customer meridian-auto-finance
```

Add `--auto-approve` to bypass the interactive human gate (useful for demos).

## Lint and format

```bash
npm run lint
npm run format
```

Both must pass clean before any change is considered done.

## What you'll see

The console prints color-coded turns:

- **CSC** (cyan) — speaks for the customer's stated outcome
- **Compliance** (yellow) — surfaces FCRA / GLBA / contractual gaps
- **Tech** (green) — covers buildability, security, operability
- **System** (gray) — phase headers and bookkeeping
- **Human** (magenta) — decisions you make at the human gate

Each turn is also appended to `runs/<run-id>/conversation.jsonl` for replay.

## Run artifacts

After a run, `runs/<YYYY-MM-DD>_<customer-slug>_<6-char-hash>/` contains:

| File                  | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `conversation.jsonl`  | Append-only log of every agent turn. Written incrementally. |
| `enriched-spec.json`  | The post-deliberation spec that fed into Build.             |
| `human-decision.json` | Whether the operator approved at the human gate.            |
| `code/`               | The Python monitoring script generated in Build.            |
| `qc-report.md`        | Per-agent findings from the QC phase.                       |
| `checkpoint.sqlite`   | Per-step state snapshots for forensic replay.               |
| `final-state.json`    | Slim end-of-run summary.                                    |

## Adding a new customer

1. Copy `REQUIREMENTS/_TEMPLATE.md` to `REQUIREMENTS/<your-slug>.md`.
2. Fill in **Customer Metadata**, **Original Spec**, **Contract Notes**,
   and **Sales Handoff Notes**. Missing sections cause the loader to throw.
3. Run `node src/index.js --customer <your-slug>`.

## Repo layout

See `docs/architecture.md` for the full module map.

- `src/index.js` — CLI entrypoint
- `src/graph/` — LangGraph state schema, edges, assembly
- `src/nodes/` — one file per workflow phase
- `src/agents/` — one file per role (CSC, Compliance, Tech)
- `src/prompts/` — markdown system prompts (editable by non-engineers)
- `src/lib/` — pure utilities (logger, consensus, requirements, checkpointer)
- `REQUIREMENTS/` — customer-authored input specs
- `runs/` — per-execution artifacts (gitignored)
- `docs/` — architecture, agent design, workflow phases

## Troubleshooting

- **`ANTHROPIC_API_KEY is not set`** — `LLM_PROVIDER=anthropic` requires this. Set it, or switch to `LLM_PROVIDER=grok` and set `XAI_API_KEY`.
- **`No API key found for LLM_PROVIDER=grok`** — set `XAI_API_KEY` (get one at <https://console.x.ai>).
- **`Unsupported LLM_PROVIDER`** — must be `anthropic` or `grok`. Check `.env`.
- **Loader throws on missing section** — your `REQUIREMENTS/<slug>.md` is missing a required `## Heading`. Compare against `_TEMPLATE.md`.
- **Agent returned malformed JSON** — a prompt regression. Check `runs/<run-id>/conversation.jsonl`, fix the relevant `src/prompts/*.md`, re-run.
- **Run halted with `haltReason`** — phase didn't converge within its round cap, or a human rejected at the gate. The reason is printed to console and stored in `final-state.json`.
