// Phase 5: QC.
//
// All three agents review the generated code from their own perspectives.
// CSC: does the output match what the customer asked for?
// Compliance: does the code respect FCRA / GLBA / contractual obligations?
// Tech: is the code correct, secure, and operable?
//
// We loop up to ROUND_CAPS.qc rounds. The QC report is always written, even
// if not all agents approve, so reviewers can see the unresolved findings.

import fs from 'node:fs/promises';
import path from 'node:path';

import { runCsc } from '../agents/csc.js';
import { runCompliance } from '../agents/compliance.js';
import { runTech } from '../agents/tech.js';
import { ROUND_CAPS } from '../config.js';
import { allApproved, emptyApprovals } from '../lib/consensus.js';
import { saveCheckpoint } from '../lib/checkpointer.js';
import { logAgent, logPhaseHeader, logSystem } from '../lib/logger.js';

export async function runQc(state) {
  logPhaseHeader('5 · QC (CSC + Compliance + Tech)');

  const conversationDelta = [];
  let approvals = emptyApprovals();
  const findings = { csc: [], compliance: [], tech: [] };

  for (let round = 1; round <= ROUND_CAPS.qc; round++) {
    const baseState = {
      ...state,
      conversation: [...state.conversation, ...conversationDelta],
    };

    const cscResp = await runCsc(baseState, {
      mode: 'QC',
      instruction:
        'Review the generated code against the customer original spec and the enriched spec. Does the CSV output match what the customer asked for?',
    });
    logAgent({ phase: 5, round, agent: 'CSC', body: cscResp.message, payload: cscResp });
    conversationDelta.push(turn(5, round, 'CSC', cscResp));
    approvals = { ...approvals, csc: cscResp.approved };
    findings.csc.push({ round, approved: cscResp.approved, concerns: cscResp.concerns });

    const compResp = await runCompliance(
      { ...state, conversation: [...state.conversation, ...conversationDelta] },
      {
        mode: 'QC',
        instruction:
          'Review the generated code for regulatory and contractual fidelity. PII handling, encryption, logging, retention.',
      }
    );
    logAgent({ phase: 5, round, agent: 'Compliance', body: compResp.message, payload: compResp });
    conversationDelta.push(turn(5, round, 'Compliance', compResp));
    approvals = { ...approvals, compliance: compResp.approved };
    findings.compliance.push({ round, approved: compResp.approved, concerns: compResp.concerns });

    const techResp = await runTech(
      { ...state, conversation: [...state.conversation, ...conversationDelta] },
      {
        mode: 'QC',
        instruction:
          'Review the generated code for correctness, security, and operability. Reference specific files and lines where defects exist.',
      }
    );
    logAgent({ phase: 5, round, agent: 'Tech', body: techResp.message, payload: techResp });
    conversationDelta.push(turn(5, round, 'Tech', techResp));
    approvals = { ...approvals, tech: techResp.approved };
    findings.tech.push({ round, approved: techResp.approved, concerns: techResp.concerns });

    saveCheckpoint(`qc.round.${round}`, {
      ...state,
      phase: 'qc',
      round,
      approvals,
      conversation: [...state.conversation, ...conversationDelta],
    });

    if (allApproved(approvals)) {
      logSystem(`QC unanimous after round ${round}.`);
      break;
    }
  }

  const report = {
    runId: state.runId,
    customer: state.customer?.slug,
    finalApprovals: approvals,
    unanimous: allApproved(approvals),
    findings,
    generatedAt: new Date().toISOString(),
  };

  await persistQcReport(state.runDir, report);
  logSystem(`QC report written: ${state.runDir}/qc-report.md`);

  return {
    phase: 'done',
    qcReport: report,
    conversation: conversationDelta,
    approvals,
  };
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

async function persistQcReport(runDir, report) {
  if (!runDir) return;
  const out = path.join(runDir, 'qc-report.md');
  const md = renderQcReportMarkdown(report);
  await fs.writeFile(out, md);
}

function renderQcReportMarkdown(report) {
  const lines = [];
  lines.push(`# QC Report — ${report.customer}`);
  lines.push('');
  lines.push(`- **Run:** ${report.runId}`);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(
    `- **Final approvals:** CSC=${report.finalApprovals.csc}, Compliance=${report.finalApprovals.compliance}, Tech=${report.finalApprovals.tech}`
  );
  lines.push(`- **Unanimous:** ${report.unanimous}`);
  lines.push('');

  for (const agent of ['csc', 'compliance', 'tech']) {
    lines.push(`## ${agent.toUpperCase()} findings`);
    lines.push('');
    for (const round of report.findings[agent]) {
      lines.push(`### Round ${round.round} — approved=${round.approved}`);
      if (!round.concerns || round.concerns.length === 0) {
        lines.push('');
        lines.push('_No concerns._');
        lines.push('');
        continue;
      }
      lines.push('');
      for (const c of round.concerns) lines.push(`- ${c}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
