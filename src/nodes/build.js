// Phase 4: build.
//
// Tech generates a Python monitoring script from the approved enriched spec.
// We write the generated files to runs/<run-id>/code/ and pass them downstream
// to QC.

import fs from 'node:fs/promises';
import path from 'node:path';

import { runTech } from '../agents/tech.js';
import { saveCheckpoint } from '../lib/checkpointer.js';
import { logAgent, logPhaseHeader, logSystem } from '../lib/logger.js';

export async function runBuild(state) {
  logPhaseHeader('4 · Build (Tech generates code)');

  const techResp = await runTech(state, {
    mode: 'BUILD',
    instruction:
      'Generate the Python monitoring code per the BUILD-mode output format. Include monitor.py, requirements.txt, and README.md at minimum.',
  });
  logAgent({ phase: 4, round: 1, agent: 'Tech', body: techResp.message, payload: techResp });

  const files = Array.isArray(techResp.spec_updates?.generated_files)
    ? techResp.spec_updates.generated_files
    : [];
  if (files.length === 0) {
    const reason = 'Build phase produced no files. Halting.';
    logSystem(reason);
    return {
      phase: 'done',
      haltReason: reason,
      conversation: [turn(4, 1, 'Tech', techResp)],
    };
  }

  await writeGeneratedFiles(state.runDir, files);
  logSystem(`Wrote ${files.length} generated file(s) to ${state.runDir}/code/`);

  saveCheckpoint('build.complete', {
    ...state,
    phase: 'build',
    generatedCode: { files, generatedAt: new Date().toISOString() },
  });

  return {
    phase: 'qc',
    generatedCode: { files, generatedAt: new Date().toISOString() },
    conversation: [turn(4, 1, 'Tech', techResp)],
  };
}

async function writeGeneratedFiles(runDir, files) {
  if (!runDir) return;
  const codeDir = path.join(runDir, 'code');
  await fs.mkdir(codeDir, { recursive: true });
  for (const file of files) {
    if (!file?.path || typeof file.content !== 'string') continue;
    const safePath = file.path.replace(/^\/+/, '').replace(/\.\.\//g, '');
    const fullPath = path.join(codeDir, safePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content);
  }
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
      spec_updates: { generated_files_count: resp.spec_updates?.generated_files?.length ?? 0 },
    },
  };
}
