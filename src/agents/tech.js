// Tech agent. Operates in three modes: REVIEW (spec review), BUILD (code
// generation), and QC (post-build review). The mode is encoded in the user
// message; the system prompt branches its output expectations on it.

import { callAgent } from './base.js';

export async function runTech(state, { mode, instruction }) {
  const userMessage = buildTechMessage(state, { mode, instruction });
  return callAgent({
    agentName: 'Tech',
    promptFile: 'tech.md',
    userMessage,
  });
}

function buildTechMessage(state, { mode, instruction }) {
  const recentTurns = state.conversation.slice(-6);
  const enrichedSpec = state.enrichedSpec ?? {};
  const customer = state.customer ?? {};

  const sections = [
    `Mode: ${mode}.`,
    instruction ? `Instruction: ${instruction}` : null,
    '',
    '## Customer',
    `Name: ${customer.metadata?.name ?? customer.slug}`,
    `Active accounts: ${customer.metadata?.active_accounts ?? 'unspecified'}`,
    '',
    '## Original spec (verbatim)',
    customer.originalSpec ?? '(missing)',
    '',
    '## Current enriched spec',
    JSON.stringify(enrichedSpec, null, 2),
  ];

  if (mode === 'BUILD') {
    sections.push(
      '',
      '## Build instructions',
      'Generate a self-contained Python monitoring script implementing the enriched spec.',
      'Required deliverables (each as one entry in spec_updates.generated_files):',
      '  1. monitor.py — main script. Reads inputs, applies flagging rules, writes the CSV.',
      '  2. requirements.txt — pinned Python dependencies.',
      '  3. README.md — how to run, env vars, scheduling notes, known limitations.',
      'Constraints:',
      '  - Python 3.11+. Standard library preferred; pandas allowed.',
      '  - No credentials in code. Read SFTP creds and any secrets from env vars.',
      '  - Structured logging (json) to stdout; never log full PII.',
      '  - Idempotent on retry; deterministic given identical inputs.',
      '  - Exit nonzero on any failure that should page on-call.',
      '  - The file must conform to the column list in the enriched spec.',
      'Return one JSON object per your BUILD-mode output format.'
    );
  } else if (mode === 'QC') {
    const fileSummary = (state.generatedCode?.files ?? []).map((f) => ({
      path: f.path,
      bytes: f.content?.length ?? 0,
    }));
    sections.push(
      '',
      '## Generated code under review',
      JSON.stringify(fileSummary, null, 2),
      '',
      '## Generated code contents',
      formatGeneratedFiles(state.generatedCode?.files ?? [])
    );
  }

  sections.push('', '## Recent deliberation (last 6 turns)', formatTurns(recentTurns));

  if (mode === 'BUILD') {
    sections.push(
      '',
      'Respond with the BUILD-mode JSON only — no surrounding prose, no markdown fences around the JSON object itself.'
    );
  } else {
    sections.push('', 'Respond with JSON only, per your output format.');
  }

  return sections.filter((x) => x !== null).join('\n');
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

function formatGeneratedFiles(files) {
  if (!files || files.length === 0) return '(no generated files yet)';
  return files.map((f) => `### ${f.path}\n\n\`\`\`\n${f.content ?? ''}\n\`\`\`\n`).join('\n');
}
