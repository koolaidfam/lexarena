
/**
 * Heuristic legal-document analyzer.
 * Pulls structured signals out of raw extracted text so the fallback generator
 * can build grounded, document-specific training questions without an LLM.
 */

const STOPWORDS = new Set(
  ('the a an and or but if then of to in on at by for with from into over under as is are was were be been being ' +
    'this that these those it its their his her our your my we they he she you i shall will may must any all each ' +
    'such other than which who whom whose what when where why how not no nor so up out off down also more most ' +
    'pursuant hereby herein hereof thereof whereas provided notwithstanding shall').split(/\s+/)
);

export function analyze(text) {
  const clean = text.replace(/ /g, ' ');
  const sentences = splitSentences(clean);
  const docKind = detectKind(clean);

  return {
    docKind,
    title: detectTitle(clean, docKind),
    sentences,
    clauses: detectClauses(clean),
    definedTerms: detectDefinedTerms(clean),
    parties: detectParties(clean),
    money: dedupe(matchAll(clean, /(?:S?\$|USD|EUR|SGD|GBP|£|€)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|billion|thousand|m|bn|k))?/gi)),
    dates: dedupe(matchAll(clean, /\b(?:\d{1,2}\s+)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{0,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi)),
    durations: dedupe(matchAll(clean, /\b\d+[- ]?(?:hour|day|week|month|year)s?\b/gi)),
    percentages: dedupe(matchAll(clean, /\b\d+(?:\.\d+)?\s?(?:per cent|percent|%)/gi)),
    obligations: detectObligations(sentences),
    citations: detectCitations(clean),
    keywords: topKeywords(clean),
  };
}

function detectCitations(text) {
  const out = [];
  const seen = new Set();
  // "Maple Flock Co Ltd v Universal Furniture Products [1934] 1 KB"
  const caseRe = /\b([A-Z][A-Za-z&'’.\- ]{1,50}?)\s+v\.?\s+([A-Z][A-Za-z&'’.\- ]{1,50}?)\s*(\[\d{4}\]|\(\d{4}\))?\s*([A-Z]{1,4}\s?\d+|\d+\s+[A-Z]{1,4}\s?\d+)?/g;
  let m;
  while ((m = caseRe.exec(text)) !== null) {
    let cite = squash(`${m[1]} v ${m[2]}${m[3] ? ' ' + m[3] : ''}${m[4] ? ' ' + m[4] : ''}`);
    const key = cite.toLowerCase();
    if (cite.length > 8 && cite.length < 90 && !seen.has(key)) { seen.add(key); out.push(cite); }
    if (out.length >= 6) break;
  }
  // Statutes / regulations referenced by name
  for (const s of matchAll(text, /\b([A-Z][A-Za-z ]+(?:Act|Regulations?|Rules|Code|Convention)(?:\s+\d{4})?)\b/g, true)) {
    const key = s.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(squash(s)); }
    if (out.length >= 10) break;
  }
  return out.slice(0, 8);
}

function splitSentences(text) {
  return text
    .replace(/\n+/g, ' ')
    .split(/(?<=[.;:?!])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 400);
}

function detectKind(text) {
  const t = text.toLowerCase();
  const score = {
    contract: count(t, /\b(agreement|clause|hereby|the parties|shall|warrant|indemnif|terminat|obligation)\b/g),
    case: count(t, /\b(appellant|respondent|plaintiff|defendant|v\.?\s|judgment|the court|held that|trial judge|appeal)\b/g),
    statute: count(t, /\b(section|sub-section|subsection|act|regulation|shall be guilty|enacted|provision|article \d)\b/g),
    memo: count(t, /\b(memorandum|to:|from:|re:|advice|we are instructed|our view|in our opinion)\b/g),
    policy: count(t, /\b(policy|employees must|the company|procedure|compliance|guideline|code of conduct)\b/g),
  };
  let best = 'document';
  let max = 2;
  for (const [k, v] of Object.entries(score)) {
    if (v > max) { max = v; best = k; }
  }
  return best;
}

const KIND_LABEL = {
  contract: 'Contract',
  case: 'Case File',
  statute: 'Statute / Regulation',
  memo: 'Legal Memo',
  policy: 'Policy Document',
  document: 'Legal Document',
};

export function kindLabel(kind) {
  return KIND_LABEL[kind] || KIND_LABEL.document;
}

function detectTitle(text, kind) {
  // Case caption "X v Y" — tolerate a parenthetical (e.g. "(Appellant)") before the "v".
  const vs = text.match(/([A-Z][A-Za-z0-9&.,'’\- ]{2,60}?)(?:\s*\([^)]+\))?\s+v\.?\s+([A-Z][A-Za-z0-9&.,'’\- ]{2,60}?)(?:\s*\([^)]+\))?(?:[\n.]|$)/);
  if (vs) return `${squash(firstParty(vs[1]))} v ${squash(firstParty(vs[2]))}`;

  // First strong line
  const firstLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of firstLines.slice(0, 8)) {
    if (line.length >= 8 && line.length <= 80 && /[A-Za-z]/.test(line) && !/^page\b/i.test(line)) {
      return squash(line);
    }
  }
  return `${kindLabel(kind)} Training Round`;
}

// Trim a captured party to a clean entity name (drop a leading court header line).
function firstParty(s) {
  const parts = s.split(/\s{2,}|\n/);
  let p = parts[parts.length - 1].trim();
  // Only shorten if a court/header preamble is still attached (long, mixed-case run).
  if (p.split(' ').length > 6) {
    const m = p.match(/([A-Z][A-Za-z0-9&.'’\-]+(?:\s+[A-Z][A-Za-z0-9&.'’\-]+){0,4})$/);
    if (m) p = m[1];
  }
  return p;
}

function detectClauses(text) {
  const out = [];
  const seen = new Set();
  const re = /\b(clause|section|article|paragraph|reg(?:ulation)?|§)\s*(\d+[A-Za-z]?(?:\.\d+)*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = `${capitalize(m[1])} ${m[2]}`;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // grab the sentence around the mention for context
    const start = Math.max(0, m.index - 20);
    const window = text.slice(start, m.index + 220).replace(/\s+/g, ' ').trim();
    out.push({ label, ref: m[2], context: window });
    if (out.length >= 12) break;
  }
  return out;
}

function detectDefinedTerms(text) {
  const out = [];
  const seen = new Set();
  // Quoted defined terms: "Confidential Information", “the Agreement”
  for (const m of matchAll(text, /["“]([A-Z][A-Za-z ]{2,40})["”]/g, true)) {
    const term = squash(m.replace(/["“”]/g, ''));
    const key = term.toLowerCase();
    if (term.split(' ').length <= 5 && !seen.has(key)) { seen.add(key); out.push(term); }
  }
  // Capitalised multi-word terms used like defined terms
  for (const m of matchAll(text, /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3})\b/g, true)) {
    const key = m.toLowerCase();
    if (!seen.has(key) && !key.includes('the court')) { seen.add(key); out.push(m); }
    if (out.length >= 18) break;
  }
  return out.slice(0, 18);
}

function detectParties(text) {
  const out = new Set();
  for (const m of matchAll(text, /\b([A-Z][A-Za-z0-9&.'’\- ]{2,50}?(?:Pte Ltd|Ltd|LLC|LLP|Inc|Corp|Corporation|Company|GmbH|PLC))\b/g, true)) {
    out.add(squash(m));
  }
  for (const m of matchAll(text, /\(([A-Z][a-z]+)\)/g, true)) {
    if (/Appellant|Respondent|Plaintiff|Defendant|Claimant|Buyer|Seller|Vendor|Purchaser|Landlord|Tenant|Employer|Employee/.test(m)) {
      out.add(m);
    }
  }
  return [...out].slice(0, 8);
}

function detectObligations(sentences) {
  return sentences
    .filter((s) => /\b(shall|must|is required to|agrees to|undertakes to|is obliged to|may not|shall not)\b/i.test(s))
    .slice(0, 12);
}

function topKeywords(text) {
  const freq = new Map();
  for (const w of text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
    if (STOPWORDS.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);
}

/* ---------- helpers ---------- */
function matchAll(text, re, captureGroup1 = false) {
  const out = [];
  let m;
  const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = r.exec(text)) !== null) {
    out.push(captureGroup1 ? m[1] : m[0]);
    if (m.index === r.lastIndex) r.lastIndex++;
  }
  return out;
}
function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = x.toLowerCase().trim();
    if (!seen.has(k)) { seen.add(k); out.push(x.trim()); }
  }
  return out;
}
function count(text, re) { return (text.match(re) || []).length; }
function squash(s) { return s.replace(/\s+/g, ' ').trim(); }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
