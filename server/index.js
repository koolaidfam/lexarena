import 'dotenv/config';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import db from './db.js';
import { extractPdfText } from './pdf.js';
import {
  modeList, aiEnabled, MODES,
  configOptions, durationToMinutes, OPPONENTS, PERSONAS, DIFFICULTIES, DURATIONS,
  buildScenario, benchTurn, debrief, buildSummary,
} from './generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_CATEGORIES = {
  caseFacts: 'Case Facts',
  claimantArguments: "Claimant's Arguments",
  respondentArguments: "Respondent's Arguments",
};

app.use(express.json({ limit: '1mb' }));

// Re-read .env on every API call so adding your ANTHROPIC_API_KEY takes effect
// immediately — no server restart required. (override:true updates a changed value.)
app.use('/api', (req, res, next) => {
  dotenv.config({ override: true, quiet: true });
  next();
});

app.use(express.static(join(__dirname, '..', 'public')));

/* ------------------------------------------------------------
 * Transient store for extracted document text.
 * Documents are NEVER written to disk or the database. Extracted
 * text lives in memory only, and is purged after TEXT_TTL_MS.
 * ------------------------------------------------------------ */
const TEXT_TTL_MS = 30 * 60 * 1000;
const extractStore = new Map(); // uploadId -> { text, meta, ts }
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of extractStore) if (now - v.ts > TEXT_TTL_MS) extractStore.delete(k);
}, 60 * 1000).unref();

/* ------------------------------------------------------------
 * Upload handling (in-memory, validated)
 * ------------------------------------------------------------ */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const okMime = file.mimetype === 'application/pdf' || file.mimetype === 'application/x-pdf';
    const okExt = /\.pdf$/i.test(file.originalname || '');
    if (okMime && okExt) return cb(null, true);
    cb(httpErr(415, 'Only .pdf files are accepted.'));
  },
});

function httpErr(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

function normalizeCategory(value) {
  return UPLOAD_CATEGORIES[value] ? value : 'caseFacts';
}

function normalizeUploadsPayload(body = {}) {
  if (body.uploads && typeof body.uploads === 'object') {
    const out = {};
    for (const key of Object.keys(UPLOAD_CATEGORIES)) {
      const id = typeof body.uploads[key] === 'string' ? body.uploads[key].trim() : '';
      if (id) out[key] = id;
    }
    return out;
  }
  const id = typeof body.uploadId === 'string' ? body.uploadId.trim() : '';
  return id ? { caseFacts: id } : {};
}

function bundleUploads(uploadMap) {
  const parts = [];
  for (const [key, label] of Object.entries(UPLOAD_CATEGORIES)) {
    const uploadId = uploadMap[key];
    if (!uploadId) continue;
    const entry = extractStore.get(uploadId);
    if (!entry) return { error: `${label} upload expired or was not found. Please upload it again.` };
    parts.push({ key, label, uploadId, entry });
  }
  if (!parts.length) return { error: 'Upload the Case Facts PDF first.' };

  return {
    parts,
    text: parts.map(({ label, entry }) => `=== ${label.toUpperCase()} ===\n${entry.text}`).join('\n\n'),
    sourceName: parts.map(({ label, entry }) => `${label}: ${entry.meta.name}`).join(' | '),
    sourcePages: parts.reduce((sum, { entry }) => sum + (entry.meta.pages || 0), 0),
    sourceChars: parts.reduce((sum, { entry }) => sum + (entry.meta.chars || 0), 0),
    sourceSections: parts.map(({ key, label, entry }) => ({
      key,
      label,
      name: entry.meta.name,
      pages: entry.meta.pages,
      chars: entry.meta.chars,
      words: entry.meta.words,
    })),
  };
}

/* ============================================================
 * API
 * ============================================================ */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, ai: aiEnabled() });
});

app.get('/api/modes', (req, res) => {
  res.json({ modes: modeList(), ...configOptions(), ai: aiEnabled() });
});

// 1) Upload + extract
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 400;
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than the 10 MB limit.'
        : err.message;
      return res.status(status).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'No file was received.' });

    try {
      const category = normalizeCategory(req.body?.category);
      const result = await extractPdfText(req.file.buffer);
      const uploadId = randomUUID();
      extractStore.set(uploadId, {
        text: result.text,
        meta: {
          category,
          name: sanitizeName(req.file.originalname),
          size: req.file.size,
          pages: result.pages,
          chars: result.chars,
          words: result.words,
        },
        ts: Date.now(),
      });
      // Log metadata only — never document contents.
      console.log(`[upload] ${uploadId} pages=${result.pages} chars=${result.chars}`);
      res.json({
        uploadId,
        category,
        meta: extractStore.get(uploadId).meta,
        preview: result.text.slice(0, 600),
      });
    } catch (e) {
      const map = { EMPTY_FILE: 422, NOT_A_PDF: 415, PARSE_FAILED: 422, NO_TEXT: 422 };
      res.status(map[e.code] || 500).json({ error: e.message, code: e.code || 'EXTRACT_FAILED' });
    }
  });
});

// 1b) Demo document — seeds an upload from a built-in brief (no PDF needed)
app.post('/api/demo', (req, res) => {
  const uploadId = randomUUID();
  const text = DEMO_TEXT;
  extractStore.set(uploadId, {
    text,
    meta: {
      category: 'caseFacts',
      name: 'Vantage v Meridian (demo).pdf',
      size: Buffer.byteLength(text),
      pages: 2,
      chars: text.length,
      words: text.split(/\s+/).filter(Boolean).length,
    },
    ts: Date.now(),
  });
  res.json({ uploadId, category: 'caseFacts', meta: extractStore.get(uploadId).meta, preview: text.slice(0, 600) });
});

// 2) Create a session — build a scenario from the document and open the round
app.post('/api/sessions', async (req, res) => {
  try {
    const { mode, duration } = req.body || {};
    const uploads = normalizeUploadsPayload(req.body || {});
    if (!uploads.caseFacts) {
      return res.status(400).json({ error: 'Upload the Case Facts PDF first.' });
    }
    if (!mode || !MODES[mode]) {
      return res.status(400).json({ error: 'Choose a valid question type.' });
    }
    const opponent = OPPONENTS[req.body?.opponent] ? req.body.opponent : 'Judge';
    const persona = PERSONAS[req.body?.persona] ? req.body.persona : 'Surgical';
    const difficulty = DIFFICULTIES[req.body?.difficulty] ? req.body.difficulty : 'Intermediate';
    const dur = DURATIONS[duration] ? duration : 'Standard';
    const minutes = durationToMinutes(dur);

    const bundle = bundleUploads(uploads);
    if (bundle.error) {
      return res.status(410).json({ error: bundle.error });
    }
    const scenario = await buildScenario(bundle.text, { mode, opponent, persona, difficulty, sourceSections: bundle.sourceSections });
    const scenarioData = { ...scenario, sourceSections: bundle.sourceSections };

    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const insertSession = db.prepare(`
      INSERT INTO sessions (id,title,doc_kind,mode,opponent,persona,difficulty,duration,minutes,scenario,engine,source_name,source_pages,source_chars,status,created_at)
      VALUES (@id,@title,@doc_kind,@mode,@opponent,@persona,@difficulty,@duration,@minutes,@scenario,@engine,@source_name,@source_pages,@source_chars,'in_progress',@created_at)`);
    const insertTurn = db.prepare(`
      INSERT INTO turns (id,session_id,ordinal,role,text,attack_type,bench_pressure,unanswered,topic,created_at)
      VALUES (@id,@session_id,@ordinal,@role,@text,@attack_type,@bench_pressure,@unanswered,@topic,@created_at)`);

    db.transaction(() => {
      insertSession.run({
        id: sessionId, title: scenario.title, doc_kind: scenario.docKind, mode,
        opponent, persona, difficulty, duration: dur, minutes,
        scenario: JSON.stringify(scenarioData), engine: scenario.engine,
        source_name: bundle.sourceName, source_pages: bundle.sourcePages, source_chars: bundle.sourceChars,
        created_at: now,
      });
      // Opening instruction from the court.
      insertTurn.run({
        id: randomUUID(), session_id: sessionId, ordinal: 0, role: 'system',
        text: scenarioData.openingTask || 'Make your opening submission to begin.',
        attack_type: null, bench_pressure: null, unanswered: null, topic: 'Opening', created_at: now,
      });
    })();

    // Free the extracted text the moment we no longer need it.
    for (const part of bundle.parts) extractStore.delete(part.uploadId);

    res.json({ sessionId, engine: scenario.engine, ...loadSession(sessionId) });
  } catch (e) {
    console.error('[sessions] create failed:', e.message);
    res.status(500).json({ error: 'Could not build a training scenario from this document.' });
  }
});

// 3) Fetch a session (scenario + transcript; debrief only when completed)
app.get('/api/sessions/:id', (req, res) => {
  const out = loadSession(req.params.id);
  if (!out) return res.status(404).json({ error: 'Session not found.' });
  res.json(out);
});

// 4) Advocate speaks -> bench responds
app.post('/api/sessions/:id/turn', async (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });
  if (s.status === 'completed') return res.status(409).json({ error: 'This round is already complete.' });

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Say something to the bench first.' });
  if (message.length > 6000) return res.status(400).json({ error: 'That submission is too long.' });

  const scenario = JSON.parse(s.scenario);
  const opts = { mode: s.mode, opponent: s.opponent, persona: s.persona, difficulty: s.difficulty };
  const history = db.prepare('SELECT role,text,attack_type,bench_pressure FROM turns WHERE session_id=? ORDER BY ordinal').all(req.params.id);

  const nextOrdinal = (db.prepare('SELECT MAX(ordinal) m FROM turns WHERE session_id=?').get(req.params.id).m ?? -1) + 1;
  const now = new Date().toISOString();
  const insertTurn = db.prepare(`
    INSERT INTO turns (id,session_id,ordinal,role,text,attack_type,bench_pressure,unanswered,topic,created_at)
    VALUES (@id,@session_id,@ordinal,@role,@text,@attack_type,@bench_pressure,@unanswered,@topic,@created_at)`);

  // Record the advocate's turn.
  insertTurn.run({
    id: randomUUID(), session_id: req.params.id, ordinal: nextOrdinal, role: 'advocate',
    text: message, attack_type: null, bench_pressure: null, unanswered: null, topic: null, created_at: now,
  });

  let bench;
  try {
    bench = await benchTurn(scenario, opts, history, message);
  } catch (e) {
    console.error('[turn] bench failed:', e.message);
    return res.status(502).json({ error: 'The bench could not respond just now. Try again.' });
  }

  insertTurn.run({
    id: randomUUID(), session_id: req.params.id, ordinal: nextOrdinal + 1, role: 'bench',
    text: bench.say, attack_type: bench.attackType, bench_pressure: bench.benchPressure,
    unanswered: bench.unanswered, topic: bench.topic, created_at: new Date().toISOString(),
  });

  res.json({
    bench: {
      text: bench.say,
      attackType: bench.attackType,
      benchPressure: bench.benchPressure,
      unanswered: bench.unanswered,
      topic: bench.topic,
    },
  });
});

// 5) Complete the round -> debrief (score + coaching)
app.post('/api/sessions/:id/complete', async (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id=?').get(req.params.id);
  if (!s) return res.status(404).json({ error: 'Session not found.' });

  const turns = db.prepare('SELECT * FROM turns WHERE session_id=? ORDER BY ordinal').all(req.params.id);
  const advocateTurns = turns.filter((t) => t.role === 'advocate');
  if (advocateTurns.length === 0) {
    return res.status(400).json({ error: 'Make at least one submission before ending the round.' });
  }
  if (s.status === 'completed' && s.debrief) {
    return res.json(loadSession(req.params.id));
  }

  const scenario = JSON.parse(s.scenario);
  const opts = { mode: s.mode, opponent: s.opponent, persona: s.persona, difficulty: s.difficulty };
  const timeUsed = clampInt(req.body?.timeUsedSec, 0, 100000, 0);
  const timeTotal = (s.minutes || 10) * 60;

  let d;
  try {
    d = await debrief(scenario, opts, turns, timeUsed, timeTotal);
  } catch (e) {
    console.error('[complete] debrief failed:', e.message);
    return res.status(502).json({ error: 'Could not score the round just now. Try again.' });
  }

  const summary = buildSummary(d, MODES[s.mode]?.label);
  const now = new Date().toISOString();
  db.prepare(`UPDATE sessions SET status='completed', score=?, summary=?, debrief=?, completed_at=? WHERE id=?`)
    .run(d.overall, summary, JSON.stringify(d), now, req.params.id);

  res.json(loadSession(req.params.id));
});

// 6) Previous sessions (history)
app.get('/api/sessions', (req, res) => {
  const rows = db.prepare(`
    SELECT id,title,mode,doc_kind,opponent,persona,difficulty,status,score,created_at,completed_at
    FROM sessions ORDER BY created_at DESC LIMIT 50`).all();
  res.json({ sessions: rows });
});

// Delete a session (lets users clear their history)
app.delete('/api/sessions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM sessions WHERE id=?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Session not found.' });
  res.json({ ok: true });
});

/* ============================================================
 * Helpers
 * ============================================================ */
function loadSession(id) {
  const s = db.prepare('SELECT * FROM sessions WHERE id=?').get(id);
  if (!s) return null;
  const turns = db.prepare('SELECT * FROM turns WHERE session_id=? ORDER BY ordinal').all(id);
  const advocateCount = turns.filter((t) => t.role === 'advocate').length;

  return {
    id: s.id,
    title: s.title,
    docKind: s.doc_kind,
    mode: s.mode,
    modeLabel: MODES[s.mode]?.label || s.mode,
    opponent: s.opponent,
    persona: s.persona,
    difficulty: s.difficulty,
    duration: s.duration,
    minutes: s.minutes,
    engine: s.engine,
    scenario: safeParse(s.scenario),
    source: { name: s.source_name, pages: s.source_pages, chars: s.source_chars },
    status: s.status,
    exchanges: advocateCount,
    score: s.score,
    summary: s.summary,
    debrief: safeParse(s.debrief),
    createdAt: s.created_at,
    completedAt: s.completed_at,
    transcript: turns.map((t) => ({
      ordinal: t.ordinal,
      role: t.role,
      text: t.text,
      attackType: t.attack_type || undefined,
      benchPressure: t.bench_pressure || undefined,
      unanswered: t.unanswered || undefined,
      topic: t.topic || undefined,
    })),
  };
}

function safeParse(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

function sanitizeName(name) {
  return String(name || 'document.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
}
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// Catch-all error guard
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error.' });
});

const DEMO_TEXT = `IN THE COURT OF APPEAL
Vantage Logistics Pte Ltd (Appellant) v Meridian Cold Chain Pte Ltd (Respondent)

The advocate acts for Vantage, the buyer and terminating party.

Facts: Meridian supplied refrigerated transport to Vantage under a 24-month framework agreement. Clause 8 provided that "time is of the essence" for each scheduled collection, and clause 8.3 gave a 48-hour cure period for any missed slot. Between January and April, Meridian was late on 6 of 19 collections. Two of those delays spoiled a consignment of temperature-sensitive vaccines worth S$240,000. Vantage purported to terminate the agreement on 2 May, citing repudiatory breach.

Respondent's case: Meridian says the delays were minor and operational; that Vantage waived strict compliance by continuing to accept late deliveries through March without protest; and that termination was disproportionate when an award of damages would have been an adequate remedy.

Below: The trial judge found for Meridian on the waiver point and held that termination was wrongful. Vantage appeals.

Vantage's position on appeal: the cumulative effect of repeated delays, the unremedied breaches after the cure period, and the commercial purpose of a cold-chain contract (where timing is the whole point) made the breach repudiatory and entitled Vantage to terminate. Clause 12 further provided that no waiver of any breach shall operate as a waiver of any subsequent breach. The parties agree that the Respondent shall bear the costs of the consignment if the appeal succeeds.`;

app.listen(PORT, () => {
  console.log(`Lex Arena running at http://localhost:${PORT}  (AI ${aiEnabled() ? 'enabled' : 'fallback mode'})`);
});

export default app;
