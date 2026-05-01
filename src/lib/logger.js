// Single allowed home for console output. Every other module routes through
// the helpers here so we keep formatting consistent and append every agent
// turn to the per-run conversation.jsonl trace.

import fs from 'node:fs';
import chalk from 'chalk';

const COLORS = {
  CSC: chalk.cyan,
  Compliance: chalk.yellow,
  Tech: chalk.green,
  System: chalk.gray,
  Human: chalk.magenta,
};

let conversationLogPath = null;

export function setConversationLogPath(filePath) {
  conversationLogPath = filePath;
}

export function logAgent({ phase, round, agent, body, payload }) {
  const color = COLORS[agent] ?? chalk.white;
  const header = color.bold(`[Phase ${phase} · Round ${round} · ${agent}]`);
  console.log(`\n${header}`);
  for (const line of String(body ?? '').split('\n')) {
    console.log(`  ${line}`);
  }
  appendConversation({
    ts: new Date().toISOString(),
    phase,
    round,
    agent,
    body: body ?? '',
    payload: payload ?? null,
  });
}

export function logSystem(msg) {
  console.log(chalk.gray(`[System] ${msg}`));
  appendConversation({
    ts: new Date().toISOString(),
    phase: 'system',
    round: 0,
    agent: 'System',
    body: msg,
    payload: null,
  });
}

export function logHuman(msg) {
  console.log(chalk.magenta.bold(`[Human] ${msg}`));
  appendConversation({
    ts: new Date().toISOString(),
    phase: 'humanGate',
    round: 0,
    agent: 'Human',
    body: msg,
    payload: null,
  });
}

export function logPhaseHeader(phase) {
  const banner = chalk.bgBlue.white.bold(` PHASE: ${phase} `);
  console.log(`\n${banner}`);
}

export function logError(msg, err) {
  console.error(chalk.red.bold(`[Error] ${msg}`));
  if (err) {
    console.error(chalk.red(err.stack ?? err.message ?? String(err)));
  }
}

function appendConversation(entry) {
  if (!conversationLogPath) return;
  try {
    fs.appendFileSync(conversationLogPath, JSON.stringify(entry) + '\n');
  } catch (err) {
    // If we can't write the trace, fall back to stderr so the run still surfaces it.
    console.error(chalk.red(`[Logger] Failed to append conversation entry: ${err.message}`));
  }
}
