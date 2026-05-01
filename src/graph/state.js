// LangGraph state schema. Channels with reducers (conversation, approvals)
// merge per-node updates; everything else replaces.

import { Annotation } from '@langchain/langgraph';

import { emptyApprovals } from '../lib/consensus.js';

export const State = Annotation.Root({
  // Identity
  customer: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  runId: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  runDir: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  // Lifecycle
  phase: Annotation({
    reducer: (_a, b) => b,
    default: () => 'enrichment',
  }),
  round: Annotation({
    reducer: (_a, b) => b,
    default: () => 0,
  }),

  // Working spec — agents propose updates, we merge them.
  enrichedSpec: Annotation({
    reducer: (a, b) => ({ ...(a ?? {}), ...(b ?? {}) }),
    default: () => ({}),
  }),

  // Append-only deliberation log.
  conversation: Annotation({
    reducer: (a, b) => [...(a ?? []), ...(b ?? [])],
    default: () => [],
  }),

  // Per-phase approvals. Reset between phases by writing a fresh object.
  approvals: Annotation({
    reducer: (a, b) => ({ ...(a ?? emptyApprovals()), ...(b ?? {}) }),
    default: emptyApprovals,
  }),

  // Human-gate decision.
  humanDecision: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  // Build output.
  generatedCode: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  // Final QC report.
  qcReport: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),

  // Soft halt: nodes set this to surface why a run ended early.
  haltReason: Annotation({
    reducer: (_a, b) => b,
    default: () => null,
  }),
});
