# Lex Arena

Turn real legal PDFs into interactive legal-training rounds. Upload a contract, case
file, memo, policy or statute excerpt; Lex Arena extracts the text, generates legal
challenge questions, scores your reasoning and gives specific, document-grounded feedback.

> **This tool is for legal education and training only. It does not provide legal advice.**

---

## What it does

1. **Upload** a PDF (drag-and-drop or click). The file is validated and parsed **in memory**.
2. **Extract** readable text on the server (`pdf-parse`). Scanned / empty / non-PDF files are rejected with clear errors.
3. **Generate** a training session — a titled round of multiple-choice and written questions grounded in the document.
4. **Choose a mode**: Issue Spotting · Clause Analysis · Compliance Review · Cross-Examination.
5. **Play** through the questions; answers are scored server-side.
6. **Review** a debrief: overall score, per-question feedback, model answers and explanations.
7. **History** of past rounds is persisted in SQLite; resume in-progress rounds or revisit completed ones.

## Architecture

```
server/
  index.js      Express app + all API routes
  db.js         SQLite schema (better-sqlite3)
  pdf.js        PDF text extraction + validation
  analyze.js    Heuristic legal-document analyzer (clauses, figures, parties, obligations…)
  generator.js  Question generation (Anthropic AI if configured, robust template fallback) + scoring
  seed.js       Optional demo data
public/
  index.html    Single-page UI (all screens)
  styles.css    Chamber / brass visual system
  app.js        Frontend controller
tests/
  generator.test.js
```

- **Backend:** Node.js + Express (ES modules).
- **Database:** SQLite via `better-sqlite3`, stored at `data/lexarena.db` (created automatically).
- **PDF parsing:** `pdf-parse`.
- **AI (optional):** Anthropic Messages API via `fetch` — no SDK dependency. If no API key is set, the app uses its built-in template generator and works fully end-to-end.

## Getting started

Requires Node.js 18+.

```bash
npm install
cp .env.example .env     # optional — only needed to enable AI generation
npm start                # http://localhost:3000
```

Then open <http://localhost:3000>, click **Try the demo brief** (no file needed) or upload your own PDF.

### Optional: enable AI question generation

Add an Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
```

Restart the server. The header badge switches from **Template engine** to **AI engine**.
If the API call fails for any reason, generation automatically falls back to templates — a
round is always produced.

### Optional: seed demo data

```bash
npm run seed
```

Adds one completed demo round so the dashboard and history are populated.

### Run the tests

```bash
npm test
```

Covers the document analyzer, the fallback question generator (every mode) and the scoring logic.

## API

| Method | Route | Purpose |
| ------ | ----- | ------- |
| `GET`  | `/api/health` | Health + whether AI is enabled |
| `GET`  | `/api/modes` | Available training modes |
| `POST` | `/api/upload` | Multipart PDF upload → validate + extract text (returns an `uploadId`) |
| `POST` | `/api/demo` | Seed an upload from the built-in demo brief (no file) |
| `POST` | `/api/sessions` | Create a session from an `uploadId` + `mode` + `count` |
| `GET`  | `/api/sessions` | List previous sessions (history) |
| `GET`  | `/api/sessions/:id` | Fetch a session (answers hidden until answered) |
| `POST` | `/api/sessions/:id/answers` | Submit + score one answer |
| `POST` | `/api/sessions/:id/complete` | Finalise score + summary |
| `DELETE` | `/api/sessions/:id` | Delete a session |

## Security & privacy

- **Documents are never written to disk or the database.** Uploaded PDFs are parsed in
  memory; the extracted text is held in a server-side store only until a session is created
  (and at most 30 minutes), then discarded. Only generated training data is persisted: the scenario outline, source summaries, transcript, scoring data and debrief. The original PDFs and full extracted text are not stored.
- File uploads are validated by **extension, MIME type, magic bytes and size** (10 MB cap),
  on both the client and the server.
- Document contents are **never written to logs** — only metadata (page/char counts).
- All inputs are validated server-side; answers are length-capped.
- A confidentiality notice and the education-only disclaimer are shown at the upload step and on results.

## Extending it later

The codebase is structured to grow into a production tool:

- **Real AI:** already wired — set `ANTHROPIC_API_KEY`. Swap the model via `ANTHROPIC_MODEL`.
- **Auth / teams:** add a `users` table and a `user_id` foreign key on `sessions`.
- **Document storage:** if you *want* to retain documents, add an opt-in store and surface it clearly in the confidentiality notice.
- **Admin / firm playbooks:** the analyzer + generator are pure functions, easy to point at a curated rubric per practice area.
- **Postgres/Prisma:** `db.js` is the single integration point to swap the datastore.

## License

MIT
