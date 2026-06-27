/**
 * Seed one completed conversational round so the dashboard/history have content.
 * Usage: npm run seed
 */
import { randomUUID } from 'crypto';
import db from './db.js';
import { buildScenario, benchTurn, debrief, buildSummary, MODES } from './generator.js';

const DEMO = `IN THE COURT OF APPEAL
Vantage Logistics Pte Ltd (Appellant) v Meridian Cold Chain Pte Ltd (Respondent)

Meridian supplied refrigerated transport to Vantage under a 24-month framework agreement. Clause 8 provided that "time is of the essence" for each scheduled collection, and clause 8.3 gave a 48-hour cure period for any missed slot. Two delays spoiled a consignment of vaccines worth S$240,000. Clause 12 provided that no waiver of any breach shall operate as a waiver of any subsequent breach. Vantage purported to terminate on 2 May citing repudiatory breach.`;

const opts = { mode: 'both', opponent: 'Judge', persona: 'Surgical', difficulty: 'Intermediate' };

const existing = db.prepare("SELECT id FROM sessions WHERE source_name='seed'").get();
if (existing) {
  console.log('Seed session already present — nothing to do.');
  process.exit(0);
}

const scenario = await buildScenario(DEMO, opts);
const sessionId = randomUUID();
const now = new Date().toISOString();

const insS = db.prepare(`
  INSERT INTO sessions (id,title,doc_kind,mode,opponent,persona,difficulty,duration,minutes,scenario,engine,source_name,source_pages,source_chars,status,score,summary,debrief,created_at,completed_at)
  VALUES (@id,@title,@doc_kind,@mode,@opponent,@persona,@difficulty,@duration,@minutes,@scenario,@engine,'seed',2,@chars,'completed',@score,@summary,@debrief,@created_at,@completed_at)`);
const insT = db.prepare(`
  INSERT INTO turns (id,session_id,ordinal,role,text,attack_type,bench_pressure,unanswered,topic,created_at)
  VALUES (@id,@session_id,@ordinal,@role,@text,@attack_type,@bench_pressure,@unanswered,@topic,@created_at)`);

// A short scripted exchange.
const advocateLines = [
  'May it please the court. We say Meridian\'s repeated late collections, unremedied after the clause 8.3 cure period, amounted to a repudiatory breach entitling Vantage to terminate.',
  'Clause 12 preserves the right: accepting one late delivery does not waive future breaches, and time was expressly of the essence under clause 8.',
];

const turns = [{ ordinal: 0, role: 'system', text: scenario.openingTask, created_at: now }];
let ord = 1;
let history = [];
for (const line of advocateLines) {
  turns.push({ ordinal: ord++, role: 'advocate', text: line, created_at: now });
  const b = await benchTurn(scenario, opts, history, line);
  turns.push({ ordinal: ord++, role: 'bench', text: b.say, attack_type: b.attackType, bench_pressure: b.benchPressure, unanswered: b.unanswered, topic: b.topic, created_at: now });
  history = turns.map((t) => ({ role: t.role, text: t.text }));
}

const d = await debrief(scenario, opts, turns, 360, 600);
const summary = buildSummary(d, MODES[opts.mode].label);

db.transaction(() => {
  insS.run({
    id: sessionId, title: scenario.title, doc_kind: scenario.docKind, mode: opts.mode,
    opponent: opts.opponent, persona: opts.persona, difficulty: opts.difficulty, duration: 'Standard', minutes: 10,
    scenario: JSON.stringify(scenario), engine: scenario.engine, chars: DEMO.length,
    score: d.overall, summary, debrief: JSON.stringify(d), created_at: now, completed_at: now,
  });
  for (const t of turns) {
    insT.run({
      id: randomUUID(), session_id: sessionId, ordinal: t.ordinal, role: t.role, text: t.text,
      attack_type: t.attack_type || null, bench_pressure: t.bench_pressure || null,
      unanswered: t.unanswered || null, topic: t.topic || null, created_at: t.created_at,
    });
  }
})();

console.log(`Seeded a completed demo round: "${scenario.title}" (${d.overall}/100).`);
process.exit(0);
