// Per-run sqlite checkpoint store. We deliberately keep this independent of
// LangGraph's built-in checkpointers so we can persist whatever shape we want
// (full state snapshots keyed by phase + round) and so a crashed run still
// leaves a queryable trail in runs/<run-id>/checkpoint.sqlite.

import path from 'node:path';
import Database from 'better-sqlite3';

let instance = null;

export function initCheckpointer(runDir) {
  if (instance) {
    throw new Error('Checkpointer already initialized for this process.');
  }
  const dbPath = path.join(runDir, 'checkpoint.sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      ts        TEXT    NOT NULL,
      phase     TEXT    NOT NULL,
      round     INTEGER NOT NULL,
      label     TEXT    NOT NULL,
      state     TEXT    NOT NULL
    );
  `);
  const insert = db.prepare(
    'INSERT INTO checkpoints (ts, phase, round, label, state) VALUES (?, ?, ?, ?, ?)'
  );
  instance = {
    save(label, state) {
      insert.run(
        new Date().toISOString(),
        state?.phase ?? 'unknown',
        Number.isFinite(state?.round) ? state.round : 0,
        label,
        JSON.stringify(state ?? {})
      );
    },
    close() {
      db.close();
    },
    dbPath,
  };
  return instance;
}

export function saveCheckpoint(label, state) {
  instance?.save(label, state);
}

export function closeCheckpointer() {
  if (!instance) return;
  instance.close();
  instance = null;
}
