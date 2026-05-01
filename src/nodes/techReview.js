// Phase 2: tech review.
//
// Tech reviews the enriched spec for buildability. If Tech rejects, we let
// CSC and Compliance respond once each (within the same techReview round) so
// the spec can be amended without bouncing all the way back to phase 1.
// Loop until Tech approves or the round cap is hit.

import { runCompliance } from '../agents/compliance.js';
import { runCsc } from '../agents/csc.js';
import { runTech } from '../agents/tech.js';
import { ROUND_CAPS } from '../config.js';
import { saveCheckpoint } from '../lib/checkpointer.js';
import { logAgent, logPhaseHeader, logSystem } from '../lib/logger.js';
import { emptyApprovals, techApproved } from '../lib/consensus.js';

export async function runTechReview(state) {
  logPhaseHeader('2 · Tech Review');

  let enrichedSpec = { ...(state.enrichedSpec ?? {}) };
  const conversationDelta = [];
  let approvals = emptyApprovals();
  let round = 0;
  let haltReason = null;

  for (round = 1; round <= ROUND_CAPS.techReview; round++) {
    const techState = {
      ...state,
      enrichedSpec,
      conversation: [...state.conversation, ...conversationDelta],
    };
    const techResp = await runTech(techState, {
      mode: 'REVIEW',
      instruction:
        'Review the enriched spec. Identify buildability issues, missing fields, or operational risks. Propose precise spec_updates for anything that would block a 4-week delivery.',
    });
    logAgent({ phase: 2, round, agent: 'Tech', body: techResp.message, payload: techResp });
    enrichedSpec = mergeSpec(enrichedSpec, techResp.spec_updates);
    approvals = { ...approvals, tech: techResp.approved };
    conversationDelta.push(turn(2, round, 'Tech', techResp));

    saveCheckpoint(`techReview.round.${round}.tech`, {
      ...state,
      phase: 'techReview',
      round,
      enrichedSpec,
      approvals,
      conversation: [...state.conversation, ...conversationDelta],
    });

    if (techApproved(approvals)) {
      logSystem(`Tech review approved after round ${round}.`);
      break;
    }

    // Tech wants changes — give CSC and Compliance one rebuttal each before
    // looping back to Tech.
    const cscState = {
      ...state,
      enrichedSpec,
      conversation: [...state.conversation, ...conversationDelta],
    };
    const cscResp = await runCsc(cscState, {
      mode: 'TECH_REVIEW',
      instruction:
        'Tech raised concerns. Respond from the customer-intent perspective: accept, reject, or modify their spec_updates.',
    });
    logAgent({ phase: 2, round, agent: 'CSC', body: cscResp.message, payload: cscResp });
    enrichedSpec = mergeSpec(enrichedSpec, cscResp.spec_updates);
    conversationDelta.push(turn(2, round, 'CSC', cscResp));

    const compState = {
      ...state,
      enrichedSpec,
      conversation: [...state.conversation, ...conversationDelta],
    };
    const compResp = await runCompliance(compState, {
      mode: 'TECH_REVIEW',
      instruction:
        'Tech raised concerns. Confirm whether their spec_updates are compatible with FCRA / GLBA / contractual obligations. Adjust if needed.',
    });
    logAgent({
      phase: 2,
      round,
      agent: 'Compliance',
      body: compResp.message,
      payload: compResp,
    });
    enrichedSpec = mergeSpec(enrichedSpec, compResp.spec_updates);
    conversationDelta.push(turn(2, round, 'Compliance', compResp));

    saveCheckpoint(`techReview.round.${round}.rebuttal`, {
      ...state,
      phase: 'techReview',
      round,
      enrichedSpec,
      approvals,
      conversation: [...state.conversation, ...conversationDelta],
    });
  }

  if (!techApproved(approvals)) {
    haltReason = `Tech review failed to converge within ${ROUND_CAPS.techReview} rounds.`;
    logSystem(haltReason);
  }

  return {
    phase: 'humanGate',
    round: 0,
    enrichedSpec,
    conversation: conversationDelta,
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
