// Phase 3: human gate.
//
// Blocks on stdin and asks the operator to approve, reject, or annotate the
// enriched spec before code generation. Set AUTO_APPROVE_HUMAN_GATE=true in
// the environment to bypass for demo runs.

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { saveCheckpoint } from '../lib/checkpointer.js';
import { logHuman, logPhaseHeader, logSystem } from '../lib/logger.js';

export async function runHumanGate(state) {
  logPhaseHeader('3 · Human Gate');

  const decision =
    process.env.AUTO_APPROVE_HUMAN_GATE === 'true' ? autoApproved() : await promptHuman(state);

  await persistDecision(state.runDir, decision);
  saveCheckpoint('humanGate.decision', { ...state, humanDecision: decision });

  return {
    phase: decision.approved ? 'build' : 'done',
    humanDecision: decision,
    haltReason: decision.approved ? null : 'Human reviewer rejected the enriched spec.',
  };
}

function autoApproved() {
  return {
    approved: true,
    notes: 'Auto-approved via AUTO_APPROVE_HUMAN_GATE=true.',
    ts: new Date().toISOString(),
  };
}

async function promptHuman(state) {
  logSystem('Review the enriched spec at runs/<this-run>/enriched-spec.json before answering.');
  logSystem(`Run dir: ${state.runDir}`);

  const rl = readline.createInterface({ input, output });
  try {
    const answer = (await rl.question('\nApprove enriched spec for build? [y/N]: ')).trim();
    const approved = /^y(es)?$/i.test(answer);
    const notes = (await rl.question('Notes (optional, press enter to skip): ')).trim();
    logHuman(approved ? 'Approved.' : 'Rejected.');
    if (notes) logHuman(`Notes: ${notes}`);
    return {
      approved,
      notes: notes || null,
      ts: new Date().toISOString(),
    };
  } finally {
    rl.close();
  }
}

async function persistDecision(runDir, decision) {
  if (!runDir) return;
  const out = path.join(runDir, 'human-decision.json');
  await fs.writeFile(out, JSON.stringify(decision, null, 2));
}
