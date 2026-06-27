/* ============================================================
 * Lex Arena — frontend controller
 * ============================================================ */
const State = {
  ai: false,
  uploads: {
    caseFacts: null,
    claimantArguments: null,
    respondentArguments: null,
  },
  modes: [],
  options: { opponents: [], personas: [], difficulties: [], durations: [] },
  config: { opponent: 'Judge', persona: 'Surgical', duration: 'Standard', difficulty: 'Intermediate', mode: 'both' },
  session: null,     // full session object
  secondsLeft: 600,
  timer: null,
};

const UPLOAD_BUCKETS = {
  caseFacts: { label: 'Case Facts' },
  claimantArguments: { label: "Claimant's Arguments" },
  respondentArguments: { label: "Respondent's Arguments" },
};

/* ---------- router ---------- */
function go(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (name === 'dashboard') loadRecent();
}

/* ---------- overlay / toast ---------- */
let ovTimer = null;
function showOverlay(title, lines) {
  document.getElementById('ovTitle').textContent = title;
  document.getElementById('overlay').classList.add('show');
  let i = 0;
  const el = document.getElementById('ovLine');
  el.textContent = lines[0] || '';
  clearInterval(ovTimer);
  ovTimer = setInterval(() => { i = (i + 1) % lines.length; el.textContent = lines[i]; }, 1500);
}
function hideOverlay() { document.getElementById('overlay').classList.remove('show'); clearInterval(ovTimer); }
function toast(msg, ok) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (ok ? ' ok' : '');
  setTimeout(() => t.classList.remove('show'), 5000);
}

/* ---------- api helper ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error(data.error || `Request failed (HTTP ${res.status}).`);
  return data;
}

/* ============================================================
 * Init
 * ============================================================ */
async function init() {
  try {
    const data = await api('/api/modes');
    State.modes = data.modes;
    State.options = {
      opponents: data.opponents || [],
      personas: data.personas || [],
      difficulties: data.difficulties || [],
      durations: data.durations || [],
    };
    State.ai = data.ai;
    document.getElementById('ai-tag').textContent = data.ai ? 'AI engine' : 'Template engine';
    renderSetup();
  } catch (e) {
    document.getElementById('ai-tag').textContent = 'Offline';
  }
  loadRecent();
  initUpload();
}

/* ============================================================
 * Upload
 * ============================================================ */
function initUpload() {
  Object.keys(UPLOAD_BUCKETS).forEach((bucket) => {
    const drop = document.getElementById(`drop-${bucket}`);
    const input = document.getElementById(`fileIn-${bucket}`);
    if (!drop || !input) return;
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('drag');
      if (e.dataTransfer.files.length) handleFile(bucket, e.dataTransfer.files[0]);
    });
    input.addEventListener('change', (e) => {
      if (e.target.files.length) handleFile(bucket, e.target.files[0]);
    });
  });
}

function resetUpload() {
  State.uploads = { caseFacts: null, claimantArguments: null, respondentArguments: null };
  Object.keys(UPLOAD_BUCKETS).forEach((bucket) => resetUploadBucketUI(bucket));
  document.getElementById('extractDone').style.display = 'none';
  document.getElementById('upErr').innerHTML = '';
  updateModeSummary();
}

function clearUploadBucket(bucket) {
  State.uploads[bucket] = null;
  resetUploadBucketUI(bucket);
  document.getElementById('upErr').innerHTML = '';
  updateUploadSummary();
}

function showUploadError(msg) {
  document.getElementById('upErr').innerHTML = `<div class="err-box">${escapeHtml(msg)}</div>`;
}

function resetUploadBucketUI(bucket) {
  const input = document.getElementById(`fileIn-${bucket}`);
  if (input) input.value = '';
  const area = document.getElementById(`fileArea-${bucket}`);
  if (area) area.style.display = 'none';
  const meta = document.getElementById(`extractMeta-${bucket}`);
  if (meta) meta.textContent = '';
  const preview = document.getElementById(`preview-${bucket}`);
  if (preview) preview.textContent = '';
  const bar = document.getElementById(`upbar-${bucket}`);
  if (bar) bar.style.width = '0%';
}

function uploadedEntries() {
  return Object.entries(State.uploads)
    .filter(([, data]) => data)
    .map(([key, data]) => ({ key, label: UPLOAD_BUCKETS[key].label, data }));
}

function updateUploadSummary() {
  const entries = uploadedEntries();
  const done = document.getElementById('extractDone');
  if (!entries.length) {
    done.style.display = 'none';
    return;
  }
  const totals = entries.reduce((acc, { data }) => {
    acc.pages += data.meta.pages || 0;
    acc.words += data.meta.words || 0;
    acc.chars += data.meta.chars || 0;
    return acc;
  }, { pages: 0, words: 0, chars: 0 });

  document.getElementById('extractMeta').textContent =
    `${entries.length} document${entries.length === 1 ? '' : 's'} · ${totals.pages} page${totals.pages === 1 ? '' : 's'} · ${totals.words.toLocaleString()} words · ${totals.chars.toLocaleString()} characters extracted`;
  document.getElementById('bundlePreview').textContent = entries
    .map(({ label, data }) => `${label}: ${data.meta.name}`)
    .join('\n');
  done.style.display = 'block';
  updateModeSummary();
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(2) + ' MB';
}

function handleFile(bucket, file) {
  document.getElementById('upErr').innerHTML = '';

  // ---- client-side validation ----
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) { showUploadError('Only .pdf files are accepted. Please choose a PDF.'); return; }
  if (file.size === 0) { showUploadError('That file is empty.'); return; }
  if (file.size > 10 * 1024 * 1024) { showUploadError('That file is larger than the 10 MB limit.'); return; }

  document.getElementById(`fc-name-${bucket}`).textContent = file.name;
  document.getElementById(`fc-size-${bucket}`).textContent = fmtBytes(file.size);
  document.getElementById(`fileArea-${bucket}`).style.display = 'block';

  uploadFile(bucket, file);
}

function uploadFile(bucket, file) {
  const bar = document.getElementById(`upbar-${bucket}`);
  bar.style.width = '0%';
  const form = new FormData();
  form.append('file', file);
  form.append('category', bucket);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/upload');
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 70) + '%';
  };
  xhr.onload = () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch { /* */ }
    if (xhr.status >= 200 && xhr.status < 300) {
      bar.style.width = '100%';
      State.uploads[bucket] = data;
      showExtractDone(bucket, data);
    } else {
      bar.style.width = '0%';
      showUploadError(data.error || `Upload failed (HTTP ${xhr.status}).`);
    }
  };
  xhr.onerror = () => { bar.style.width = '0%'; showUploadError('Network error during upload.'); };
  // Show server-side parsing as a distinct phase
  bar.style.width = '40%';
  xhr.send(form);
}

function showExtractDone(bucket, data) {
  const m = data.meta;
  document.getElementById(`extractMeta-${bucket}`).textContent =
    `${m.pages} page${m.pages === 1 ? '' : 's'} · ${m.words.toLocaleString()} words · ${(m.chars).toLocaleString()} characters extracted`;
  document.getElementById(`preview-${bucket}`).textContent = (data.preview || '').trim() + ' …';
  updateUploadSummary();
  toast(`${UPLOAD_BUCKETS[bucket].label} extracted.`, true);
}

/* ---------- demo ---------- */
async function startDemo() {
  showOverlay('Loading demo document…', ['Reading the case file', 'Extracting the text', 'Preparing the round']);
  try {
    const data = await api('/api/demo', { method: 'POST' });
    resetUpload();
    State.uploads.caseFacts = data;
    hideOverlay();
    go('upload');
    document.getElementById('fc-name-caseFacts').textContent = data.meta.name;
    document.getElementById('fc-size-caseFacts').textContent = fmtBytes(data.meta.size);
    document.getElementById('fileArea-caseFacts').style.display = 'block';
    document.getElementById('upbar-caseFacts').style.width = '100%';
    showExtractDone('caseFacts', data);
  } catch (e) { hideOverlay(); toast(e.message); }
}

/* ============================================================
 * Round setup form (dropdowns)
 * ============================================================ */
function fillSelect(id, items, value, labelFn) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = '';
  items.forEach((it) => {
    const opt = document.createElement('option');
    opt.value = it.id;
    opt.textContent = labelFn(it);
    if (it.id === value) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderSetup() {
  const c = State.config;
  const withSub = (it) => it.sub ? `${it.label} — ${it.sub}` : it.label;

  fillSelect('sel-opponent', State.options.opponents, c.opponent, withSub);
  fillSelect('sel-persona', State.options.personas, c.persona, withSub);
  fillSelect('sel-duration', State.options.durations, c.duration, withSub);
  fillSelect('sel-difficulty', State.options.difficulties, c.difficulty, withSub);
  fillSelect('sel-mode', State.modes, c.mode, (m) => m.label);

  bindSelect('sel-opponent', 'opponent');
  bindSelect('sel-persona', 'persona');
  bindSelect('sel-duration', 'duration');
  bindSelect('sel-difficulty', 'difficulty');
  bindSelect('sel-mode', 'mode');

  updateModeSummary();
}

function bindSelect(id, key) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.onchange = () => { State.config[key] = sel.value; updateModeSummary(); };
}

function updateModeSummary() {
  const c = State.config;
  const docs = uploadedEntries();
  const doc = docs.length
    ? docs.map(({ label, data }) => `${label}: ${data.meta.name}`).join(' | ')
    : 'your document bundle';
  document.getElementById('modes-doc').textContent = `From: ${doc}`;
  const m = State.modes.find((x) => x.id === c.mode);
  document.getElementById('mode-blurb').textContent = m ? m.blurb : '';
  const dur = State.options.durations.find((d) => d.id === c.duration);
  document.getElementById('modeSummary').textContent =
    `${m ? m.label : 'Question type'} · ${c.opponent} · ${c.persona} · ${c.difficulty} · ${dur ? dur.label : ''}`;
  document.getElementById('genBtn').disabled = !c.mode || !State.uploads.caseFacts;
}

/* ============================================================
 * Create session
 * ============================================================ */
async function createSession() {
  if (!State.uploads.caseFacts) { toast('Upload the Case Facts PDF first.'); go('upload'); return; }
  const c = State.config;
  if (!c.mode) { toast('Choose a question type.'); return; }
  const uploads = Object.fromEntries(uploadedEntries().map(({ key, data }) => [key, data.uploadId]));
  showOverlay('Building your round…', [
    'Reading the document', 'Finding the legal issues', 'Drafting the challenges', 'Setting the model answers',
  ]);
  try {
    const data = await api('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        uploads,
        mode: c.mode,
        opponent: c.opponent,
        persona: c.persona,
        difficulty: c.difficulty,
        duration: c.duration,
      }),
    });
    State.session = data;
    State.current = 0;
    hideOverlay();
    startGame();
  } catch (e) {
    hideOverlay();
    if (/expired|not found/i.test(e.message)) {
      toast('Your upload expired. Please upload again.');
      resetUpload(); go('upload');
    } else {
      toast(e.message);
    }
  }
}

/* ============================================================
 * Live hot seat (conversation)
 * ============================================================ */
function startGame() {
  const s = State.session;
  const sc = s.scenario || {};
  renderCaseMaterials(sc, s.source || {});
  document.getElementById('lv-personaLabel').textContent = `${s.persona} ${s.opponent}`;
  document.getElementById('lv-modeTag').textContent = s.modeLabel;
  setText('lv-issue', sc.legalIssue);
  setText('lv-position', sc.userPosition);
  setText('lv-opp', sc.opponentPosition);
  setText('lv-claimantCase', sc.claimantCase || materialSideText(sc.caseMaterials, /claimant|appellant/i) || 'No separate claimant/appellant material uploaded.');
  setText('lv-respondentCase', sc.respondentCase || materialSideText(sc.caseMaterials, /respondent|appellee/i) || 'No separate respondent/appellee material uploaded.');
  fillList('lv-facts', sc.keyFacts);
  fillList('lv-auth', sc.keyAuthorities);
  fillList('lv-danger', sc.dangerPoints);

  // render existing transcript
  const t = document.getElementById('transcript');
  t.innerHTML = '';
  (s.transcript || []).forEach((turn) => addUtt(turn.role, turn.text, turn.attackType, false));
  const lastBench = [...(s.transcript || [])].reverse().find((x) => x.role === 'bench');
  setIndicators(lastBench || {});
  updateExchanges();

  // clock
  State.secondsLeft = (s.minutes || 10) * 60;
  startClock();

  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').disabled = false;
  document.getElementById('sendBtn').disabled = false;
  go('game');
  document.getElementById('answerInput').focus();
}

function addUtt(role, text, attack, scroll = true) {
  const t = document.getElementById('transcript');
  const el = document.createElement('div');
  const who = role === 'bench' ? 'bench' : role === 'advocate' ? 'me' : 'sys';
  el.className = 'utt ' + who;
  const label = role === 'bench' ? (State.session.persona + ' ' + State.session.opponent)
    : role === 'advocate' ? 'You' : 'Court';
  const head = who === 'sys' ? '' :
    `<div class="who">${escapeHtml(label)}${attack ? ` <span class="attack-pill">${escapeHtml(attack)}</span>` : ''}</div>`;
  el.innerHTML = head + `<div class="bubble">${escapeHtml(text)}</div>`;
  t.appendChild(el);
  if (scroll) t.scrollTop = t.scrollHeight;
  return el;
}

function setIndicators(b) {
  const map = { low: 25, medium: 60, high: 95 };
  document.getElementById('lv-pressure').style.width = (map[b.benchPressure] || 20) + '%';
  document.getElementById('lv-attack').textContent = b.attackType || '—';
  document.getElementById('lv-unanswered').textContent = b.unanswered || 'none flagged';
  document.getElementById('lv-topic').textContent = b.topic || 'Opening';
}

function updateExchanges() {
  const n = (State.session.transcript || []).filter((x) => x.role === 'advocate').length;
  document.getElementById('lv-exchanges').textContent = n;
}

function answerKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitMessage(); }
}

function setSending(b) {
  const btn = document.getElementById('sendBtn');
  if (!btn) return;
  btn.disabled = b;
  btn.textContent = b ? '…' : 'Answer';
}

/* ---------- clock ---------- */
function clockStr(sec) { const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function startClock() {
  const el = document.getElementById('lv-clock');
  el.classList.remove('warn');
  el.textContent = clockStr(State.secondsLeft);
  clearInterval(State.timer);
  State.timer = setInterval(() => {
    State.secondsLeft--;
    el.textContent = clockStr(Math.max(0, State.secondsLeft));
    if (State.secondsLeft <= 60) el.classList.add('warn');
    if (State.secondsLeft <= 0) {
      clearInterval(State.timer);
      addUtt('sys', 'Time. The court will hear no more. End the round for your debrief.', null);
    }
  }, 1000);
}
function stopClock() { clearInterval(State.timer); }

async function finishRound() {
  const s = State.session;
  const exchanges = (s.transcript || []).filter((x) => x.role === 'advocate').length;
  if (exchanges === 0) { toast('Make at least one submission before ending.'); return; }
  stopClock();
  if (RT.active) stopRealtime(false); // end round — no auto-send
  if (RT.synth) RT.synth.cancel();
  const used = (s.minutes || 10) * 60 - Math.max(0, State.secondsLeft);
  showOverlay('Scoring your round…', ['Reading the transcript', 'Weighing your answers', 'Finding the turning point', 'Writing your debrief']);
  try {
    const data = await api(`/api/sessions/${s.id}/complete`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timeUsedSec: used }),
    });
    State.session = data;
    hideOverlay();
    renderResults();
  } catch (e) { hideOverlay(); toast(e.message); startClock(); }
}

/* ============================================================
 * Results / debrief
 * ============================================================ */
function renderResults() {
  const s = State.session;
  const d = s.debrief || {};
  document.getElementById('db-score').innerHTML = (d.overall ?? s.score ?? '—') + '<small>/100</small>';
  document.getElementById('db-diag').textContent = d.diagnosis || s.summary || '';

  const subs = [
    ['Responsiveness', d.subscores?.responsiveness, 25],
    ['Clarity + Structure', d.subscores?.clarityStructure, 20],
    ['Use of Facts', d.subscores?.useOfFacts, 20],
    ['Use of Authorities', d.subscores?.useOfAuthorities, 20],
    ['Time Discipline', d.subscores?.timeDiscipline, 15],
  ];
  const wrap = document.getElementById('db-subs');
  wrap.innerHTML = '';
  subs.forEach(([nm, sc, mx]) => {
    const row = document.createElement('div');
    row.className = 'sub';
    row.innerHTML = `<div class="nm">${nm}</div><div class="bar"><span></span></div><div class="pts">${sc ?? 0}/${mx}</div>`;
    wrap.appendChild(row);
    requestAnimationFrame(() => { row.querySelector('.bar > span').style.width = Math.round(((sc ?? 0) / mx) * 100) + '%'; });
  });

  const fb = document.getElementById('db-feedback');
  fb.innerHTML = '';
  (d.feedback || []).forEach((f) => {
    const cls = f.type === 'Good move' ? 'good' : f.type === 'Overplayed argument' ? 'over' : 'miss';
    const div = document.createElement('div');
    div.className = 'fb ' + cls;
    div.innerHTML = `<div class="ttl">${escapeHtml(f.type || '')} <span class="marker">· ${escapeHtml(f.marker || '')}</span></div>
      <p style="margin:.2rem 0 0">${escapeHtml(f.problem || '')}</p>
      ${f.better ? `<div class="better"><b>Stronger answer</b>${escapeHtml(f.better)}</div>` : ''}`;
    fb.appendChild(div);
  });
  if (!(d.feedback || []).length) fb.innerHTML = `<p class="muted">${escapeHtml(s.summary || 'Round complete.')}</p>`;

  const tp = d.turningPoint;
  const tpBox = document.getElementById('db-turning');
  if (tp && tp.question) {
    tpBox.style.display = 'block';
    setText('tp-question', tp.question);
    setText('tp-answer', tp.userAnswer);
    setText('tp-why', tp.whyWeak);
    setText('tp-stronger', tp.stronger);
  } else {
    tpBox.style.display = 'none';
  }
  go('results');
}

/* ============================================================
 * History / recent
 * ============================================================ */
async function loadRecent() {
  try {
    const { sessions } = await api('/api/sessions');
    const recent = sessions.slice(0, 4);
    const el = document.getElementById('dash-recent');
    if (!recent.length) { el.innerHTML = '<div class="empty">No rounds yet. Upload a document to begin.</div>'; return; }
    el.innerHTML = '';
    recent.forEach((s) => el.appendChild(sessionItem(s)));
  } catch { /* ignore on dashboard */ }
}

async function openHistory() {
  go('history');
  const el = document.getElementById('hist-list');
  el.innerHTML = '<div class="empty">Loading…</div>';
  try {
    const { sessions } = await api('/api/sessions');
    if (!sessions.length) { el.innerHTML = '<div class="empty">No rounds yet.</div>'; return; }
    el.innerHTML = '';
    sessions.forEach((s) => el.appendChild(sessionItem(s, true)));
  } catch (e) { el.innerHTML = `<div class="empty">${escapeHtml(e.message)}</div>`; }
}

function sessionItem(s, withDelete) {
  const div = document.createElement('div');
  div.className = 'session-item';
  const done = s.status === 'completed';
  const date = new Date(s.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const meta = [modeLabel(s.mode), s.opponent, s.difficulty].filter(Boolean).join(' | ');
  div.innerHTML = `
    <div>
      <div class="si-title">${escapeHtml(s.title)}</div>
      <div class="si-meta">${escapeHtml(meta)} · ${date}
        <span class="pill ${done ? 'done' : 'prog'}">${done ? 'Completed' : 'In progress'}</span></div>
    </div>
    <div class="si-score">${done && s.score != null ? s.score + '<small>/100</small>' : '<small>—</small>'}</div>
    ${withDelete ? '<button class="backlink del">Delete</button>' : '<div></div>'}`;
  div.querySelector('.si-title').onclick = () => openSession(s.id);
  div.onclick = (e) => { if (!e.target.classList.contains('del')) openSession(s.id); };
  if (withDelete) {
    div.querySelector('.del').onclick = async (e) => {
      e.stopPropagation();
      try { await api('/api/sessions/' + s.id, { method: 'DELETE' }); div.remove(); toast('Round deleted.', true); }
      catch (err) { toast(err.message); }
    };
  }
  return div;
}

async function openSession(id) {
  showOverlay('Opening round…', ['Loading the scenario', 'Restoring the transcript']);
  try {
    const data = await api('/api/sessions/' + id);
    State.session = data;
    hideOverlay();
    if (data.status === 'completed') renderResults();
    else startGame();
  } catch (e) { hideOverlay(); toast(e.message); }
}

function modeLabel(id) {
  const m = State.modes.find((x) => x.id === id);
  return m ? m.label : id;
}


function renderCaseMaterials(sc, source = {}) {
  const wrap = document.getElementById('lv-materials');
  if (!wrap) return;
  wrap.innerHTML = '';

  const materials = normalizeDisplayMaterials(sc, source);
  if (!materials.length) {
    const p = document.createElement('p');
    p.className = 'mtxt muted';
    p.textContent = 'No uploaded material metadata is available for this round.';
    wrap.appendChild(p);
    return;
  }

  materials.forEach((material) => {
    const card = document.createElement('div');
    card.className = 'material-card';

    const title = document.createElement('div');
    title.className = 'material-title';
    title.textContent = material.name ? material.label + ': ' + material.name : material.label;
    card.appendChild(title);

    const meta = materialMeta(material);
    if (meta) {
      const metaEl = document.createElement('div');
      metaEl.className = 'material-meta';
      metaEl.textContent = meta;
      card.appendChild(metaEl);
    }

    if (material.summary) {
      const summary = document.createElement('p');
      summary.className = 'material-summary';
      summary.textContent = material.summary;
      card.appendChild(summary);
    }

    appendMaterialList(card, material.highlights, 'material-listing');
    appendMaterialList(card, [...(material.authorities || []), ...(material.references || [])], 'material-refs');
    wrap.appendChild(card);
  });
}

function normalizeDisplayMaterials(sc, source) {
  if (Array.isArray(sc.caseMaterials) && sc.caseMaterials.length) return sc.caseMaterials;
  if (Array.isArray(sc.sourceSections) && sc.sourceSections.length) {
    return sc.sourceSections.map((section) => ({
      label: section.label || 'Uploaded material',
      name: section.name || '',
      pages: section.pages,
      words: section.words,
      chars: section.chars,
      summary: 'Uploaded and included when this round was generated.',
      highlights: [],
      authorities: [],
      references: [],
    }));
  }
  if (source.name) {
    return [{
      label: 'Uploaded material',
      name: source.name,
      pages: source.pages,
      chars: source.chars,
      summary: 'Uploaded and included when this round was generated.',
      highlights: [],
      authorities: [],
      references: [],
    }];
  }
  return [];
}

function materialSideText(materials, sideRe) {
  const material = (materials || []).find((m) => sideRe.test(String(m.label || '') + ' ' + String(m.name || '')));
  if (!material) return '';
  return material.summary || (material.highlights || [])[0] || '';
}

function materialMeta(material) {
  return [
    material.kind,
    material.pages ? material.pages + ' page' + (material.pages === 1 ? '' : 's') : '',
    material.words ? Number(material.words).toLocaleString() + ' words' : '',
    material.chars ? Number(material.chars).toLocaleString() + ' chars' : '',
  ].filter(Boolean).join(' · ');
}

function appendMaterialList(parent, items, className) {
  const clean = (items || []).filter(Boolean).slice(0, 5);
  if (!clean.length) return;
  const ul = document.createElement('ul');
  ul.className = className;
  clean.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });
  parent.appendChild(ul);
}

/* ---------- util ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val || '—'; }
function fillList(id, arr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  (arr || []).forEach((x) => { const li = document.createElement('li'); li.textContent = x; el.appendChild(li); });
  if (!(arr || []).length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'None identified.'; el.appendChild(li); }
}

/* ============================================================
 * Real-time Speech Pipeline
 *
 * Flow:
 *   Mic ON  →  SpeechRecognition (continuous, interim)
 *           →  Live transcript ticker updates every token
 *           →  Eval loop fires every EVAL_INTERVAL_MS via server
 *           →  Signals (interestingness / confidence / urgency / topic)
 *           →  Interrupt policy applied
 *           →  shouldInterrupt? → show interrupt banner OR keep going
 *   Send    →  POST /stream-bench (SSE) → bench tokens streamed in
 *           →  Voice feedback via Web Speech Synthesis
 * ============================================================ */

const RT = {
  recog: null,          // SpeechRecognition instance
  active: false,        // is the mic live?
  finalText: '',        // committed final transcript so far this turn
  interimText: '',      // latest interim (not yet committed)
  evalTimer: null,      // setInterval handle for periodic evaluation
  lastEval: null,       // most recent evaluation result from the server
  interruptShown: false,// is the interrupt banner currently showing?
  sending: false,       // is a bench response in flight?
  streamingEl: null,    // the DOM element receiving streaming tokens
  synth: window.speechSynthesis || null,
};

const EVAL_INTERVAL_MS = 6000; // evaluate transcript every 6 seconds (realistic for oral argument)

/* ---------- init ---------- */
function initSpeech() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    const btn = document.getElementById('micBtn');
    if (btn) {
      btn.title = 'Speech not supported in this browser — type your answer';
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
    }
    setRtStatus('Type your response below');
    return;
  }

  RT.recog = new SR();
  RT.recog.continuous = true;
  RT.recog.interimResults = true;
  RT.recog.lang = 'en-GB';

  RT.recog.onstart = () => {
    setRtStatus('Listening…');
    startEvalLoop();
  };

  RT.recog.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        RT.finalText += ' ' + r[0].transcript;
      } else {
        interim += r[0].transcript;
      }
    }
    RT.interimText = interim;
    const full = (RT.finalText + ' ' + interim).trim();
    // Mirror into the text area so the user can see / edit
    document.getElementById('answerInput').value = full;
    // Update the live ticker
    const tickEl = document.getElementById('rtTickText');
    if (tickEl) tickEl.textContent = full || '—';
    animateWave(true);
  };

  RT.recog.onerror = (ev) => {
    if (ev.error === 'no-speech') return; // normal silence — ignore
    toast('Microphone: ' + ev.error + '. Type below instead.');
    stopRealtime();
  };

  RT.recog.onend = () => {
    // Auto-restart if we are still supposed to be live
    if (RT.active) {
      try { RT.recog.start(); } catch (_) { /* already starting */ }
    } else {
      stopEvalLoop();
      animateWave(false);
      setRtStatus('Press 🎙 to speak');
    }
  };
}

/* ---------- toggle ---------- */
function toggleRealtime() {
  if (RT.active) {
    stopRealtime(true); // true = auto-send on stop
  } else {
    startRealtime();
  }
}

function startRealtime() {
  if (!RT.recog) { toast('Speech not supported — type your answer below.'); return; }
  if (RT.sending) { toast('Wait for the bench to finish.'); return; }
  RT.active = true;
  RT.finalText = '';
  RT.interimText = '';
  RT.interruptShown = false;
  document.getElementById('answerInput').value = '';
  const tickEl = document.getElementById('rtTickText');
  if (tickEl) tickEl.textContent = '—';
  resetMeters();
  dismissInterrupt();
  document.getElementById('micBtn').classList.add('rec');
  document.getElementById('rtHud').classList.add('active');
  try { RT.recog.start(); } catch (_) { /* already started */ }
}

function stopRealtime(autoSend = false) {
  RT.active = false;
  stopEvalLoop();
  dismissInterrupt();
  document.getElementById('micBtn').classList.remove('rec');
  document.getElementById('rtHud').classList.remove('active');
  animateWave(false);

  // Capture everything spoken before the recogniser fully stops
  const capturedText = (RT.finalText + ' ' + RT.interimText).trim();

  if (RT.recog) { try { RT.recog.stop(); } catch (_) { /* */ } }

  if (autoSend && capturedText && !RT.sending) {
    setRtStatus('Sending…');
    submitStreamMessage(capturedText);
  } else {
    setRtStatus('Press 🎙 to speak');
  }
}

/* ---------- evaluation loop ---------- */
function startEvalLoop() {
  stopEvalLoop();
  RT.evalTimer = setInterval(runEval, EVAL_INTERVAL_MS);
}
function stopEvalLoop() {
  clearInterval(RT.evalTimer);
  RT.evalTimer = null;
}

async function runEval() {
  if (!State.session || RT.sending) return;
  const transcript = (RT.finalText + ' ' + RT.interimText).trim();
  if (!transcript || transcript.split(/\s+/).length < 4) return;

  try {
    const result = await api(`/api/sessions/${State.session.id}/evaluate-transcript`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    RT.lastEval = result;
    updateMeters(result);
    applyInterruptPolicy(result, transcript);
  } catch { /* network hiccup — skip this tick */ }
}

/* ---------- meters ---------- */
function updateMeters(ev) {
  setMeter('mInterest', 'mInterestVal', ev.interestingness);
  setMeter('mConfid', 'mConfidVal', ev.confidence);
  setMeter('mUrgency', 'mUrgencyVal', ev.urgency);
  const topicEl = document.getElementById('mTopic');
  if (topicEl) topicEl.textContent = ev.topic || '—';
  // Colour urgency fill: green → amber → red
  const urgEl = document.getElementById('mUrgency');
  if (urgEl) {
    urgEl.style.background = ev.urgency > 0.65
      ? 'var(--oxblood)'
      : ev.urgency > 0.4
        ? 'var(--brass)'
        : 'var(--verdigris)';
  }
}

function setMeter(fillId, valId, ratio) {
  const fill = document.getElementById(fillId);
  const val = document.getElementById(valId);
  if (fill) fill.style.width = Math.round((ratio || 0) * 100) + '%';
  if (val) val.textContent = Math.round((ratio || 0) * 100) + '%';
}

function resetMeters() {
  ['mInterest', 'mConfid', 'mUrgency'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.width = '0%';
  });
  ['mInterestVal', 'mConfidVal', 'mUrgencyVal'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '—';
  });
  const topicEl = document.getElementById('mTopic');
  if (topicEl) topicEl.textContent = '—';
}

/* ---------- interrupt policy ---------- */
function applyInterruptPolicy(ev, transcript) {
  if (RT.interruptShown) return; // already interrupted this turn
  if (!ev.shouldInterrupt) return;
  if (transcript.split(/\s+/).length < 8) return; // too short to be worth sending

  // The bench cuts in: stop the mic immediately and fire the bench response.
  RT.interruptShown = true;
  showInterruptNotice(ev.interruptReason);
  stopRealtime(false);          // stop mic — no auto-send from stopRealtime
  submitStreamMessage(transcript); // bench response IS the interruption
}

// Read-only notification strip — no buttons, auto-dismisses once the bench response arrives.
function showInterruptNotice(reason) {
  const box = document.getElementById('rtInterrupt');
  const reasonEl = document.getElementById('rtIntReason');
  if (box) box.style.display = 'flex';
  if (reasonEl) reasonEl.textContent = reason || 'The bench cuts in';
}

function dismissInterrupt() {
  RT.interruptShown = false;
  const box = document.getElementById('rtInterrupt');
  if (box) box.style.display = 'none';
}

/* ---------- submit via SSE streaming ---------- */
async function submitMessage() {
  if (RT.sending) return;
  const inp = document.getElementById('answerInput');
  const txt = inp.value.trim();
  if (!txt) { toast('Say or type something first.'); return; }
  if (State.session?.status === 'completed') { toast('This round is already complete.'); return; }
  stopRealtime(false); // don't auto-send — we send below with the captured text
  await submitStreamMessage(txt);
}

async function submitStreamMessage(txt) {
  if (RT.sending) return;
  RT.sending = true;
  setSending(true);
  document.getElementById('answerInput').value = '';
  const tickEl = document.getElementById('rtTickText');
  if (tickEl) tickEl.textContent = '—';
  resetMeters();

  // Show advocate turn immediately
  addUtt('advocate', txt, null);
  State.session.transcript.push({ role: 'advocate', text: txt });
  updateExchanges();

  // Streaming bench response
  const benchEl = addStreamingUtt();
  let finalBench = null;

  try {
    await new Promise((resolve, reject) => {
      // Use fetch + ReadableStream to consume the SSE
      fetch(`/api/sessions/${State.session.id}/stream-bench`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: txt }),
      }).then(async (res) => {
        if (!res.ok) {
          let err = {};
          try { err = await res.json(); } catch { /* */ }
          reject(new Error(err.error || 'Bench failed to respond.'));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastTokenText = '';

        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { resolve(); return; }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line
            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith('event:')) continue;
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              try {
                const ev = JSON.parse(jsonStr);
                if (ev.text !== undefined) {
                  // Streaming token — update the bench bubble in real time
                  lastTokenText = ev.text;
                  updateStreamingUtt(benchEl, ev.text);
                  if (ev.done) speakText(ev.text);
                }
                if (ev.bench) {
                  // Final event with full metadata
                  finalBench = ev.bench;
                  finaliseStreamingUtt(benchEl, ev.bench);
                  State.session.transcript.push({ role: 'bench', ...ev.bench, text: ev.bench.text });
                  setIndicators(ev.bench);
                  resolve();
                }
                if (ev.message) {
                  reject(new Error(ev.message));
                }
              } catch { /* malformed SSE — skip */ }
            }
          }
        };
        pump().catch(reject);
      }).catch(reject);
    });
  } catch (e) {
    benchEl.remove();
    // Restore the unsent text
    document.getElementById('answerInput').value = txt;
    State.session.transcript.pop();
    updateExchanges();
    toast(e.message);
  } finally {
    RT.sending = false;
    setSending(false);
    dismissInterrupt(); // clear the interrupt notice now that the bench has spoken
    setRtStatus('Press 🎙 to speak');
  }
}

/* ---------- streaming utterance helpers ---------- */
function addStreamingUtt() {
  const t = document.getElementById('transcript');
  const el = document.createElement('div');
  const label = (State.session.persona + ' ' + State.session.opponent);
  el.className = 'utt bench streaming';
  el.innerHTML = `<div class="who">${escapeHtml(label)}</div><div class="bubble"><span class="stream-cursor">█</span></div>`;
  t.appendChild(el);
  t.scrollTop = t.scrollHeight;
  RT.streamingEl = el;
  return el;
}

function updateStreamingUtt(el, text) {
  const bubble = el.querySelector('.bubble');
  if (!bubble) return;
  bubble.innerHTML = escapeHtml(text) + '<span class="stream-cursor">█</span>';
  const t = document.getElementById('transcript');
  t.scrollTop = t.scrollHeight;
}

function finaliseStreamingUtt(el, bench) {
  el.classList.remove('streaming');
  const bubble = el.querySelector('.bubble');
  if (bubble) bubble.innerHTML = escapeHtml(bench.text);
  // Add attack pill
  const who = el.querySelector('.who');
  if (who && bench.attackType) {
    who.innerHTML = escapeHtml(State.session.persona + ' ' + State.session.opponent) +
      ` <span class="attack-pill">${escapeHtml(bench.attackType)}</span>`;
  }
  const t = document.getElementById('transcript');
  t.scrollTop = t.scrollHeight;
}

/* ---------- voice feedback (TTS) ---------- */
function speakText(text) {
  if (!RT.synth || !text) return;
  // Don't speak if user is actively typing / mic is on
  if (RT.active) return;
  RT.synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.05;
  utt.pitch = 0.9;
  utt.lang = 'en-GB';
  // Choose a voice that sounds authoritative if available
  const voices = RT.synth.getVoices();
  const preferred = voices.find((v) => /Daniel|Google UK English Male|en-GB/i.test(v.name + v.lang));
  if (preferred) utt.voice = preferred;
  RT.synth.speak(utt);
}

/* ---------- waveform animation ---------- */
function animateWave(active) {
  const wave = document.getElementById('rtWave');
  if (!wave) return;
  if (active) wave.classList.add('live'); else wave.classList.remove('live');
}

/* ---------- status label ---------- */
function setRtStatus(msg) {
  const el = document.getElementById('rtStatus');
  if (el) el.textContent = msg;
}

/* ---------- legacy compatibility shims ---------- */
// These were referenced by the old push-to-talk system and by finishRound().
function stopMic() { stopRealtime(); }
let recording = false; // kept so finishRound() guard still compiles

init();
initSpeech();
