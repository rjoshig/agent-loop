#!/usr/bin/env node
// CLI entry point. One invocation = one customer = one run directory.

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Command } from 'commander';
import 'dotenv/config';

import { PATHS } from './config.js';
import { buildGraph } from './graph/index.js';
import { closeCheckpointer, initCheckpointer } from './lib/checkpointer.js';
import { logError, logSystem, setConversationLogPath } from './lib/logger.js';
import { loadRequirements } from './lib/requirementsLoader.js';

async function main() {
  const program = new Command();
  program
    .name('agent-loop')
    .description('Multi-agent orchestration for credit-bureau customer onboarding.')
    .requiredOption('-c, --customer <slug>', 'Customer slug (matches REQUIREMENTS/<slug>.md)')
    .option('--auto-approve', 'Skip the interactive human gate (sets AUTO_APPROVE_HUMAN_GATE=true)')
    .parse(process.argv);

  const opts = program.opts();
  if (opts.autoApprove) process.env.AUTO_APPROVE_HUMAN_GATE = 'true';

  const customer = await loadRequirements(opts.customer);

  const { runId, runDir } = await prepareRunDir(customer.slug);
  setConversationLogPath(path.join(runDir, 'conversation.jsonl'));
  initCheckpointer(runDir);

  logSystem(`Run ID: ${runId}`);
  logSystem(`Run dir: ${runDir}`);
  logSystem(`Customer: ${customer.metadata?.name ?? customer.slug}`);

  const graph = buildGraph();
  const initialState = {
    customer,
    runId,
    runDir,
    phase: 'enrichment',
    round: 0,
    enrichedSpec: {},
    conversation: [],
    approvals: { csc: false, compliance: false, tech: false },
    humanDecision: null,
    generatedCode: null,
    qcReport: null,
    haltReason: null,
  };

  let finalState;
  try {
    finalState = await graph.invoke(initialState, { recursionLimit: 50 });
  } finally {
    closeCheckpointer();
  }

  await writeFinalSummary(runDir, finalState);
  printFinalSummary(finalState);
}

async function prepareRunDir(slug) {
  const date = new Date().toISOString().slice(0, 10);
  const hash = crypto.randomBytes(3).toString('hex');
  const runId = `${date}_${slug}_${hash}`;
  const runDir = path.resolve(PATHS.runs, runId);
  await fs.mkdir(runDir, { recursive: true });
  return { runId, runDir };
}

async function writeFinalSummary(runDir, state) {
  const out = path.join(runDir, 'final-state.json');
  // Strip the rawSpec text from customer to keep file small; it's already in REQUIREMENTS/.
  const slim = {
    runId: state.runId,
    phase: state.phase,
    haltReason: state.haltReason,
    customer: {
      slug: state.customer?.slug,
      metadata: state.customer?.metadata,
    },
    enrichedSpec: state.enrichedSpec,
    humanDecision: state.humanDecision,
    generatedFiles: state.generatedCode?.files?.map((f) => ({
      path: f.path,
      bytes: f.content?.length ?? 0,
    })),
    qcReport: state.qcReport,
    conversationCount: state.conversation?.length ?? 0,
  };
  await fs.writeFile(out, JSON.stringify(slim, null, 2));
}

function printFinalSummary(state) {
  console.log('\n=== Run complete ===');
  console.log(`Phase reached: ${state.phase}`);
  if (state.haltReason) console.log(`Halt reason: ${state.haltReason}`);
  console.log(`Conversation turns: ${state.conversation?.length ?? 0}`);
  if (state.qcReport) {
    const a = state.qcReport.finalApprovals;
    console.log(
      `QC final approvals → CSC=${a.csc} · Compliance=${a.compliance} · Tech=${a.tech} · unanimous=${state.qcReport.unanimous}`
    );
  }
  console.log(`Artifacts: ${state.runDir}`);
}

main().catch((err) => {
  logError('Run failed', err);
  closeCheckpointer();
  process.exit(1);
});
