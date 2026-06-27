# Lex Arena

Turn real legal PDFs into interactive moot court training. Upload case facts and written arguments; Lex Arena generates a live oral-argument round where an AI bench questions, interrupts and scores you.

> **For legal education and training only. Not legal advice.**

---

## What it does

1. **Upload** up to three PDFs — Case Facts, Claimant's Arguments, Respondent's Arguments.
2. **Configure** the round: opponent type, bench persona, difficulty, duration and question focus.
3. **Argue** — speak continuously via microphone or type. The bench responds in real time with streamed replies.
4. **Real-time pipeline** — while you speak, signals (interestingness, confidence, urgency, current topic) are evaluated every 6 seconds. If the bench decides to cut in, your mic stops automatically and the bench response fires immediately.
5. **Debrief** — overall score /100, subscores, turn-by-turn feedback, model answers and the moment the round turned.
6. **History** — all rounds persist in SQLite; resume in-progress or revisit completed.

## Stack

```
server/
  index.js      Express API
  db.js         SQLite schema (better-sqlite3)
  pdf.js        PDF extraction + validation
  analyze.js    Heuristic legal-document analyser
  generator.js  Scenario, bench turn, debrief, transcript evaluation, streaming bench turn
public/
  index.html    Single-page UI
  styles.css    Visual system
  app.js        Frontend controller + real-time speech pipeline
```

**Runtime:** Node 18+ · Express · better-sqlite3 · pdf-parse  
**AI (optional):** Anthropic Messages API (streaming + non-streaming). Falls back to a template engine if no key is set.

## Getting started

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY to enable AI
npm start              # http://localhost:3000
```

Open <http://localhost:3000> and click **Try the demo brief**, or upload your own PDF.

### Enable AI

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6   # optional, this is the default
```

The header badge switches from **Template engine** to **AI engine**. API failures fall back to templates automatically — a round is always produced.

## API

| Method | Route | Purpose |
|--------|-------|-------|
| `GET` | `/api/modes` | Config options (modes, personas, difficulties…) |
| `POST` | `/api/upload` | PDF upload → extract text → return `uploadId` |
| `POST` | `/api/demo` | Load built-in demo brief |
| `POST` | `/api/sessions` | Create session from uploads + config |
| `GET` | `/api/sessions` | Session history |
| `GET` | `/api/sessions/:id` | Fetch session + transcript |
| `POST` | `/api/sessions/:id/turn` | Advocate speaks → bench replies (non-streaming) |
| `POST` | `/api/sessions/:id/stream-bench` | Advocate speaks → bench replies (SSE stream) |
| `POST` | `/api/sessions/:id/evaluate-transcript` | Score a live partial transcript |
| `POST` | `/api/sessions/:id/complete` | Finalise + generate debrief |
| `DELETE` | `/api/sessions/:id` | Delete session |

## Privacy

Uploaded PDFs are parsed in memory and **never written to disk or the database**. Extracted text is discarded the moment a session is created (30-minute maximum). Only generated training data is persisted — no document contents, no full extracted text.

## License

MIT
