# Agent Design

The system uses three agent roles. Each is a distinct LLM persona with its
own system prompt, output contract, and decision-rights boundaries. Agents
do not have memory between calls — every relevant piece of state must be
passed in via the user message.

## Roles

### CSC — Customer Success Counselor

- **Speaks for:** the customer's stated outcome.
- **Reads:** the verbatim original spec, contract notes, sales handoff
  notes, the running enriched spec, and the recent deliberation history.
- **Approves when:** the enriched spec preserves customer value and any
  changes peers introduced are necessary, not nice-to-have.
- **Escalates when:** Compliance or Tech proposals would materially shift
  scope, cost, or timeline; CSC raises this in `concerns` so the human gate
  sees it.

### Compliance Officer

- **Speaks for:** federal and state consumer-credit law and the bureau's
  contractual obligations.
- **Reads:** the same context as CSC.
- **Frameworks applied:** FCRA (esp. permissible purpose, accuracy, dispute
  handling), GLBA Safeguards Rule, ECOA / Reg B (adverse-action notice),
  Reg V (data-furnisher integrity), bureau internal policy on PII, retention,
  and reseller restrictions.
- **Approves when:** every regulatory gap is either resolved in the spec or
  explicitly waived by CSC on the customer's behalf with rationale.

### Tech Lead

- **Speaks for:** buildability, operability, and the on-call.
- **Operates in three modes** signaled in the user message:
  - **REVIEW** — review the enriched spec for buildability (phase 2).
  - **BUILD** — generate the Python monitoring code (phase 4).
  - **QC** — review the generated code against the spec (phase 5).
- **Approves when:** in REVIEW, the spec is implementable on the promised
  timeline; in QC, the code is correct, secure, and operable.

## Output contract

Every agent returns a single JSON object:

```json
{
  "message": "string — reasoning addressed to peers",
  "approved": true,
  "concerns": ["string"],
  "spec_updates": { "field_name": "value" }
}
```

- `approved` is a strict boolean. `null` / `"yes"` are treated as malformed.
- `concerns` is an array of short strings; empty when fully satisfied.
- `spec_updates` is a free-form object; nodes shallow-merge it into
  `state.enrichedSpec`.
- In Tech BUILD mode, `spec_updates.generated_files` is an array of
  `{ path, content }` records — the actual generated code.

`src/agents/base.js` validates the shape and throws on malformed responses.
A malformed response halts the run; we do not auto-retry, because silent
retries hide prompt regressions.

## Why nodes orchestrate, not agents

Agents never call other agents. All cross-agent flow is the job of nodes.
This keeps the deliberation auditable: one node = one phase, the round
caps live in the node, and the conversation log is a flat stream of agent
turns ordered by the orchestrator.

## Authoring prompts

Prompts live in `src/prompts/<role>.md` and are intentionally markdown so
non-engineers (a Compliance lead, a CSC manager) can review and edit them
without touching JS. Each prompt has a YAML-style header listing version,
last-edited date, and reviewer.

When you change a prompt:

1. Bump `version`.
2. Update `last_edited` and `reviewer`.
3. Run a fresh end-to-end against the seed customer and diff
   `runs/<old>/conversation.jsonl` against the new run to spot regressions.
