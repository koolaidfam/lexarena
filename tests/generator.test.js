import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../server/analyze.js';
import { buildScenario, benchTurn, debrief, buildSummary, MODES, OPPONENTS, PERSONAS } from '../server/generator.js';

// Ensure we exercise the template (no-AI) path regardless of environment.
delete process.env.ANTHROPIC_API_KEY;

const SAMPLE = `IN THE COURT OF APPEAL
Vantage Logistics Pte Ltd (Appellant) v Meridian Cold Chain Pte Ltd (Respondent)

Meridian supplied refrigerated transport under a 24-month framework agreement. Clause 8 provided that "time is of the essence" for each scheduled collection, and clause 8.3 gave a 48-hour cure period for any missed slot. Two delays spoiled a consignment worth S$240,000. The supplier shall deliver each consignment on time. This follows Maple Flock Co v Universal Furniture Products [1934] 1 KB 148. Vantage purported to terminate on 2 May citing repudiatory breach.`;

test('analyze pulls structured signals incl. citations', () => {
  const a = analyze(SAMPLE);
  assert.equal(a.docKind, 'case');
  assert.ok(a.money.some((m) => m.includes('240,000')));
  assert.ok(a.durations.some((d) => /48/.test(d)));
  assert.ok(a.clauses.some((c) => /8\.3/.test(c.label)));
  assert.ok(a.citations.some((c) => /Maple Flock/i.test(c)), 'detects the case citation');
});

test('buildScenario (fallback) is grounded in the document', async () => {
  const sc = await buildScenario(SAMPLE, { mode: 'both', opponent: 'Judge', persona: 'Surgical', difficulty: 'Intermediate' });
  assert.equal(sc.engine, 'template');
  assert.ok(sc.title && sc.legalIssue);
  assert.ok(Array.isArray(sc.keyFacts) && sc.keyFacts.length >= 1);
  assert.ok(Array.isArray(sc.dangerPoints) && sc.dangerPoints.length >= 1);
  assert.ok(sc.openingTask.length > 0);
});

const MULTI_UPLOAD_SAMPLE = `=== CASE FACTS ===
Alpha Pte Ltd (Appellant) v Beta Pte Ltd (Respondent)
Clause 4 required Beta to deliver audited inventory reports within 7 days. The missing reports caused S$80,000 in losses.

=== CLAIMANT'S ARGUMENTS ===
The Claimant submits that clause 4 is a condition. Alpha relies on Rainy Sky SA v Kookmin Bank [2011] UKSC 50. Alpha shall be awarded damages.

=== RESPONDENT'S ARGUMENTS ===
The Respondent argues the delay was waived by emails on 3 March. Beta says damages are adequate and termination would be disproportionate.`;

test('buildScenario preserves all uploaded case material sections', async () => {
  const sc = await buildScenario(MULTI_UPLOAD_SAMPLE, {
    mode: 'both',
    sourceSections: [
      { key: 'caseFacts', label: 'Case Facts', name: 'facts.pdf', pages: 2, words: 28, chars: 180 },
      { key: 'claimantArguments', label: "Claimant's Arguments", name: 'claimant.pdf', pages: 4, words: 36, chars: 220 },
      { key: 'respondentArguments', label: "Respondent's Arguments", name: 'respondent.pdf', pages: 3, words: 28, chars: 190 },
    ],
  });

  assert.equal(sc.engine, 'template');
  assert.equal(sc.caseMaterials.length, 3);
  assert.deepEqual(sc.caseMaterials.map((m) => m.name), ['facts.pdf', 'claimant.pdf', 'respondent.pdf']);
  assert.ok(sc.caseMaterials.some((m) => m.label === "Claimant's Arguments" && /Rainy Sky|damages/i.test(m.highlights.join(' '))));
  assert.ok(sc.caseMaterials.some((m) => m.label === "Respondent's Arguments" && /waived|disproportionate/i.test(m.summary + ' ' + m.highlights.join(' '))));
  assert.match(sc.claimantCase, /Claimant's Arguments:/);
  assert.match(sc.respondentCase, /Respondent's Arguments:/);
});

test('benchTurn (fallback) replies and varies by opponent', async () => {
  const sc = await buildScenario(SAMPLE, { mode: 'on-the-facts' });
  const base = { mode: 'on-the-facts', persona: 'Surgical', difficulty: 'Intermediate' };
  const judge = await benchTurn(sc, { ...base, opponent: 'Judge' }, [], 'My client was entitled to terminate.');
  const partner = await benchTurn(sc, { ...base, opponent: 'Partner' }, [], 'My client was entitled to terminate.');
  assert.ok(judge.say.length > 0);
  assert.ok(['low', 'medium', 'high'].includes(judge.benchPressure));
  assert.notEqual(judge.say, partner.say, 'opponent type changes the bench voice');
});

test('difficulty raises bench pressure', async () => {
  const sc = await buildScenario(SAMPLE, { mode: 'both' });
  const junior = await benchTurn(sc, { mode: 'both', opponent: 'Judge', persona: 'Surgical', difficulty: 'Junior' }, [], 'We say the breach was repudiatory.');
  const hostile = await benchTurn(sc, { mode: 'both', opponent: 'Judge', persona: 'Aggressive', difficulty: 'Hostile' }, [], 'We say the breach was repudiatory.');
  const rank = { low: 1, medium: 2, high: 3 };
  assert.ok(rank[hostile.benchPressure] >= rank[junior.benchPressure], 'hostile is at least as intense as junior');
});

test('question type steers what the bench presses', async () => {
  const sc = await buildScenario(SAMPLE, { mode: 'on-the-law' });
  const law = await benchTurn(sc, { mode: 'on-the-law', opponent: 'Judge', persona: 'Surgical', difficulty: 'Intermediate' }, [], 'We rely on the contract.');
  assert.ok(['Authority', 'Policy', 'Hypothetical', 'Clarification'].includes(law.attackType));
});

test('debrief (fallback) returns bounded subscores and feedback', async () => {
  const sc = await buildScenario(SAMPLE, { mode: 'both' });
  const turns = [
    { ordinal: 0, role: 'system', text: 'Open your submissions.' },
    { ordinal: 1, role: 'advocate', text: 'My client validly terminated because clause 8.3 gave a 48-hour cure period which Meridian never used, and time was of the essence under clause 8. The S$240,000 loss followed directly.' },
    { ordinal: 2, role: 'bench', text: 'But did you not waive strict compliance?', bench_pressure: 'high' },
    { ordinal: 3, role: 'advocate', text: 'Clause 12 preserves the right; accepting one late delivery does not waive future breaches under Maple Flock.' },
  ];
  const d = await debrief(sc, { mode: 'both', opponent: 'Judge', persona: 'Surgical', difficulty: 'Intermediate' }, turns, 300, 600);
  assert.ok(d.overall >= 0 && d.overall <= 100);
  assert.ok(d.subscores.responsiveness <= 25 && d.subscores.timeDiscipline <= 15);
  assert.ok(Array.isArray(d.feedback) && d.feedback.length >= 1);
  assert.ok(d.turningPoint && d.turningPoint.question);
  assert.ok(buildSummary(d, 'Both').includes('/100'));
});

test('config option maps are well-formed', () => {
  assert.deepEqual(Object.keys(MODES), ['on-the-law', 'on-the-facts', 'both']);
  assert.deepEqual(Object.keys(OPPONENTS), ['Judge', 'Partner']);
  assert.ok(Object.keys(PERSONAS).length >= 4);
});
