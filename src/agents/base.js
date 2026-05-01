// Provider-agnostic agent caller. Loads the per-agent system prompt, dispatches
// to the right SDK based on LLM_PROVIDER, and parses the structured JSON
// response. All agents go through this so retry / error handling / parsing is
// uniform regardless of which provider is in use.
//
// Anthropic: native @anthropic-ai/sdk against api.anthropic.com.
// Grok (and any OpenAI-compatible endpoint): the openai SDK pointed at the
// provider's /v1 base URL — xAI exposes an OpenAI-shaped chat-completions API.

import fs from 'node:fs/promises';
import path from 'node:path';

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

import {
  LLM_BASE_URL,
  LLM_PROVIDER,
  MAX_TOKENS,
  MODEL,
  PATHS,
  SUPPORTED_PROVIDERS,
} from '../config.js';
import { logError } from '../lib/logger.js';

let anthropicClient = null;
let openAiClient = null;

function getAnthropicClient() {
  if (!anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Either set it, or switch LLM_PROVIDER in .env.'
      );
    }
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

function getOpenAiClient() {
  if (!openAiClient) {
    const apiKey = pickOpenAiKey();
    if (!apiKey) {
      throw new Error(
        `No API key found for LLM_PROVIDER=${LLM_PROVIDER}. ` +
          'Set XAI_API_KEY (Grok) or OPENAI_API_KEY, or switch LLM_PROVIDER in .env.'
      );
    }
    openAiClient = new OpenAI({
      apiKey,
      baseURL: LLM_BASE_URL ?? undefined,
    });
  }
  return openAiClient;
}

function pickOpenAiKey() {
  if (LLM_PROVIDER === 'grok') return process.env.XAI_API_KEY || process.env.OPENAI_API_KEY;
  return process.env.OPENAI_API_KEY || process.env.XAI_API_KEY;
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
  if (!SUPPORTED_PROVIDERS.includes(LLM_PROVIDER)) {
    throw new Error(
      `Unsupported LLM_PROVIDER="${LLM_PROVIDER}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`
    );
  }

  const systemBase = await loadPrompt(promptFile);
  const system = extraSystem
    ? `${systemBase}\n\n# Additional context\n\n${extraSystem}`
    : systemBase;

  const text =
    LLM_PROVIDER === 'anthropic'
      ? await callAnthropic({ agentName, system, userMessage })
      : await callOpenAiCompatible({ agentName, system, userMessage });

  return parseAgentResponse(text, agentName);
}

async function callAnthropic({ agentName, system, userMessage }) {
  let response;
  try {
    response = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    logError(`Anthropic API call failed for agent ${agentName}`, err);
    throw err;
  }
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

async function callOpenAiCompatible({ agentName, system, userMessage }) {
  let response;
  try {
    response = await getOpenAiClient().chat.completions.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
    });
  } catch (err) {
    logError(`${LLM_PROVIDER} API call failed for agent ${agentName}`, err);
    throw err;
  }
  const choice = response?.choices?.[0]?.message?.content;
  return (typeof choice === 'string' ? choice : '').trim();
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
