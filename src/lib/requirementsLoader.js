// Parses REQUIREMENTS/<slug>.md into a structured record. The agents read
// from these fields directly, so missing sections must fail loudly here
// rather than silently degrade the spec.

import fs from 'node:fs/promises';
import path from 'node:path';

import { PATHS } from '../config.js';

const REQUIRED_SECTIONS = [
  'Customer Metadata',
  'Original Spec',
  'Contract Notes',
  'Sales Handoff Notes',
];

export async function loadRequirements(slug, baseDir = PATHS.requirements) {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(
      `Invalid customer slug "${slug}". Slugs must be lowercase kebab-case (a-z, 0-9, hyphens).`
    );
  }
  const filePath = path.join(baseDir, `${slug}.md`);
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Could not read requirements file at ${filePath}: ${err.message}`);
  }

  const sections = parseMarkdownSections(raw);
  for (const required of REQUIRED_SECTIONS) {
    if (!(required in sections) || sections[required].trim().length === 0) {
      throw new Error(
        `Requirements file ${filePath} is missing or empty section: "## ${required}"`
      );
    }
  }

  return {
    slug,
    filePath,
    raw,
    sections,
    metadata: parseMetadata(sections['Customer Metadata']),
    originalSpec: sections['Original Spec'],
    contractNotes: sections['Contract Notes'],
    salesNotes: sections['Sales Handoff Notes'],
  };
}

function parseMarkdownSections(md) {
  const lines = md.split('\n');
  const sections = {};
  let current = null;
  let buffer = [];
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (current !== null) sections[current] = buffer.join('\n').trim();
      current = heading[1].trim();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  if (current !== null) sections[current] = buffer.join('\n').trim();
  return sections;
}

function parseMetadata(block) {
  const out = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/^\s*-\s*/, '').trim();
    if (!line) continue;
    const m = line.match(/^\*\*(.+?):\*\*\s*(.+)$/) || line.match(/^(.+?):\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
    out[key] = m[2].trim();
  }
  return out;
}
