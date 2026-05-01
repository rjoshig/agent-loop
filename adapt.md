# Adapt agent-loop to Private Knowledge + Constrained Tools (Pure Node, File-Based Prototype)

Read CLAUDE.md fully before doing anything else. This task extends the existing system without adding any external infrastructure. Do not break what already works.

## Hard Constraints

- Pure Node.js. No Docker, no Postgres, no Python, no system services.
- No admin rights available. Cannot install anything outside the project's node_modules.
- Everything lives inside the project directory.
- Storage is JSON and Markdown files on disk.
- Embeddings happen via the Anthropic-compatible setup already in use, OR via a pure-JS approach that needs no native deps.

This is a working prototype, not production. Optimize for clarity, file-inspectability, and zero setup friction.

## What's Changing

The current system has agents reasoning from general LLM knowledge. We're adding three things:

1. Private knowledge layer — each agent retrieves from its own scoped Markdown corpus before reasoning.
2. Constrained tool catalog — the Tech agent can only propose tools/systems on an approved list defined in YAML.
3. Citation enforcement — every agent decision must cite the document and section that justifies it.

## Required Planning Step

Before writing code:

1. Re-read CLAUDE.md.
2. Read existing src/ code to understand current agent and node structure.
3. Produce a written plan in chat (not as a file) covering:
   - New directories and modules to add
   - Existing files to modify and why
   - How retrieval will work without a vector DB
   - Migration strategy so the system still runs end-to-end at every step

Stop after the plan and wait for my approval before coding.

## Knowledge Layer (File-Based)

Each agent has its own scoped corpus as Markdown files on disk.

```
knowledge/
  csc/
    playbooks/
      account-review-onboarding.md
    sla-policies/
      default-slas.md
  compliance/
    handbook/
      fcra-604-permissible-purpose.md
      fcra-607-accuracy-integrity.md
      fcra-609-disclosures.md
      retention-policy.md
    prior-rulings/
      ruling-2024-001-account-review-cert.md
      ruling-2024-007-pii-in-deliverables.md
  tech/
    architecture-patterns/
      batch-monitoring-pattern.md
      sftp-delivery-pattern.md
    security-standards/
      pii-handling.md
```

Generate realistic seed content. Each file is 1–3 pages of substantive prose, not stubs:

- CSC seed: a credit bureau onboarding playbook covering Account Review setups, default SLAs, common customer types.
- Compliance seed: FCRA handbook excerpts referencing real section numbers (§604, §607, §609), retention guidance, and 2–3 prior internal rulings written as memos.
- Tech seed: architecture patterns for batch monitoring jobs, SFTP file delivery, PII handling.

The Compliance handbook must read like a real internal handbook — section numbers, definitions, examples, edge cases.

The whole knowledge/ tree is committed (it's seed content, not customer data).

## Retrieval (No Vector DB)

Build a hybrid retriever using only Node and on-disk files. No external services.

```
src/retrieval/
  index.js              main retriever interface
  chunker.js            markdown-aware chunker preserving section hierarchy
  bm25.js               pure-JS BM25 implementation over chunks
  embedder.js           lightweight embedding via Anthropic API or fallback
  vectorIndex.js        in-memory cosine similarity over a JSON-stored index
  hybridSearch.js       BM25 + vector combine with simple score fusion
  scopedRetrievers.js   factory: getRetrieverForAgent(agent)
```

### Approach

- Chunking: split Markdown by headings (H1/H2/H3). Each chunk preserves its section path. Aim for 200–600 token chunks.
- BM25: implement in pure JS over the chunked corpus. Standard term-frequency and IDF scoring. Tokenize on whitespace and punctuation, lowercase, basic stopword removal.
- Embeddings: For each chunk, compute an embedding once at ingest time and store the vector in a JSON file. Use the Anthropic-compatible embeddings approach the project already uses if available; otherwise, use a small pure-JS embedding fallback (the `@xenova/transformers` package runs all-MiniLM-L6-v2 in pure JS without native deps — acceptable here since it installs cleanly via npm). Confirm in your plan which path you'll take.
- Index storage: one JSON file per agent at `index/<agent>.json` containing `[{ chunk_id, text, section_path, doc_id, embedding, tokens }]`. Gitignore `index/`.
- Vector search: in-memory cosine similarity. Fast enough for thousands of chunks.
- Fusion: reciprocal rank fusion (RRF) over BM25 and vector results. Return top-k after fusion.

### Ingestion Pipeline

```
ingestion/
  ingest.js             CLI: node ingestion/ingest.js --agent compliance
  parsers/
    markdown.js         parse markdown, preserve headings as section path
  README.md             how to add documents and re-ingest
```

Ingestion reads `knowledge/<agent>/**/*.md`, chunks, embeds, writes `index/<agent>.json`. Idempotent — running again rebuilds the index cleanly.

Add an `ingest:all` npm script that ingests all three agents.

## Constrained Tool Catalog

Single source of truth at `src/tools/catalog.yaml`:

```yaml
databases:
  - name: sqlite
    use_cases: [transactional_small, local_storage]
  - name: postgresql
    use_cases: [transactional, analytical_small_scale]

messaging:
  - name: file_queue
  - name: rabbitmq

storage:
  - name: local_filesystem
  - name: s3

file_delivery:
  - name: sftp
  - name: s3_presigned_url

scheduling:
  - name: cron
  - name: node_cron

languages:
  - name: python
    versions: ["3.11", "3.12"]
  - name: nodejs
    versions: ["20", "22"]
```

Three enforcement layers:

1. Prompt layer: Tech agent's prompt explicitly says it may only use catalog items, must name them, and must escalate if no approved tool fits.
2. Tool whitelist via Anthropic tool use: define one tool per category (`proposeDatabase`, `proposeMessaging`, etc.) with `enum` parameter values loaded from `catalog.yaml` at startup. The agent literally cannot select unapproved options.
3. Validator layer: `src/validators/toolWhitelistValidator.js` parses Tech's final architecture proposal and verifies every named system exists in the catalog. Rejects with specific feedback if not.

## Citation Enforcement

Updated agent output schema:

```json
{
  "message": "string",
  "approved": true,
  "concerns": [
    {
      "issue": "string",
      "severity": "blocker | warning | nit",
      "citation": {
        "doc": "string",
        "section": "string",
        "chunk_id": "string"
      },
      "remediation": "string"
    }
  ],
  "spec_updates": {},
  "evidence_consulted": ["chunk_id_1", "chunk_id_2"]
}
```

`src/validators/citationValidator.js` confirms:
- Every concern's `citation.chunk_id` exists in chunks retrieved this turn
- `evidence_consulted` chunks were actually retrieved (no fabricated citations)
- Rejects agent output that fails either check; one retry with feedback, then escalate

## Updated Agent Flow

Each agent's flow becomes:

1. Receive task and state
2. Generate retrieval queries (the agent decides what to look up)
3. Execute retrieval against its own scoped corpus
4. Reason over retrieved chunks plus state
5. Produce structured output with citations
6. Validators run (citation, schema, plus tool whitelist for Tech)
7. If validation fails, retry once with feedback; if it still fails, escalate

Implement this as a wrapper around the existing agent base so all three agents use it uniformly.

## Repository Changes

```
agent-loop/
  CLAUDE.md                    update to reflect new conventions
  .env.example                 unchanged unless embedding fallback needs a key
  knowledge/                   NEW, committed seed content
    csc/
    compliance/
    tech/
  index/                       NEW, gitignored, generated by ingestion
  ingestion/                   NEW
    ingest.js
    parsers/
    README.md
  src/
    retrieval/                 NEW
    tools/                     NEW
      catalog.yaml
      loader.js
      definitions.js           builds Anthropic tool definitions from catalog
    validators/                NEW
      citationValidator.js
      toolWhitelistValidator.js
      schemaValidator.js
    agents/                    MODIFY: wrap with retrieval+validation
    nodes/                     MODIFY: invoke retrieval before agents
    prompts/                   REWRITE: require citations, reference catalog
  docs/
    retrieval-design.md        NEW
    tool-catalog.md            NEW
    citation-policy.md         NEW
```

## Updated CLAUDE.md

After implementing, update CLAUDE.md to document:
- New directory structure
- Citation requirement for all agent outputs
- Tool catalog as source of truth for Tech
- How to add documents to `knowledge/` and re-run ingestion
- How to add tools to `catalog.yaml`
- New approved dependencies

## Approved New Dependencies

- `js-yaml` for catalog parsing
- `gray-matter` and `remark` (or just a small custom parser) for Markdown parsing
- `@xenova/transformers` only if embeddings need a local fallback — confirm in your plan whether this is needed
- No native-compilation dependencies. No services. No CLIs beyond `node` and `npm`.

Anything else, ask first.

## Migration Constraints

- The Meridian seed scenario must keep working end-to-end at every step.
- Existing run/conversation/QC structure is unchanged.
- Round caps and phase structure are unchanged.
- Backward compatibility: `node src/index.js --customer meridian-auto-finance` runs the full upgraded flow with no extra flags. It should auto-run ingestion if `index/` is missing.

## Build Sequence

Do this in order; do not skip ahead.

1. Plan in chat and wait for approval.
2. Generate seed Markdown corpus (Compliance first — most important).
3. Build chunker and BM25.
4. Build embedder + in-memory vector index + hybrid search.
5. Build ingestion CLI; verify `index/compliance.json` is produced and inspectable.
6. Build citation validator and updated output schema.
7. Wire retrieval into Compliance agent only. Run end-to-end on Meridian. Show me output.

Stop here and wait for my review before continuing.

8. Replicate for CSC agent. Run end-to-end. Show output.
9. Build tool catalog loader, dynamic Anthropic tool definitions, whitelist validator.
10. Wire retrieval and tool whitelist into Tech agent. Run end-to-end. Show output.
11. Update CLAUDE.md and docs.
12. Final lint/format pass and full demo.

## What Not to Do

- Do not introduce Docker, Postgres, Python, or any service.
- Do not require admin rights for anything.
- Do not change the orchestration graph (phases, round caps, human gate).
- Do not change the LLM provider — Claude Sonnet remains the reasoning model.
- Do not skip seed document quality.
- Do not write tests.
- Do not generate Python code into `src/`; generated artifacts still live in `runs/`.

## Acceptance Criteria

- `npm install` followed by `npm run ingest:all` succeeds with zero external dependencies.
- `node src/index.js --customer meridian-auto-finance` runs end-to-end and shows agents retrieving real chunks, citing real section numbers, and rejecting unapproved tools.
- If I temporarily edit the Tech prompt to suggest "use MongoDB", the whitelist validator catches it.
- If I temporarily delete the §604 section from the Compliance handbook and re-ingest, the Compliance agent flags missing context rather than fabricating a citation.
- `index/` files are human-inspectable JSON.
- All lint/format passes clean.

Begin with the plan.
