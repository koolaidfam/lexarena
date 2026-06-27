import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, 'lexarena.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  doc_kind      TEXT,
  mode          TEXT NOT NULL,
  opponent      TEXT,
  persona       TEXT,
  difficulty    TEXT,
  duration      TEXT,
  minutes       INTEGER NOT NULL DEFAULT 10,
  scenario      TEXT NOT NULL,          -- JSON: issue, facts, authorities, danger points, etc.
  engine        TEXT,
  source_name   TEXT,
  source_pages  INTEGER,
  source_chars  INTEGER,
  status        TEXT NOT NULL DEFAULT 'in_progress',
  score         INTEGER,
  summary       TEXT,
  debrief       TEXT,                   -- JSON
  created_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE TABLE IF NOT EXISTS turns (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  role           TEXT NOT NULL,          -- 'system' | 'bench' | 'advocate'
  text           TEXT NOT NULL,
  attack_type    TEXT,
  bench_pressure TEXT,
  unanswered     TEXT,
  topic          TEXT,
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, ordinal);
`);

export default db;
