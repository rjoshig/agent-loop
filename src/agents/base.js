// Thin wrapper around the Anthropic SDK. Loads the per-agent system prompt,
// invokes Claude, and parses the structured JSON response. All agents go
// through this so retry / error handling / parsing is uniform.

import fs from 'node:fs/promises';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';

import { MAX_TOKENS, MODEL, PATHS } from '../config.js';
import { logError } from '../lib/logger.js';

let client = null;

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.');
    }
    client = new Anthropic();
  }
  return client;
}

const promptCache = new Map();

async function loadPrompt(promptFile) {
  if (promptCache.has(promptFile)) return promptCache.get(promptFile);
  const full = path.resolve(PATHS.prompts, promptFile);
  const text = await fs.readFile(full, 'utf-8');
  promptCache.set(promptFile, text);
  return text;
}

export async function callAgent({ agentName, promptFile, userMessage, extraSystem }) {
  const systemBase = await loadPrompt(promptFile);
  const system = extraSystem
    ? `${systemBase}\n\n# Additional context\n\n${extraSystem}`
    : systemBase;

  let response;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    logError(`Claude API call failed for agent ${agentName}`, err);
    throw err;
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return parseAgentResponse(text, agentName);
}

export function parseAgentResponse(raw, agentName) {
  if (!raw || raw.length === 0) {
    throw new Error(`Agent ${agentName} returned an empty response.`);
  }
  const jsonText = extractJson(raw);
  if (!jsonText) {
    throw new Error(
      `Agent ${agentName} returned no parseable JSON. First 300 chars: ${raw.slice(0, 300)}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(
      `Agent ${agentName} returned malformed JSON: ${err.message}. First 300 chars: ${jsonText.slice(0, 300)}`
    );
  }

  for (const key of ['message', 'approved', 'concerns', 'spec_updates']) {
    if (!(key in parsed)) {
      throw new Error(`Agent ${agentName} response missing required field: "${key}".`);
    }
  }
  if (typeof parsed.approved !== 'boolean') {
    throw new Error(`Agent ${agentName} returned non-boolean "approved": ${parsed.approved}`);
  }
  if (!Array.isArray(parsed.concerns)) {
    throw new Error(`Agent ${agentName} returned non-array "concerns".`);
  }
  if (parsed.spec_updates !== null && typeof parsed.spec_updates !== 'object') {
    throw new Error(`Agent ${agentName} returned non-object "spec_updates".`);
  }
  return parsed;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1).trim();
}
