import { analyze, kindLabel } from './analyze.js';
import { benchStyleDigest, principlesText } from './reference-materials.js';

/* ============================================================
 * Question type (what the bench presses on)
 * ============================================================ */
export const MODES = {
  'on-the-law': {
    label: 'On the law',
    blurb: 'The bench presses your legal reasoning — principle, authority and doctrine.',
    focus: 'legal principle, authority, doctrine and policy',
    attacks: ['Authority', 'Policy', 'Hypothetical', 'Clarification'],
  },
  'on-the-facts': {
    label: 'On the facts',
    blurb: 'The bench presses the record — clauses, figures, dates and who did what.',
    focus: 'the factual record: clauses, figures, dates, obligations and the documents',
    attacks: ['Fact', 'Clarification', 'Remedy'],
  },
  both: {
    label: 'Both',
    blurb: 'The bench moves freely between the law and the facts.',
    focus: 'both the legal principles and the factual record',
    attacks: ['Authority', 'Fact', 'Hypothetical', 'Policy', 'Clarification', 'Remedy'],
  },
};

export function modeList() {
  return Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, blurb: m.blurb }));
}

/* ------------------------------------------------------------
 * Round configuration options (drive the setup form + the bench)
 * ------------------------------------------------------------ */
export const OPPONENTS = {
  Judge: { label: 'Judge', sub: 'the bench', challenger: 'the bench', address: 'Counsel', voice: 'a judge in a live oral hearing' },
  Partner: { label: 'Partner', sub: 'internal grilling', challenger: 'the supervising partner', address: 'So', voice: 'a senior partner grilling you in chambers before a hearing' },
};
export const PERSONAS = {
  Surgical: { label: 'Surgical', sub: 'precise, cold', flavour: 'precise, cold and unforgiving about detail; never raises their voice' },
  Aggressive: { label: 'Aggressive', sub: 'relentless', flavour: 'relentless, interrupting and pressing hard for concessions' },
  Socratic: { label: 'Socratic', sub: 'hypotheticals', flavour: 'Socratic, constantly testing the answer against shifting hypotheticals' },
  Commercial: { label: 'Commercial', sub: 'why it matters', flavour: 'commercially minded, always asking why the point matters in practice' },
};
export const DIFFICULTIES = {
  Junior: { label: 'Junior', sub: 'forgiving', threshold: 0.45, pressure: 'low', heat: 1 },
  Intermediate: { label: 'Intermediate', sub: 'fair', threshold: 0.6, pressure: 'medium', heat: 2 },
  'Finals Level': { label: 'Finals Level', sub: 'sharp', threshold: 0.7, pressure: 'medium', heat: 3 },
  Hostile: { label: 'Hostile', sub: 'brutal', threshold: 0.8, pressure: 'high', heat: 4 },
};
export const DURATIONS = {
  Quick: { label: 'Quick', sub: '5 min', minutes: 5 },
  Standard: { label: 'Standard', sub: '10 min', minutes: 10 },
  Extended: { label: 'Extended', sub: '15 min', minutes: 15 },
};

function optList(obj) {
  return Object.entries(obj).map(([id, v]) => ({ id, label: v.label, sub: v.sub }));
}
export function configOptions() {
  return {
    opponents: optList(OPPONENTS),
    personas: optList(PERSONAS),
    difficulties: optList(DIFFICULTIES),
    durations: Object.entries(DURATIONS).map(([id, v]) => ({ id, label: v.label, sub: v.sub, minutes: v.minutes })),
  };
}
export function durationToMinutes(d) { return DURATIONS[d]?.minutes || 10; }
export function difficultyThreshold(d) { return DIFFICULTIES[d]?.threshold ?? 0.6; }
export function aiEnabled() { return Boolean(process.env.ANTHROPIC_API_KEY); }

function resolveOpts(opts = {}) {
  return {
    mode: MODES[opts.mode] ? opts.mode : 'both',
    opponent: OPPONENTS[opts.opponent] ? opts.opponent : 'Judge',
    persona: PERSONAS[opts.persona] ? opts.persona : 'Surgical',
    difficulty: DIFFICULTIES[opts.difficulty] ? opts.difficulty : 'Intermediate',
  };
}

/* ============================================================
 * 1) SCENARIO — built from the uploaded document
 * ============================================================ */
export async function buildScenario(text, opts = {}) {
  const sourceSections = splitSourceSections(text);
  const analysisText = sourceSections.map((section) => section.text).join('\n\n') || text;
  const a = analyze(analysisText);
  const caseMaterials = buildCaseMaterials(sourceSections, opts.sourceSections || []);
  if (aiEnabled()) {
    try {
      const sc = await scenarioAI(text, a);
      return { engine: 'ai', ...withDefaults(sc, a, caseMaterials) };
    } catch (err) {
      console.warn('[scenario] AI failed, using fallback:', err.message);
    }
  }
  return { engine: 'template', ...scenarioFallback(a, caseMaterials) };
}

function withDefaults(sc, a, caseMaterials = []) {
  return {
    title: sc.title || a.title,
    docKind: a.docKind,
    userRole: sc.userRole || (a.parties[0] || 'the party advancing this position'),
    legalIssue: sc.legalIssue || '',
    userPosition: sc.userPosition || '',
    opponentPosition: sc.opponentPosition || '',
    claimantCase: sc.claimantCase || sideDigest(caseMaterials, /claimant|appellant/i),
    respondentCase: sc.respondentCase || sideDigest(caseMaterials, /respondent|appellee/i),
    keyFacts: arr(sc.keyFacts, a.obligations.concat(a.sentences).slice(0, 5)),
    keyAuthorities: arr(sc.keyAuthorities, a.citations),
    dangerPoints: arr(sc.dangerPoints, dangerFromAnalysis(a)),
    caseMaterials: normalizeCaseMaterials(sc.caseMaterials, caseMaterials),
    openingTask: sc.openingTask || `Defend the position that ${sc.userPosition || a.title}.`,
  };
}

async function scenarioAI(text, a) {
  const principles = principlesText(12);
  const system =
    `You design realistic moot court practice scenarios from a real ${kindLabel(a.docKind)}, based on real moot court fundamentals. ` +
    `Extract a tight scenario the advocate will argue, grounded ONLY in the document's own facts. ` +
    `The document text may contain labelled uploads such as CASE FACTS, CLAIMANT'S ARGUMENTS and RESPONDENT'S ARGUMENTS. ` +
    `Keep those sources distinct: do not attribute one side's argument to the other, and do not invent a missing upload. ` +
    `REFERENCE MOOT COURT FUNDAMENTALS:\n${principles}\n\n` +
    `This is for legal education only; do not give legal advice. Return ONLY valid JSON in this shape:\n` +
    `{"title":"short name","userRole":"who the advocate represents, one phrase","legalIssue":"one sentence",` +
    `"userPosition":"one or two sentences","opponentPosition":"one or two sentences",` +
    `"claimantCase":"one sentence if claimant/appellant material was uploaded, otherwise empty",` +
    `"respondentCase":"one sentence if respondent/appellee material was uploaded, otherwise empty",` +
    `"keyFacts":["3-5 short bullets"],"keyAuthorities":["2-4 case/source names or doctrinal points"],` +
    `"dangerPoints":["3 specific places the bench will press"],"openingTask":"Make your opening submission for the ... side on the issue of ..."}`;
  const out = await callAnthropic(system, 'DOCUMENT TEXT:\n' + text.slice(0, 14000), 1200);
  return parseJSON(out);
}

function scenarioFallback(a, caseMaterials = []) {
  const role = a.parties[0] || 'the party advancing this position';
  const opp = a.parties[1] || 'the opposing party';
  const issue = a.obligations[0]
    ? `Whether ${shorten(a.obligations[0])}`
    : `What the central legal question raised by this ${kindLabel(a.docKind).toLowerCase()} is and how it should be resolved`;
  return {
    title: a.title,
    docKind: a.docKind,
    userRole: role,
    legalIssue: issue,
    userPosition: `You act for ${role}. Your position is that the document, read fairly, supports your client on the central issue.`,
    opponentPosition: `${opp} contends the document should be read the other way, and that your reading overstates its effect.`,
    claimantCase: sideDigest(caseMaterials, /claimant|appellant/i),
    respondentCase: sideDigest(caseMaterials, /respondent|appellee/i),
    keyFacts: dedupeArr(a.obligations.concat(a.sentences)).slice(0, 5),
    keyAuthorities: a.citations.length ? a.citations : (a.definedTerms.slice(0, 3).map((t) => `the defined term "${t}"`)),
    dangerPoints: dangerFromAnalysis(a),
    caseMaterials,
    openingTask: `Open your submissions for ${role} on the central issue.`,
  };
}


function splitSourceSections(text) {
  const raw = String(text || '');
  const re = /^===\s+(.+?)\s+===\s*$/gm;
  const hits = [];
  let m;
  while ((m = re.exec(raw)) !== null) {
    hits.push({ label: labelFromMarker(m[1]), bodyStart: re.lastIndex, markerStart: m.index });
  }
  if (!hits.length) return [{ key: 'document', label: 'Uploaded Document', text: raw.trim() }];

  return hits.map((hit, idx) => {
    const end = hits[idx + 1]?.markerStart ?? raw.length;
    return {
      key: keyFromLabel(hit.label),
      label: hit.label,
      text: raw.slice(hit.bodyStart, end).trim(),
    };
  }).filter((section) => section.text);
}

function buildCaseMaterials(sections, sourceMeta = []) {
  return (sections || []).map((section, idx) => {
    const meta = findSourceMeta(section, sourceMeta, idx);
    const a = analyze(section.text || '');
    const highlights = materialHighlights(a);
    return {
      key: meta.key || section.key || keyFromLabel(section.label),
      label: meta.label || section.label || 'Uploaded Document',
      name: meta.name || '',
      pages: meta.pages || null,
      words: meta.words || wordCount(section.text),
      chars: meta.chars || String(section.text || '').length,
      title: a.title,
      kind: kindLabel(a.docKind),
      summary: materialSummary(a, section.label),
      highlights,
      authorities: a.citations.slice(0, 5),
      references: materialReferences(a),
    };
  });
}

function findSourceMeta(section, sourceMeta, idx) {
  const byKey = sourceMeta.find((meta) => meta.key && section.key && meta.key === section.key);
  if (byKey) return byKey;
  const secLabel = String(section.label || '').toLowerCase();
  const byLabel = sourceMeta.find((meta) => String(meta.label || '').toLowerCase() === secLabel);
  return byLabel || sourceMeta[idx] || {};
}

function materialSummary(a, label) {
  const first = a.obligations[0] || a.sentences[0];
  if (first) return shorten(first, 34);
  const title = a.title && !/^uploaded document$/i.test(a.title) ? a.title : '';
  return title || String(label || 'This upload') + ' was extracted, but no concise summary could be identified.';
}

function materialHighlights(a) {
  return dedupeArr([
    ...a.obligations,
    ...a.sentences,
  ]).slice(0, 4);
}

function materialReferences(a) {
  const clauseRefs = (a.clauses || []).slice(0, 4).map((clause) => clause.label + ': ' + shorten(clause.context, 18));
  const figures = [...(a.money || []), ...(a.dates || []), ...(a.durations || []), ...(a.percentages || [])]
    .slice(0, 6)
    .map((item) => 'Record marker: ' + item);
  return dedupeArr([...clauseRefs, ...figures]).slice(0, 8);
}

function sideDigest(caseMaterials, sideRe) {
  const section = (caseMaterials || []).find((material) => sideRe.test(String(material.label || '') + ' ' + String(material.name || '')));
  if (!section) return '';
  const point = section.highlights?.[0] || section.summary || '';
  return point ? section.label + ': ' + point : '';
}

function normalizeCaseMaterials(value, fallback) {
  if (!Array.isArray(value) || !value.length) return fallback;
  return value.slice(0, 6).map((material, idx) => ({
    key: String(material.key || fallback[idx]?.key || 'material-' + (idx + 1)),
    label: String(material.label || fallback[idx]?.label || 'Material ' + (idx + 1)),
    name: String(material.name || fallback[idx]?.name || ''),
    pages: Number.isFinite(Number(material.pages)) ? Number(material.pages) : (fallback[idx]?.pages || null),
    words: Number.isFinite(Number(material.words)) ? Number(material.words) : (fallback[idx]?.words || null),
    chars: Number.isFinite(Number(material.chars)) ? Number(material.chars) : (fallback[idx]?.chars || null),
    title: String(material.title || fallback[idx]?.title || ''),
    kind: String(material.kind || fallback[idx]?.kind || ''),
    summary: String(material.summary || fallback[idx]?.summary || ''),
    highlights: arr(material.highlights, fallback[idx]?.highlights || []).slice(0, 5),
    authorities: arr(material.authorities, fallback[idx]?.authorities || []).slice(0, 5),
    references: arr(material.references, fallback[idx]?.references || []).slice(0, 8),
  }));
}

function labelFromMarker(label) {
  return String(label || '')
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ')
    .replace(/\bS\b/g, 's');
}

function keyFromLabel(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('claimant') || l.includes('appellant')) return 'claimantArguments';
  if (l.includes('respondent') || l.includes('appellee')) return 'respondentArguments';
  if (l.includes('fact') || l.includes('record')) return 'caseFacts';
  return l.replace(/[^a-z0-9]+(.)/g, (_, ch) => ch.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '') || 'document';
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

function dangerFromAnalysis(a) {
  const out = [];
  if (a.clauses[0]) out.push(`The precise operation of ${a.clauses[0].label}`);
  if (a.money[0]) out.push(`The figure ${a.money[0]} and how it is reached`);
  if (a.durations[0]) out.push(`The ${a.durations[0]} period and whether it was met`);
  for (const ob of a.obligations.slice(0, 2)) out.push(`Whether "${shorten(ob)}" is as strict as you say`);
  if (out.length < 3 && a.keywords.length) out.push(`The significance of "${a.keywords[0]}" on these facts`);
  return out.slice(0, 4);
}

/* ============================================================
 * 2) BENCH TURN — one reply, varies by all four dimensions
 * ============================================================ */
export async function benchTurn(scenario, opts, history, advocateMsg) {
  const r = resolveOpts(opts);
  if (aiEnabled()) {
    try {
      return { engine: 'ai', ...(await benchAI(scenario, r, history, advocateMsg)) };
    } catch (err) {
      console.warn('[bench] AI failed, using fallback:', err.message);
    }
  }
  return { engine: 'template', ...benchFallback(scenario, r, history, advocateMsg) };
}

function benchSystem(scenario, r) {
  const opp = OPPONENTS[r.opponent];
  const persona = PERSONAS[r.persona];
  const diff = DIFFICULTIES[r.difficulty];
  const mode = MODES[r.mode];
  const style = benchStyleDigest(6);
  const principles = principlesText(10);
  return (
    `You are ${opp.voice} in a moot court setting. Persona: ${persona.flavour}. ` +
    `Difficulty: ${r.difficulty} (${diff.pressure} pressure). You are pressing the advocate ${mode.focus === 'both the legal principles and the factual record' ? 'on both the law and the facts' : 'mainly on ' + mode.focus}.\n\n` +
    `REFERENCE MATERIALS - USE THESE TO GUIDE YOUR STYLE AND BEHAVIOUR:\n` +
    `COURT TRANSCRIPT EXAMPLES:\n${style}\n\n` +
    `MOOT COURT FUNDAMENTALS:\n${principles}\n\n` +
    `SCENARIO\nIssue: ${scenario.legalIssue}\nThe advocate represents: ${scenario.userRole}\n` +
    `Their position: ${scenario.userPosition}\nOpponent's position: ${scenario.opponentPosition}\n` +
    `Key facts: ${(scenario.keyFacts || []).join(' | ')}\n` +
    `Authorities in play: ${(scenario.keyAuthorities || []).join(' | ')}\n` +
    `Danger points: ${(scenario.dangerPoints || []).join(' | ')}\n\n` +
    `YOUR JOB\nReact to what the advocate just said. If it is vague, overstated, unsupported, evasive or ignores a fact, press exactly there. ` +
    `If it is strong, acknowledge briefly and move to the next genuine weak point. Quote the document where you can. ` +
    `Stay in character. Speak in the first person as the bench, 1 to 3 sentences, oral and pointed — never a lecture. ` +
    `Use realistic courtroom/moot court language, exactly like in the reference transcript examples. ` +
    `This is legal education only; never give legal advice.\n\n` +
    `Attack types: Clarification, Authority, Fact, Hypothetical, Policy, Remedy, Concession.\n` +
    `Return ONLY valid JSON: {"say":"your spoken challenge","attackType":"one type","benchPressure":"low|medium|high","unanswered":"short label of the still-open issue or empty","topic":"short label of what you are pressing"}`
  );
}

async function benchAI(scenario, r, history, advocateMsg) {
  const msgs = history
    .filter((t) => t.role === 'advocate' || t.role === 'bench')
    .map((t) => ({ role: t.role === 'advocate' ? 'user' : 'assistant', content: t.text }));
  msgs.push({ role: 'user', content: advocateMsg });
  const out = await callAnthropic(benchSystem(scenario, r), msgs, 600);
  const j = parseJSON(out);
  return normalizeBench(j);
}

function normalizeBench(j) {
  const types = ['Clarification', 'Authority', 'Fact', 'Hypothetical', 'Policy', 'Remedy', 'Concession'];
  return {
    say: String(j.say || '').trim() || 'Develop that point — I am not yet persuaded.',
    attackType: types.includes(j.attackType) ? j.attackType : 'Clarification',
    benchPressure: ['low', 'medium', 'high'].includes(j.benchPressure) ? j.benchPressure : 'medium',
    unanswered: String(j.unanswered || '').trim(),
    topic: String(j.topic || '').trim() || '—',
  };
}

// Template bench: grounded, reactive-ish, and varies by all four dimensions.
function benchFallback(scenario, r, history, advocateMsg) {
  const opp = OPPONENTS[r.opponent];
  const persona = PERSONAS[r.persona];
  const diff = DIFFICULTIES[r.difficulty];
  const mode = MODES[r.mode];

  const advTurns = history.filter((t) => t.role === 'advocate').length; // before this message it's appended by caller
  const idx = advTurns; // 0-based index of the exchange
  const msg = (advocateMsg || '').toLowerCase();
  const wordCount = msg.split(/\s+/).filter(Boolean).length;

  // Choose what to press: rotate through danger points / facts / authorities by mode.
  const targets = pickTargets(scenario, mode);
  const target = targets[idx % targets.length] || scenario.legalIssue || 'your central submission';
  const attackType = mode.attacks[idx % mode.attacks.length];

  // Light responsiveness: did they cite an authority / figure / clause?
  const citedAuthority = (scenario.keyAuthorities || []).some((au) => msg.includes(firstWord(au)));
  const citedFigure = /\$|\bclause\b|\bsection\b|\d{2,}/.test(msg);
  const tooThin = wordCount < 12;

  let lead;
  if (idx === 0) {
    lead = opp.address + ', I have read your opening.';
  } else if (tooThin) {
    lead = pick([`${opp.address}, that is too thin.`, 'You will need to do better than that.', 'That barely answers me.']);
  } else if (citedAuthority || citedFigure) {
    lead = pick(['Very well — you point me to the document.', 'I take your reference.', 'Accepted, as far as it goes.']);
  } else {
    lead = pick(['I am not yet with you.', 'Let me stop you there.', 'Press on, but answer this.']);
  }

  const body = attackLine(attackType, target, scenario, persona);
  const personaTail = personaFlavour(r.persona, diff.heat);
  const say = `${lead} ${body}${personaTail}`;

  // Pressure escalates with difficulty and over the round.
  const heat = Math.min(4, diff.heat + Math.floor(idx / 2) + (tooThin ? 1 : 0));
  const benchPressure = heat >= 4 ? 'high' : heat >= 2 ? 'medium' : 'low';
  const unanswered = targets[(idx + 1) % targets.length] || '';

  return { say, attackType, benchPressure, unanswered, topic: shorten(target, 7) };
}

function pickTargets(scenario, mode) {
  const facts = scenario.keyFacts || [];
  const auths = (scenario.keyAuthorities || []);
  const dangers = scenario.dangerPoints || [];
  if (mode.label === 'On the law') return dedupeArr([...auths, scenario.legalIssue, ...dangers]).filter(Boolean);
  if (mode.label === 'On the facts') return dedupeArr([...dangers, ...facts]).filter(Boolean);
  return dedupeArr([...dangers, scenario.legalIssue, ...auths, ...facts]).filter(Boolean);
}

function attackLine(type, target, scenario, persona) {
  const t = shorten(target, 16);
  const auth = (scenario.keyAuthorities || [])[0];
  switch (type) {
    case 'Authority': return auth
      ? `What authority puts you there? You will need more than ${auth} on this.`
      : `On what authority? Give me the rule, not the conclusion, on ${t}.`;
    case 'Fact': return `Take me to where the record shows ${t}.`;
    case 'Hypothetical': return `Suppose ${t} were otherwise — does your position survive, or does it collapse?`;
    case 'Policy': return `Why should the law prefer your reading of ${t}? What does it serve?`;
    case 'Remedy': return `Even if you are right on ${t}, why is your remedy the proportionate one?`;
    case 'Concession': return `You must concede ${t}, surely — or do you press even that?`;
    default: return `What, precisely, do you say ${t} means here?`;
  }
}

function personaFlavour(persona, heat) {
  if (persona === 'Aggressive') return heat >= 3 ? ' Be quick.' : '';
  if (persona === 'Socratic') return ' Answer the hypothetical, not the case you would prefer.';
  if (persona === 'Commercial') return ' And tell me why it matters in practice.';
  return ''; // Surgical: clean, no tail
}

/* ============================================================
 * 3) DEBRIEF — score + coaching from the transcript
 * ============================================================ */
export async function debrief(scenario, opts, turns, timeUsedSec, timeTotalSec) {
  const r = resolveOpts(opts);
  if (aiEnabled()) {
    try {
      return { engine: 'ai', ...(await debriefAI(scenario, r, turns, timeUsedSec, timeTotalSec)) };
    } catch (err) {
      console.warn('[debrief] AI failed, using fallback:', err.message);
    }
  }
  return { engine: 'template', ...debriefFallback(scenario, r, turns, timeUsedSec, timeTotalSec) };
}

function transcriptText(turns) {
  return turns
    .filter((t) => t.role === 'advocate' || t.role === 'bench')
    .map((t) => (t.role === 'advocate' ? 'ADVOCATE: ' : 'BENCH: ') + t.text)
    .join('\n\n');
}

async function debriefAI(scenario, r, turns, used, total) {
  const system =
    `You are a senior advocacy coach scoring an oral round against a structured standard. ` +
    `Subscores and maxima are fixed: Responsiveness /25, Clarity + Structure /20, Use of Facts /20, Use of Authorities /20, Time Discipline /15. ` +
    `Overall is out of 100 and equals the sum. Calibrate to ${r.difficulty} difficulty. Separate legal weakness from communication weakness; be specific and quote the round. ` +
    `Time used ${used}s of ${total}s. Return ONLY valid JSON:\n` +
    `{"overall":n,"diagnosis":"one sentence","subscores":{"responsiveness":n,"clarityStructure":n,"useOfFacts":n,"useOfAuthorities":n,"timeDiscipline":n},` +
    `"feedback":[{"type":"Missed point|Overplayed argument|Good move","marker":"short locator","problem":"what happened","better":"a stronger answer in the advocate's voice, or empty for a Good move"}],` +
    `"turningPoint":{"question":"the bench question that turned the round","userAnswer":"what the advocate said","whyWeak":"why it lost ground","stronger":"a stronger answer in the advocate's voice"}}`;
  const out = await callAnthropic(system, 'ISSUE: ' + scenario.legalIssue + '\n\nTRANSCRIPT:\n' + transcriptText(turns), 1400);
  return normalizeDebrief(parseJSON(out));
}

function normalizeDebrief(d, { harshness = 0.85 } = {}) {
  const s = d.subscores || {};
  const clamp = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));

  // Apply a downward multiplier to the raw value before clamping.
  // harshness < 1 scales scores down; e.g. 0.85 means a "perfect" raw
  // score now caps out at 85% of max instead of 100%.
  const penalize = (v, max) => clamp((Number(v) || 0) * harshness, max);

  const sub = {
    responsiveness: penalize(s.responsiveness, 25),
    clarityStructure: penalize(s.clarityStructure, 20),
    useOfFacts: penalize(s.useOfFacts, 20),
    useOfAuthorities: penalize(s.useOfAuthorities, 20),
    timeDiscipline: penalize(s.timeDiscipline, 15),
  };

  const overall = Number.isFinite(d.overall)
    ? penalize(d.overall, 100)
    : sub.responsiveness + sub.clarityStructure + sub.useOfFacts + sub.useOfAuthorities + sub.timeDiscipline;

  return {
    overall,
    diagnosis: String(d.diagnosis || '').trim(),
    subscores: sub,
    feedback: Array.isArray(d.feedback) ? d.feedback.slice(0, 4).map((f) => ({
      type: f.type || 'Missed point', marker: f.marker || '', problem: f.problem || '', better: f.better || '',
    })) : [],
    turningPoint: d.turningPoint || null,
  };
}

function debriefFallback(scenario, r, turns, used, total) {
  const adv = turns.filter((t) => t.role === 'advocate');
  const benchTurns = turns.filter((t) => t.role === 'bench');
  const allAdv = adv.map((t) => t.text.toLowerCase()).join(' ');
  const advWords = allAdv.split(/\s+/).filter(Boolean);
  const avgLen = adv.length ? advWords.length / adv.length : 0;

  // coverage of facts & authorities
  const factHits = countCoverage(scenario.keyFacts, allAdv);
  const authHits = countCoverage(scenario.keyAuthorities, allAdv);
  const factCov = ratio(factHits, (scenario.keyFacts || []).length);
  const authCov = ratio(authHits, (scenario.keyAuthorities || []).length);

  // responsiveness: did they actually engage each bench turn with substance?
  const engaged = adv.filter((t) => t.text.split(/\s+/).filter(Boolean).length >= 15).length;
  const respRatio = adv.length ? engaged / adv.length : 0;

  const diffScale = { Junior: 1.0, Intermediate: 0.92, 'Finals Level': 0.85, Hostile: 0.78 }[r.difficulty] || 0.9;

  const responsiveness = Math.round(25 * clamp01(0.35 + respRatio * 0.65) * diffScale);
  const clarityStructure = Math.round(20 * clamp01(0.3 + Math.min(1, avgLen / 45) * 0.7) * diffScale);
  const useOfFacts = Math.round(20 * clamp01(0.25 + factCov * 0.75));
  const useOfAuthorities = Math.round(20 * clamp01(0.25 + authCov * 0.75));
  const timeDiscipline = Math.round(15 * timeScore(used, total, adv.length));
  const overall = responsiveness + clarityStructure + useOfFacts + useOfAuthorities + timeDiscipline;

  const feedback = [];
  if (authCov < 0.34) feedback.push({ type: 'Missed point', marker: 'On authority', problem: 'You argued largely from assertion; the bench was not taken to the sources in play.', better: `Anchor the point in ${(scenario.keyAuthorities || ['the governing provision'])[0]} and say exactly what it decides.` });
  else feedback.push({ type: 'Good move', marker: 'On authority', problem: 'You did engage the authorities in play rather than arguing in the abstract.', better: '' });
  if (factCov < 0.4) feedback.push({ type: 'Missed point', marker: 'On the facts', problem: 'Several key facts went unused, so the submissions floated above the record.', better: `Take the bench to the specific facts: ${(scenario.keyFacts || ['the operative clause']).slice(0, 2).join('; ')}.` });
  if (avgLen > 90) feedback.push({ type: 'Overplayed argument', marker: 'On length', problem: 'Answers ran long and buried the point the bench actually asked about.', better: 'Lead with the direct answer in one line, then give your single best reason.' });
  if (feedback.length < 3) feedback.push({ type: respRatio > 0.6 ? 'Good move' : 'Missed point', marker: 'On responsiveness', problem: respRatio > 0.6 ? 'You answered the question put, rather than the one you wished had been asked.' : 'Some answers slid past the question the bench actually asked.', better: respRatio > 0.6 ? '' : 'Answer the precise question first; only then pivot to your theme.' });

  // turning point: highest-pressure bench turn + the advocate answer that followed
  let tpBench = benchTurns.find((t) => t.bench_pressure === 'high') || benchTurns[Math.floor(benchTurns.length / 2)] || benchTurns[0];
  let tpAnswer = null;
  if (tpBench) {
    const after = turns.filter((t) => t.ordinal > tpBench.ordinal && t.role === 'advocate');
    tpAnswer = after[0] || null;
  }
  const turningPoint = tpBench ? {
    question: tpBench.text,
    userAnswer: tpAnswer ? tpAnswer.text : '(no answer was given before the round ended)',
    whyWeak: tpAnswer ? 'The answer did not connect the rule to the specific fact the bench raised, so it read as assertion.' : 'The pressure point was left unanswered.',
    stronger: `Concede what cannot be held, then re-anchor: "${shorten(scenario.legalIssue, 18)}" turns on ${(scenario.dangerPoints || ['the operative words'])[0]} — and the document is with my client there.`,
  } : null;

  return normalizeDebrief({
    overall,
    diagnosis: diagnose(overall),
    subscores: { responsiveness, clarityStructure, useOfFacts, useOfAuthorities, timeDiscipline },
    feedback: feedback.slice(0, 3),
    turningPoint,
  });
}

export function buildSummary(d, modeLabel) {
  const pct = d.overall;
  let band;
  if (pct >= 85) band = 'Commanding — you worked from the document and stayed disciplined under pressure.';
  else if (pct >= 70) band = 'Strong — your reasoning held; tighten the points you left on the table.';
  else if (pct >= 50) band = 'Developing — the instincts are there but answers drifted from the text.';
  else band = 'Early days — anchor every answer in the document\'s own words and figures.';
  return `${pct}/100 in ${modeLabel || 'the round'}. ${band}`;
}

function diagnose(pct) {
  if (pct >= 85) return 'You won the exchanges that mattered and never lost the record.';
  if (pct >= 70) return 'A strong round; a few concessions were given too cheaply.';
  if (pct >= 50) return 'The round turned on answers that argued past the bench\'s actual question.';
  return 'The bench set the agenda; your answers rarely took control of the record.';
}

/* ============================================================
 * Anthropic helper (no SDK)
 * ============================================================ */
async function callAnthropic(system, userContent, maxTokens = 800) {
  const messages = typeof userContent === 'string'
    ? [{ role: 'user', content: userContent }]
    : userContent;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });
  if (!res.ok) throw new Error('Anthropic API HTTP ' + res.status);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

/* ============================================================
 * utilities
 * ============================================================ */
export function parseJSON(text) {
  let t = (text || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}
function arr(v, dflt) { return Array.isArray(v) && v.length ? v.map(String) : dflt; }
function dedupeArr(a) {
  const seen = new Set(); const out = [];
  for (const x of a || []) { const k = String(x).toLowerCase().trim(); if (k && !seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}
function shorten(s, words = 12) {
  const w = String(s || '').trim().split(/\s+/);
  return w.length <= words ? String(s || '').trim() : w.slice(0, words).join(' ') + '…';
}
function firstWord(s) { return String(s || '').toLowerCase().split(/\s+/)[0] || ''; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function countCoverage(list, text) {
  let hits = 0;
  for (const item of list || []) {
    const kw = String(item).toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];
    if (kw.some((w) => text.includes(w))) hits++;
  }
  return hits;
}
function ratio(n, d) { return d ? n / d : 0.5; }
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function timeScore(used, total, advTurns) {
  if (advTurns === 0) return 0;
  if (!total) return 0.7;
  const frac = used / total;
  // Reward using a good chunk of time without blowing past it.
  if (frac > 1) return 0.6;
  if (frac >= 0.5) return 1;
  if (frac >= 0.25) return 0.8;
  return 0.6;
}
