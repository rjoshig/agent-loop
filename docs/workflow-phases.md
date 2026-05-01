# Workflow Phases

A run progresses through five phases. Each phase has its own loop semantics,
round cap (in `src/config.js`), and exit conditions. The graph itself is
linear; the loops live inside each node.

## Phase 1 — Enrichment

**Node:** `src/nodes/enrichment.js`
**Round cap:** `ROUND_CAPS.enrichment = 4`
**Participants:** CSC, Compliance

Each round = one CSC turn + one Compliance turn, in that order. After every
turn we shallow-merge the agent's `spec_updates` into `state.enrichedSpec`.

**Exit:**

- Both CSC and Compliance approve in the same round → advance to phase 2.
- Cap reached without consensus → set `haltReason`, run ends at `END`.
  `runs/<run-id>/enriched-spec.json` is still written.

**Why CSC speaks first:** CSC translates customer intent into the initial
spec; Compliance reviews that against regulation. Reversing the order
biases the spec toward regulatory hedging before customer intent is
captured.

## Phase 2 — Tech Review

**Node:** `src/nodes/techReview.js`
**Round cap:** `ROUND_CAPS.techReview = 3`
**Participants:** Tech (lead), with CSC + Compliance rebuttals when Tech rejects

Each round starts with a Tech turn. If Tech approves, we exit immediately.
If Tech rejects, CSC and Compliance each get one rebuttal turn before the
next Tech turn.

**Exit:**

- Tech approves → reset approvals, advance to phase 3.
- Cap reached without Tech approval → halt with `haltReason`.

**Why Tech reviews after enrichment:** Compliance and CSC can produce
spec language that is regulatorily and commercially correct but
operationally infeasible. Tech as a separate gate prevents that from
sliding into build.

## Phase 3 — Human Gate

**Node:** `src/nodes/humanGate.js`
**Participants:** human operator (stdin)

The node prints the run dir and prompts via stdin. The operator reviews
`runs/<run-id>/enriched-spec.json` and answers `[y/N]` plus optional notes.
The decision is persisted to `runs/<run-id>/human-decision.json`.

**Bypass:** set `AUTO_APPROVE_HUMAN_GATE=true` (or pass `--auto-approve`)
for demos and CI. Production should never bypass.

**Exit:**

- Approved → phase 4.
- Rejected → run ends at `END` with `haltReason`.

## Phase 4 — Build

**Node:** `src/nodes/build.js`
**Participants:** Tech in BUILD mode

Tech generates a Python monitoring script and supporting files
(`monitor.py`, `requirements.txt`, `README.md` minimum). Files are
written under `runs/<run-id>/code/`. Generated code never lands in `src/`.

**Exit:**

- Files produced → phase 5.
- Zero files produced → halt.

## Phase 5 — QC

**Node:** `src/nodes/qc.js`
**Round cap:** `ROUND_CAPS.qc = 2`
**Participants:** CSC, Compliance, Tech (all three)

Each round = one turn from each agent in QC mode. Each agent reviews the
generated code from their own angle. After every round we check for
unanimous approval.

**Exit:**

- All three approve → unanimous, run completes successfully.
- Cap reached → run completes with `unanimous: false` in the QC report.

The QC report (`runs/<run-id>/qc-report.md`) is always written, even on
non-unanimous outcomes — the unresolved findings are exactly what the
human reviewer needs.

## Round caps and the recursion limit

LangGraph enforces a `recursionLimit` per `invoke()` call. We pass `50`,
which is overkill for the linear graph but leaves headroom if anyone
introduces graph-level cycles in the future. Per-phase round caps are the
real bound on cost.
