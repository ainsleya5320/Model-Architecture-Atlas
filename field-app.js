// MODEL ATLAS — field guide UI: field map, subfield pages, research tracks,
// reading list + journal, progress storage, and the hash router for every tab.
// Loads after app.js (uses $, $$, showTip, hideTip, gstate, renderGlossary).
"use strict";

const SF = Object.fromEntries(SUBFIELDS.map(s => [s.id, s]));
const DOM = Object.fromEntries(DOMAINS.map(d => [d.id, d]));
const LIB = Object.fromEntries(LIBRARY.map(l => [l.id, l]));
const LEVELS = ["Not yet", "Literate", "Fluent", "Practitioner"];
const LEVEL_HINT = ["", "can explain it and read an announcement", "can follow the papers and spot weak claims", "can build or run it"];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lvlDot = n => `<span class="lvl lvl-${n}" aria-hidden="true"></span>`;
const subsOf = domId => SUBFIELDS.filter(s => s.dom === domId);

// ============================================================
// STORAGE — levels, reading log + notes, path steps (this browser only)
// ============================================================
const STORE_KEY = "modelAtlas.field.v1";
const store = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && typeof s === "object") return { progress: s.progress || {}, reading: s.reading || {}, path: s.path || {} };
  } catch (e) { /* storage unavailable: keep state in memory */ }
  return { progress: {}, reading: {}, path: {} };
})();
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ } }

const level = id => store.progress[id] || 0;
function setLevel(id, n) {
  if (n) store.progress[id] = n; else delete store.progress[id];
  saveStore();
}
const readRec = id => store.reading[id] || {};
function updateRead(id, patch) {
  const r = { ...readRec(id), ...patch };
  if (!r.read && !r.claim && !r.test && !r.falsify) delete store.reading[id];
  else store.reading[id] = r;
  saveStore();
}
const pathDone = p => (p.id in store.path ? !!store.path[p.id] : !!p.defaultDone);

// ============================================================
// FIELD MAP
// ============================================================
function regionHTML(d, num) {
  const subs = subsOf(d.id);
  const reached = subs.filter(s => level(s.id) > 0).length;
  return `<div class="region" data-dom="${d.id}">
    <div class="rhead">${num ? `<span class="rnum">${num}</span>` : ""}<h3>${d.name}</h3>
      <span class="rcount" title="Subfields at Literate or above">${reached}/${subs.length}</span></div>
    <p class="rblurb">${d.blurb}</p>
    <ul class="rlist">${subs.map(s => `<li><a class="sfchip" href="#subfields/${s.id}">${lvlDot(level(s.id))}<span>${s.short}</span><span class="sr-only"> (${LEVELS[level(s.id)]})</span></a></li>`).join("")}</ul>
  </div>`;
}

function renderMap() {
  const inBand = b => DOMAINS.filter(d => d.band === b);
  const label = b => BANDS.find(x => x.id === b).label;
  const life = inBand("life");
  const lifeHTML = life.map((d, i) =>
    regionHTML(d, i + 1) + (i < life.length - 1 ? `<div class="flow-arrow" aria-hidden="true">→</div>` : "")).join("");
  const band = (id, body, cls = "") =>
    `<div class="band" data-band="${id}"><div class="band-label">${label(id)}</div><div class="band-body ${cls}">${body}</div></div>`;
  $("#fieldMap").innerHTML =
    band("world", inBand("world").map(d => regionHTML(d)).join("")) +
    band("life", lifeHTML, "flow") +
    band("object", inBand("object").map(d => regionHTML(d)).join("") +
      `<div class="object-links"><a href="#models">Model index →</a><a href="#compare">Compare →</a><a href="#concepts">Concepts →</a></div>`) +
    band("lens", inBand("lens").map(d => regionHTML(d)).join("")) +
    band("ground", inBand("ground").map(d => regionHTML(d)).join(""));
  renderProgress();
}

function renderProgress() {
  const counts = [0, 0, 0, 0];
  SUBFIELDS.forEach(s => counts[level(s.id)]++);
  const reached = counts[1] + counts[2] + counts[3];
  $("#progressSummary").innerHTML =
    `<b>${reached}</b> of ${SUBFIELDS.length} subfields at Literate or above · ${counts[1]} literate · ${counts[2]} fluent · ${counts[3]} practitioner`;
  $("#levelLegend").innerHTML = [1, 2, 3].map(n =>
    `<span class="key">${lvlDot(n)}<b>${LEVELS[n]}</b>&nbsp;<span class="muted">${LEVEL_HINT[n]}</span></span>`).join("") +
    `<span class="key">${lvlDot(0)}<span class="muted">Not yet</span></span>`;
  $("#progressBars").innerHTML = DOMAINS.map(d => {
    const subs = subsOf(d.id);
    const c = [0, 0, 0, 0];
    subs.forEach(s => c[level(s.id)]++);
    const filled = [1, 2, 3].filter(n => c[n]);
    const segs = filled.map((n, i) =>
      `<span class="pseg lvl-${n}${i === filled.length - 1 ? " end" : ""}" style="flex:${c[n]}" data-tip="${esc(d.name)}: ${c[n]} of ${subs.length} ${LEVELS[n].toLowerCase()}"></span>`).join("");
    const rest = c[0] ? `<span class="prest" style="flex:${c[0]}"></span>` : "";
    return `<a class="prow" href="#subfields/${subs[0].id}" aria-label="${esc(d.name)}: ${subs.length - c[0]} of ${subs.length} at Literate or above">
      <span class="pname">${d.short}</span><span class="pbar">${segs}${rest}</span><span class="pval">${subs.length - c[0]}/${subs.length}</span></a>`;
  }).join("");
  $$("#progressBars .pseg").forEach(seg => {
    seg.addEventListener("mousemove", e => showTip(e, `<div class="t-name">${seg.dataset.tip}</div>`));
    seg.addEventListener("mouseleave", hideTip);
  });
}

// ============================================================
// SUBFIELD PAGES
// ============================================================
let currentSf = null;

function buildSubfieldNav() {
  $("#sfNav").innerHTML = DOMAINS.map(d => `<div class="sfn-group">
      <div class="sfn-dom">${d.name}</div>
      ${subsOf(d.id).map(s => `<a class="sfn-link" data-id="${s.id}" href="#subfields/${s.id}">${lvlDot(level(s.id))}<span>${s.short}</span></a>`).join("")}
    </div>`).join("");
  $("#sfSelect").innerHTML = DOMAINS.map(d =>
    `<optgroup label="${esc(d.name)}">${subsOf(d.id).map(s => `<option value="${s.id}">${esc(s.short)}</option>`).join("")}</optgroup>`).join("");
  $("#sfSelect").addEventListener("change", e => { location.hash = "#subfields/" + e.target.value; });
}

function syncSubfieldNav() {
  $$("#sfNav .sfn-link").forEach(a => {
    const id = a.dataset.id, on = id === currentSf;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    a.querySelector(".lvl").className = "lvl lvl-" + level(id);
  });
  $("#sfSelect").value = currentSf;
}

function libRow(l, { notes = false } = {}) {
  const r = readRec(l.id);
  const hasNotes = !!(r.claim || r.test || r.falsify);
  const chips = notes ? `<div class="lib-subs">${l.subs.map(s => `<a href="#subfields/${s}">${SF[s].short}</a>`).join("")}</div>` : "";
  const notesBtn = notes ? `<button type="button" class="note-btn" aria-expanded="${rstate.open.has(l.id)}">${hasNotes ? "Notes ✓" : "Notes"}</button>` : "";
  const panel = notes && rstate.open.has(l.id) ? notesPanel(l) : "";
  return `<li class="lib-row${r.read ? " is-read" : ""}" data-id="${l.id}">
    <input type="checkbox" class="lib-read" aria-label="Mark as read: ${esc(l.title)}"${r.read ? " checked" : ""}>
    <div class="lib-body">
      <div class="lib-top"><a class="lib-title" href="${l.url}" target="_blank" rel="noopener">${l.title}</a>${l.core ? ` <span class="core" title="Part of the essential canon">essential</span>` : ""}${notesBtn}</div>
      <div class="lib-meta">${l.who} · ${l.year} · ${LIB_TYPES[l.type]}${hasNotes && !notes ? " · notes" : ""}${r.read && r.readOn ? ` · read ${r.readOn}` : ""}</div>
      <div class="lib-why">${l.why}</div>
      ${chips}${panel}
    </div>
  </li>`;
}

function notesPanel(l) {
  const r = readRec(l.id);
  const field = (key, label, hint) => `<label class="note-field"><span>${label}</span>
      <textarea data-key="${key}" rows="2" placeholder="${hint}">${esc(r[key] || "")}</textarea></label>`;
  return `<div class="notes" data-id="${l.id}">
    ${field("claim", "What is claimed", "The main claim, in one or two sentences")}
    ${field("test", "How they tested it", "Data, baselines, metrics, sample sizes")}
    ${field("falsify", "What would falsify it", "A result that would show the claim is wrong")}
  </div>`;
}

function bindLibRows(root, after) {
  $$(".lib-read", root).forEach(cb => cb.addEventListener("change", () => {
    const row = cb.closest(".lib-row"), id = row.dataset.id;
    updateRead(id, { read: cb.checked, readOn: cb.checked ? new Date().toISOString().slice(0, 10) : undefined });
    row.classList.toggle("is-read", cb.checked);
    if (after) after();
  }));
  $$(".notes textarea", root).forEach(ta => ta.addEventListener("input", () => {
    updateRead(ta.closest(".notes").dataset.id, { [ta.dataset.key]: ta.value });
  }));
  $$(".note-btn", root).forEach(btn => btn.addEventListener("click", () => {
    const id = btn.closest(".lib-row").dataset.id;
    if (rstate.open.has(id)) rstate.open.delete(id); else rstate.open.add(id);
    renderReadingList();
    const ta = $(`.lib-row[data-id="${id}"] textarea`);
    if (ta) ta.focus();
  }));
}

function renderSubfield(id) {
  currentSf = id;
  const s = SF[id], d = DOM[s.dom];
  const siblings = subsOf(s.dom);
  const idx = SUBFIELDS.indexOf(s);
  const prev = SUBFIELDS[idx - 1], next = SUBFIELDS[idx + 1];
  const lvl = level(id);
  const leadsTo = SUBFIELDS.filter(x => (x.builds || []).includes(id));
  const lib = LIBRARY.filter(l => l.subs.includes(id))
    .sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0) || a.year - b.year);
  const pill = x => `<a class="sfpill" href="#subfields/${x.id}">${lvlDot(level(x.id))}${x.short}</a>`;

  $("#sfMain").innerHTML = `
    <div class="sf-head">
      <div class="sf-crumb"><a href="#map">${d.name}</a> · ${siblings.indexOf(s) + 1} of ${siblings.length}</div>
      <h2>${s.name}</h2>
      <p class="sf-line">${s.line}</p>
      <div class="lvl-picker" role="group" aria-label="Your level in ${esc(s.short)}">
        ${LEVELS.map((L, n) => `<button type="button" class="lvl-btn" data-lvl="${n}" aria-pressed="${lvl === n}">${lvlDot(n)}${L}</button>`).join("")}
      </div>
    </div>

    <section class="sf-sec"><h3>What it is</h3><p>${s.what}</p></section>

    <section class="sf-sec"><h3>Key ideas</h3>
      <dl class="ideas">${s.ideas.map(([t, x]) => `<div><dt>${t}</dt><dd>${x}</dd></div>`).join("")}</dl>
    </section>

    <div class="sf-two">
      <section class="sf-sec"><h3>Why it matters</h3><p>${s.why}</p></section>
      <section class="sf-sec sf-inv"><h3>Investor lens</h3><p>${s.investor}</p></section>
    </div>

    <section class="sf-sec"><h3>What competence looks like</h3>
      <div class="levels">${[1, 2, 3].map(n => `<div class="lv${lvl >= n ? " reached" : ""}">
          <div class="lv-h">${lvlDot(n)}${LEVELS[n]}${lvl >= n ? ` <span class="lv-you">you</span>` : ""}</div>
          <p>${s.levels[n - 1]}</p></div>`).join("")}</div>
    </section>

    <section class="sf-sec"><h3>Check yourself</h3>
      ${s.check.map(([q, a]) => `<details class="qa"><summary>${q}</summary><p>${a}</p></details>`).join("")}
    </section>

    <section class="sf-sec"><h3>Read &amp; learn <span class="sec-note">${lib.length} items · essential first</span></h3>
      <ul class="lib-list compact">${lib.map(l => libRow(l)).join("")}</ul>
    </section>

    <section class="sf-sec sf-do"><h3>Do</h3><p>${s.exercise}</p></section>

    <section class="sf-sec"><h3>Connections</h3>
      <div class="conn">
        ${s.builds.length ? `<div class="conn-row"><span class="conn-k">Builds on</span><div class="pills">${s.builds.map(b => pill(SF[b])).join("")}</div></div>` : ""}
        ${leadsTo.length ? `<div class="conn-row"><span class="conn-k">Leads to</span><div class="pills">${leadsTo.map(pill).join("")}</div></div>` : ""}
        <div class="conn-row"><span class="conn-k">Terms</span><div class="pills">${s.terms.map(t => `<a class="termpill" href="#glossary/${encodeURIComponent(t)}">${t}</a>`).join("")}</div></div>
        ${s.atlas ? `<div class="conn-row"><span class="conn-k">In this atlas</span><div class="pills">${s.atlas.map(([h, t]) => `<a class="termpill" href="${h}">${t}</a>`).join("")}</div></div>` : ""}
      </div>
    </section>

    <nav class="sf-pager" aria-label="Previous and next subfield">
      ${prev ? `<a href="#subfields/${prev.id}">← ${prev.short}</a>` : "<span></span>"}
      ${next ? `<a href="#subfields/${next.id}">${next.short} →</a>` : "<span></span>"}
    </nav>`;

  $$(".lvl-btn", $("#sfMain")).forEach(b => b.addEventListener("click", () => {
    setLevel(id, +b.dataset.lvl);
    renderSubfield(id);
  }));
  bindLibRows($("#sfMain"));
  syncSubfieldNav();
}

// ============================================================
// RESEARCH TRACKS
// ============================================================
function renderTracks() {
  $("#tracksGrid").innerHTML = TRACKS.map(t => {
    const ready = t.subs.filter(id => level(id) > 0).length;
    return `<article class="track card">
      <div class="track-tag">${t.tag}</div>
      <h2>${t.name}</h2>
      <p class="body">${t.what}</p>
      <h3>What it takes</h3><ul>${t.takes.map(x => `<li>${x}</li>`).join("")}</ul>
      <div class="odds"><b>Honest odds.</b> ${t.odds}</div>
      <h3>Ways in</h3><ul>${t.ways.map(x => `<li>${x}</li>`).join("")}</ul>
      <h3>Starter projects</h3><ol>${t.projects.map(x => `<li>${x}</li>`).join("")}</ol>
      <h3>Core subfields <span class="sec-note">${ready} of ${t.subs.length} at Literate or above</span></h3>
      <div class="pills">${t.subs.map(id => `<a class="sfpill" href="#subfields/${id}">${lvlDot(level(id))}${SF[id].short}</a>`).join("")}</div>
      <h3>Start here</h3>
      <ul class="track-links">${t.links.map(id => `<li><a href="${LIB[id].url}" target="_blank" rel="noopener">${LIB[id].title}</a> <span class="muted">${LIB[id].who}</span></li>`).join("")}</ul>
    </article>`;
  }).join("");

  $("#pathList").innerHTML = PATH.map((p, i) => `
    <li class="step${pathDone(p) ? " done" : ""}" data-id="${p.id}">
      <label class="step-check"><input type="checkbox"${pathDone(p) ? " checked" : ""}><span class="sr-only">Step ${i} done</span></label>
      <div class="step-body">
        <div class="step-num">Step ${i}${pathDone(p) ? " · done" : ""}</div>
        <h3>${p.title}</h3>
        <p>${p.what}</p>
        <p class="done-when"><b>Done when:</b> ${p.doneWhen}</p>
        <div class="pills">${p.links.map(([h, t]) => `<a class="termpill" href="${h}">${t} →</a>`).join("")}</div>
      </div>
    </li>`).join("");
  $$("#pathList .step input").forEach(cb => cb.addEventListener("change", () => {
    store.path[cb.closest(".step").dataset.id] = cb.checked;
    saveStore();
    renderTracks();
  }));

  $("#commGrid").innerHTML = COMMUNITIES.map(c => `<a class="comm" href="${c.url}" target="_blank" rel="noopener">
      <span class="comm-name">${c.name} ↗</span><span class="comm-for">${c.for}</span></a>`).join("");
}

// ============================================================
// READING LIST + JOURNAL
// ============================================================
const rstate = { q: "", type: "all", dom: "all", core: false, unread: false, open: new Set() };

function buildReadingControls() {
  $("#readDom").innerHTML = `<option value="all">All areas</option>` +
    DOMAINS.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join("");
  $("#readTypes").innerHTML = `<button type="button" class="fbtn on" data-rtype="all">All</button>` +
    Object.entries(LIB_TYPES).map(([k, v]) => `<button type="button" class="fbtn" data-rtype="${k}">${v}</button>`).join("");
  $("#readSearch").addEventListener("input", e => { rstate.q = e.target.value; renderReadingList(); });
  $("#readDom").addEventListener("change", e => { rstate.dom = e.target.value; renderReadingList(); });
  $("#readCore").addEventListener("change", e => { rstate.core = e.target.checked; renderReadingList(); });
  $("#readUnread").addEventListener("change", e => { rstate.unread = e.target.checked; renderReadingList(); });
  $$("#readTypes .fbtn").forEach(b => b.addEventListener("click", () => {
    rstate.type = b.dataset.rtype;
    $$("#readTypes .fbtn").forEach(x => x.classList.toggle("on", x === b));
    renderReadingList();
  }));
}

function renderReadingList() {
  const q = rstate.q.toLowerCase().trim();
  const primaryDom = l => SF[l.subs[0]].dom;
  const items = LIBRARY.filter(l =>
    (rstate.type === "all" || l.type === rstate.type) &&
    (rstate.dom === "all" || l.subs.some(s => SF[s].dom === rstate.dom)) &&
    (!rstate.core || l.core) &&
    (!rstate.unread || !readRec(l.id).read) &&
    (!q || (l.title + " " + l.who + " " + l.why + " " + l.year + " " + l.subs.map(s => SF[s].short).join(" ")).toLowerCase().includes(q)));
  const order = Object.fromEntries(DOMAINS.map((d, i) => [d.id, i]));
  items.sort((a, b) => (order[primaryDom(a)] - order[primaryDom(b)]) || ((b.core ? 1 : 0) - (a.core ? 1 : 0)) || a.year - b.year);

  let html = "", last = null;
  for (const l of items) {
    const dom = rstate.dom === "all" ? primaryDom(l) : rstate.dom;
    if (dom !== last) {
      if (last !== null) html += `</ul>`;
      html += `<h3 class="read-dom">${DOM[dom].name}</h3><ul class="lib-list">`;
      last = dom;
    }
    html += libRow(l, { notes: true });
  }
  if (last !== null) html += `</ul>`;
  $("#readList").innerHTML = html || `<p class="muted" style="padding:12px 0">Nothing matches these filters.</p>`;
  bindLibRows($("#readList"), () => renderReadingStats(items.length));
  renderReadingStats(items.length);
}

function renderReadingStats(shown) {
  const read = LIBRARY.filter(l => readRec(l.id).read).length;
  const noted = LIBRARY.filter(l => { const r = readRec(l.id); return r.claim || r.test || r.falsify; }).length;
  const core = LIBRARY.filter(l => l.core);
  const coreRead = core.filter(l => readRec(l.id).read).length;
  const showing = typeof shown === "number" ? `${shown} shown · ` : "";
  $("#readCount").textContent = `${showing}${read} of ${LIBRARY.length} read · essential ${coreRead}/${core.length} · ${noted} with notes`;
}

function renderReading() { renderReadingList(); }

// ============================================================
// EXPORT / IMPORT / RESET
// ============================================================
function exportData() {
  const blob = new Blob([JSON.stringify({ app: "model-atlas", version: 1, exported: new Date().toISOString(), ...store }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "model-atlas-progress-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

$("#importFile").addEventListener("change", async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    for (const k of ["progress", "reading", "path"]) {
      if (data[k] && typeof data[k] === "object") Object.assign(store[k], data[k]);
    }
    saveStore();
    flash("Imported");
    route(true);
  } catch (err) {
    flash("That file could not be read");
  }
});

let resetArmed = null;
$$(".datatools [data-act]").forEach(btn => btn.addEventListener("click", () => {
  const act = btn.dataset.act;
  if (act === "export") exportData();
  if (act === "import") $("#importFile").click();
  if (act === "reset") {
    if (resetArmed === btn) {
      store.progress = {}; store.reading = {}; store.path = {};
      saveStore();
      resetArmed = null;
      flash("Reset");
      route(true);
    } else {
      resetArmed = btn;
      btn.textContent = "Click again to erase";
      setTimeout(() => { if (resetArmed === btn) { resetArmed = null; btn.textContent = "Reset"; } }, 4000);
    }
  }
}));

function flash(msg) {
  let el = $("#flash");
  if (!el) { el = document.createElement("div"); el.id = "flash"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 1800);
  $$(".datatools [data-act=reset]").forEach(b => (b.textContent = "Reset"));
}

// ============================================================
// ROUTER — #map, #subfields/<id>, #tracks, #reading, #models,
// #compare, #concepts, #glossary/<term>
// ============================================================
const TABS = ["map", "subfields", "tracks", "reading", "models", "compare", "concepts", "glossary"];
const TAB_TITLES = { map: "Field map", subfields: "Subfields", tracks: "Research tracks", reading: "Reading list", models: "Model index", compare: "Compare", concepts: "Concepts", glossary: "Glossary" };
let lastRoute = "";

function openGlossaryTerm(term) {
  gstate.search = term;
  gstate.dom = "all";
  $("#glossSearch").value = term;
  syncGlossFilters();
  renderGlossary();
  const card = $$("#glossGrid .gcard").find(c => c.dataset.term === term);
  if (card) { card.classList.add("hit"); card.scrollIntoView({ block: "center" }); }
}

function route(force) {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  const cut = raw.indexOf("/");
  const head = cut < 0 ? raw : raw.slice(0, cut);
  const arg = cut < 0 ? "" : raw.slice(cut + 1);
  const tab = TABS.includes(head) ? head : "map";
  const key = tab + "/" + arg;
  const changed = key !== lastRoute;

  $$("nav.tabs a").forEach(a => {
    const on = a.dataset.tab === tab;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  $$("section.tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + tab));
  hideTip();
  document.title = "Model Atlas · " + (tab === "subfields" && SF[arg] ? SF[arg].short : TAB_TITLES[tab]);

  if (tab === "map") renderMap();
  else if (tab === "subfields") renderSubfield(SF[arg] ? arg : (currentSf || SUBFIELDS[0].id));
  else if (tab === "tracks") renderTracks();
  else if (tab === "reading") renderReading();

  if (changed || force === true) {
    if (tab === "glossary" && arg) openGlossaryTerm(arg);
    else if (tab === "tracks" && arg && document.getElementById(arg)) document.getElementById(arg).scrollIntoView();
    else window.scrollTo(0, 0);
  }
  lastRoute = key;
}

buildSubfieldNav();
buildReadingControls();
window.addEventListener("hashchange", () => route());
route();
