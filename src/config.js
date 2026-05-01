// Central tunables. Everything that an operator might want to tweak between
// runs lives here so node and agent code stays declarative.

export const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

export const MAX_TOKENS = 4096;

export const ROUND_CAPS = {
  enrichment: 4,
  techReview: 3,
  qc: 2,
};

export const PATHS = {
  requirements: 'REQUIREMENTS',
  runs: 'runs',
  prompts: 'src/prompts',
};

export const PHASES = {
  enrichment: 'enrichment',
  techReview: 'techReview',
  humanGate: 'humanGate',
  build: 'build',
  qc: 'qc',
  done: 'done',
};

export const AGENT_NAMES = {
  csc: 'CSC',
  compliance: 'Compliance',
  tech: 'Tech',
};
