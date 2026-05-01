// Compliance agent. Always speaks from the regulatory perspective.

import { callAgent } from './base.js';

export async function runCompliance(state, { mode, instruction }) {
  const userMessage = buildComplianceMessage(state, { mode, instruction });
  return callAgent({
    agentName: 'Compliance',
    promptFile: 'compliance.md',
    userMessage,
  });
}

function buildComplianceMessage(state, { mode, instruction }) {
  const recentTurns = state.conversation.slice(-6);
  const enrichedSpec = state.enrichedSpec ?? {};
  const customer = state.customer ?? {};
  return [
    `Mode: ${mode}.`,
    instruction ? `Instruction: ${instruction}` : null,
    '',
    '## Customer',
    `Name: ${customer.metadata?.name ?? customer.slug}`,
    `Industry: ${customer.metadata?.industry ?? 'unspecified'}`,
    '',
    '## Original spec (verbatim)',
    customer.originalSpec ?? '(missing)',
    '',
    '## Contract notes',
    customer.contractNotes ?? '(missing)',
    '',
    '## Sales handoff notes (lower-confidence color)',
    customer.salesNotes ?? '(missing)',
    '',
    '## Current enriched spec',
    JSON.stringify(enrichedSpec, null, 2),
    '',
    '## Recent deliberation (last 6 turns)',
    formatTurns(recentTurns),
    '',
    'Respond with JSON only, per your output format. Identify regulatory gaps with statute/rule citations where applicable.',
  ]
    .filter((x) => x !== null)
    .join('\n');
}

function formatTurns(turns) {
  if (!turns || turns.length === 0) return '(no prior turns)';
  return turns
    .map((t) => {
      const concerns = t.payload?.concerns?.length
        ? ` concerns=${JSON.stringify(t.payload.concerns)}`
        : '';
      const approved = t.payload ? ` approved=${t.payload.approved}` : '';
      return `- [${t.agent}]${approved}${concerns}\n    ${(t.body ?? '').replace(/\n/g, '\n    ')}`;
    })
    .join('\n');
}
