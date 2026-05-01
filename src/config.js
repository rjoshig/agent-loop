// Central tunables. Everything that an operator might want to tweak between
// runs lives here so node and agent code stays declarative.

export const SUPPORTED_PROVIDERS = ['anthropic', 'grok'];

export const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'anthropic').toLowerCase();

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-5',
  grok: 'grok-4',
};

const DEFAULT_BASE_URLS = {
  grok: 'https://api.x.ai/v1',
};

export const MODEL =
  process.env.LLM_MODEL || DEFAULT_MODELS[LLM_PROVIDER] || DEFAULT_MODELS.anthropic;

export const LLM_BASE_URL = process.env.LLM_BASE_URL || DEFAULT_BASE_URLS[LLM_PROVIDER] || null;

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
