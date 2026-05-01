// Phase 1: enrichment.
//
// CSC and Compliance alternate until both approve the current enriched spec
// or the round cap is hit. Each round is one CSC turn + one Compliance turn.
// After each turn we merge the agent's spec_updates into state.enrichedSpec.

import fs from 'node:fs/promises';
import path from 'node:path';

import { runCsc } from '../agents/csc.js';
import { runCompliance } from '../agents/compliance.js';
import { ROUND_CAPS } from '../config.js';
import { bothApproved, emptyApprovals } from '../lib/consensus.js';
import { saveCheckpoint } from '../lib/checkpointer.js';
import { logAgent, logPhaseHeader, logSystem } from '../lib/logger.js';

export async function runEnrichment(state) {
  logPhaseHeader('1 · Enrichment (CSC + Compliance)');

  let enrichedSpec = { ...(state.enrichedSpec ?? {}) };
  const conversationDelta = [];
  let approvals = emptyApprovals();
  let round = 0;
  let haltReason = null;

  for (round = 1; round <= ROUND_CAPS.enrichment; round++) {
    // CSC turn.
    const cscWorkingState = {
      ...state,
      enrichedSpec,
      conversation: [...state.conversation, ...conversationDelta],
    };
    const cscResp = await runCsc(cscWorkingState, {
      mode: 'ENRICHMENT',
      instruction:
        round === 1
          ? 'This is the first pass. Translate the customer ask into a precise, testable enriched spec.'
          : 'Refine the enriched spec given the deliberation so far. Push back where peers drift from customer intent.',
    });
    logAgent({
      phase: 1,
      round,
      agent: 'CSC',
      body: cscResp.message,
      payload: cscResp,
    });
    enrichedSpec = mergeSpec(enrichedSpec, cscResp.spec_updates);
    approvals = { ...approvals, csc: cscResp.approved };
    conversationDelta.push(turn(1, round, 'CSC', cscResp));

    // Compliance turn.
    const compWorkingState = {
      ...state,
      enrichedSpec,
      conversation: [...state.conversation, ...conversationDelta],
    };
    const compResp = await runCompliance(compWorkingState, {
      mode: 'ENRICHMENT',
      instruction:
        'Identify regulatory and contractual gaps. Cite frameworks (FCRA, GLBA, ECOA, contract clauses) where relevant. Propose precise spec language.',
    });
    logAgent({
      phase: 1,
      round,
      agent: 'Compliance',
      body: compResp.message,
      payload: compResp,
    });
    enrichedSpec = mergeSpec(enrichedSpec, compResp.spec_updates);
    approvals = { ...approvals, compliance: compResp.approved };
    conversationDelta.push(turn(1, round, 'Compliance', compResp));

    saveCheckpoint(`enrichment.round.${round}`, {
      ...state,
      phase: 'enrichment',
      round,
      enrichedSpec,
      approvals,
      conversation: [...state.conversation, ...conversationDelta],
    });

    if (bothApproved(approvals)) {
      logSystem(`Enrichment converged after round ${round}.`);
      break;
    }
  }

  if (!bothApproved(approvals)) {
    haltReason = `Enrichment failed to converge within ${ROUND_CAPS.enrichment} rounds. Last approvals: ${JSON.stringify(approvals)}.`;
    logSystem(haltReason);
  }

  await persistEnrichedSpec(state.runDir, enrichedSpec);

  return {
    phase: 'techReview',
    round: 0,
    enrichedSpec,
    conversation: conversationDelta,
    // Reset approvals for the next phase.
    approvals: emptyApprovals(),
    haltReason,
  };
}

function mergeSpec(current, updates) {
  if (!updates || typeof updates !== 'object') return current;
  return { ...current, ...updates };
}

function turn(phase, round, agent, resp) {
  return {
    ts: new Date().toISOString(),
    phase,
    round,
    agent,
    body: resp.message,
    payload: {
      approved: resp.approved,
      concerns: resp.concerns,
      spec_updates: resp.spec_updates,
    },
  };
}

async function persistEnrichedSpec(runDir, spec) {
  if (!runDir) return;
  const out = path.join(runDir, 'enriched-spec.json');
  await fs.writeFile(out, JSON.stringify(spec, null, 2));
}
