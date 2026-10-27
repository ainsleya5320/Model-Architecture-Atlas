// MODEL ATLAS — Researchers tab: the people behind the papers. A sortable
// index with h-index and citations (OpenAlex), signature papers linked to the
// reading list, where each researcher works now, an h-index explainer chart
// and a breadth-versus-landmark scatter. Data lives in people.js.
// Loads after closed-app.js (reuses marker, placeLabels, labelSVG, swatch-style
// marks) and before field-app.js, whose router calls renderPeople() and
// openPerson(); reading checkmarks go through field-app.js's store.
"use strict";

const PPL = Object.fromEntries(PEOPLE.map(p => [p.id, p]));
const fmtInt = n => n.toLocaleString("en-US");
const fmtK = n => (n >= 1e6 ? +(n / 1e6).toFixed(2) + "M" : n >= 1e4 ? Math.round(n / 1000) + "k" : n >= 1e3 ? +(n / 1000).toFixed(1) + "k" : String(n));
const groupMarker = (g, x, y, r, extra = "") => marker(PEOPLE_GROUPS[g].shape, x, y, r, `fill="${PEOPLE_GROUPS[g].color}" ${extra}`);
const groupSwatch = g => `<svg class="cl-sw" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${groupMarker(g, 8, 8, 5.2)}</svg>`;
const libItem = id => LIBRARY.find(l => l.id === id);
const libByUrl = url => LIBRARY.find(l => l.url === url);

// ============================================================
// TABLE + DETAIL PANELS
// ============================================================
const pstate = { q: "", group: "all", sortKey: "h", sortDir: -1, open: null };

const PCOLS = [
  { key: "name", label: "Researcher", get: p => p.name.split(" ").slice(-1)[0], text: true },
  { key: "known", label: "Known for", get: p => p.known, text: true, nosort: true },
  { key: "h", label: "h-index", get: p => p.oa.h },
  { key: "cites", label: "Citations", get: p => p.oa.cites },
  { key: "top", label: "Most-cited paper", get: p => p.oa.top.cites },
];

function renderPeopleFilters() {
  $("#ppGroups").innerHTML = `<button type="button" class="fbtn" data-group="all">Everyone</button>` +
    Object.entries(PEOPLE_GROUPS).map(([id, g]) => `<button type="button" class="fbtn" data-group="${id}">${groupSwatch(id)}${g.name}</button>`).join("");
  $$("#ppGroups .fbtn").forEach(b => b.addEventListener("click", () => { pstate.group = b.dataset.group; renderPeopleTable(); }));
  $("#ppSearch").addEventListener("input", e => { pstate.q = e.target.value; renderPeopleTable(); });
}

function renderPeopleTable() {
  $$("#ppGroups .fbtn").forEach(b => b.classList.toggle("on", b.dataset.group === pstate.group));
  const maxH = Math.max(...PEOPLE.map(p => p.oa.h));
  const head = PCOLS.map(c => {
    const arrow = pstate.sortKey === c.key ? `<span class="arrow">${pstate.sortDir > 0 ? "▲" : "▼"}</span>` : "";
    return `<th data-key="${c.key}"${c.nosort ? ` class="nosort"` : ` aria-sort="${pstate.sortKey === c.key ? (pstate.sortDir > 0 ? "ascending" : "descending") : "none"}"`}>${c.label} ${arrow}</th>`;
  }).join("");
  const q = pstate.q.toLowerCase().trim();
  const col = PCOLS.find(c => c.key === pstate.sortKey);
  const rows = PEOPLE
    .filter(p => (pstate.group === "all" || p.group === pstate.group) &&
      (!q || (p.name + " " + p.known + " " + p.now + " " + p.papers.map(x => x.title).join(" ")).toLowerCase().includes(q)))
    .sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      return (col.text ? String(va).localeCompare(String(vb)) : va - vb) * pstate.sortDir;
    });

  const body = rows.map(p => {
    const open = pstate.open === p.id;
    const flag = p.oa.note ? ` <span class="pp-flag" title="${attr(p.oa.note)}">*</span>` : "";
    let html = `<tr class="mrow${open ? " is-open" : ""}" data-id="${p.id}" tabindex="0" aria-expanded="${open}">
      <td class="name">${groupSwatch(p.group)} ${p.name}<span class="lab">${p.now}</span></td>
      <td class="pp-known">${p.known}</td>
      <td class="pp-h"><span class="pp-hnum">${p.oa.h}${flag}</span><span class="pp-hbar"><span style="width:${(100 * p.oa.h / maxH).toFixed(1)}%"></span></span></td>
      <td>${fmtK(p.oa.cites)}</td>
      <td class="pp-top">${attr(p.oa.top.title)}<span class="cl-sub">${fmtK(p.oa.top.cites)} citations</span></td>
    </tr>`;
    if (open) html += `<tr class="detail"><td colspan="${PCOLS.length}">${personPanel(p)}</td></tr>`;
    return html;
  }).join("");

  $("#ppTable").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  $("#ppCount").textContent = `${rows.length} of ${PEOPLE.length} researchers · click a row for papers and background`;
  $$("#ppTable th:not(.nosort)").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.key, c = PCOLS.find(x => x.key === k);
    if (pstate.sortKey === k) pstate.sortDir *= -1;
    else { pstate.sortKey = k; pstate.sortDir = c.text ? 1 : -1; }
    renderPeopleTable();
  }));
  $$("#ppTable tr.mrow").forEach(tr => {
    const toggle = () => { pstate.open = pstate.open === tr.dataset.id ? null : tr.dataset.id; renderPeopleTable(); };
    tr.addEventListener("click", e => { if (!e.target.closest("a, input, label")) toggle(); });
    tr.addEventListener("keydown", e => { if (e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(); } });
  });
  $$("#ppTable .pp-read").forEach(cb => cb.addEventListener("change", () => {
    updateRead(cb.dataset.lib, { read: cb.checked, readOn: cb.checked ? new Date().toISOString().slice(0, 10) : undefined });
    $$(`#ppTable .pp-read[data-lib="${cb.dataset.lib}"]`).forEach(x => (x.checked = cb.checked));
  }));
}

function paperLI(x) {
  const l = libByUrl(x.url);
  const read = l && readRec(l.id).read;
  const box = l ? `<label class="pp-readwrap" title="In your reading list: tick when read"><input type="checkbox" class="pp-read" data-lib="${l.id}"${read ? " checked" : ""}><span class="sr-only">Mark as read</span></label>` : `<span class="pp-readwrap"></span>`;
  return `<li>${box}<span><a href="${x.url}" target="_blank" rel="noopener">${attr(x.title)}</a> <span class="muted">${x.year}</span>${l ? ` <span class="core pp-inlib">in your reading list</span>` : ""}</span></li>`;
}

function personPanel(p) {
  const sigUrls = new Set(p.papers.map(x => x.url));
  const more = (p.lib || []).map(libItem).filter(l => l && !sigUrls.has(l.url));
  const subs = (p.subs || []).filter(id => SF[id]);
  const moves = (p.moves || []).map(m => `<li>${m.what} <span class="cl-src">${m.url ? `<a href="${m.url}" target="_blank" rel="noopener">${fmtDate(m.date.slice(0, 7))} ↗</a>` : fmtDate(m.date.slice(0, 7))}</span></li>`).join("");
  const profiles = [
    ...p.oa.ids.map((id, i) => `<a href="https://openalex.org/authors/${id}" target="_blank" rel="noopener">OpenAlex${p.oa.ids.length > 1 ? ` ${i + 1}` : ""} ↗</a>`),
    `<a href="https://scholar.google.com/citations?view_op=search_authors&mauthors=${encodeURIComponent(p.name)}" target="_blank" rel="noopener">Google Scholar ↗</a>`,
    p.home ? `<a href="${p.home}" target="_blank" rel="noopener">Homepage ↗</a>` : "",
  ].filter(Boolean).join(" · ");
  return `<div class="dossier pp-panel">
    <div class="dos-sec">
      <div class="dt">Signature papers</div>
      <ul class="pp-papers">${p.papers.map(paperLI).join("")}</ul>
      ${more.length ? `<div class="dt" style="margin-top:12px">Also in your reading list</div>
        <ul class="pp-papers">${more.map(l => paperLI({ title: l.title, year: l.year, url: l.url })).join("")}</ul>` : ""}
      ${subs.length ? `<div class="dt" style="margin-top:12px">Subfields</div><div class="pills">${subs.map(id => `<a class="sfpill" href="#subfields/${id}">${lvlDot(level(id))}${SF[id].short}</a>`).join("")}</div>` : ""}
    </div>
    <div class="dos-sec">
      <div class="dt">Where they are now</div>
      <p class="pp-now">${p.nowLong || p.now}${p.nowSrc ? ` <span class="cl-src"><a href="${p.nowSrc.url}" target="_blank" rel="noopener">source, ${fmtDate(p.nowSrc.date.slice(0, 7))} ↗</a></span>` : ""}</p>
      ${moves ? `<ul class="dos-list">${moves}</ul>` : ""}
      <div class="dt" style="margin-top:12px">Citation record</div>
      <p class="pp-now">h-index ${p.oa.h} · ${fmtInt(p.oa.cites)} citations in OpenAlex. Most-cited: "${attr(p.oa.top.title)}" (${fmtInt(p.oa.top.cites)}).${p.oa.note ? ` <span class="pp-note">${p.oa.note}</span>` : ""}</p>
      <p class="pp-links">${profiles}</p>
    </div>
    <div class="dos-read"><div class="dt">Reading it</div><p>${p.lens}</p></div>
  </div>`;
}

function openPerson(id) {
  if (!PPL[id]) return;
  pstate.group = "all";
  pstate.q = "";
  $("#ppSearch").value = "";
  pstate.open = id;
  renderPeopleTable();
  const row = $(`#ppTable tr.mrow[data-id="${id}"]`);
  if (row) row.scrollIntoView({ block: "center" });
  $("#ppCurveSel").value = id;
  renderCurve(id);
}

// ============================================================
// CHART: THE H-INDEX, DRAWN (citations by paper rank, log-log)
// ============================================================
function renderCurve(id) {
  const p = PPL[id];
  const c = p.curve;
  const h = c.reduce((n, v, i) => (v >= i + 1 ? i + 1 : n), 0);
  const W = 860, H = 400, ML = 64, MR = 24, MT = 16, MB = 46;
  const iw = W - ML - MR, ih = H - MT - MB;
  const xMax = Math.max(c.length, 10), yMax = Math.max(c[0], 10);
  const top = Math.ceil(Math.log10(Math.max(xMax, yMax)));
  const lx = r => ML + Math.log10(r) / Math.log10(xMax) * iw;
  const ly = v => MT + ih - Math.log10(Math.max(v, 1)) / top * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Citations of each of ${attr(p.name)}'s papers, ranked from most to least cited, with the h-index marked">`;
  for (let e = 0; e <= top; e++) {
    s += `<line x1="${ML}" y1="${ly(10 ** e)}" x2="${ML + iw}" y2="${ly(10 ** e)}" stroke="${C.grid}"/>`;
    s += `<text x="${ML - 10}" y="${ly(10 ** e) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${fmtK(10 ** e)}</text>`;
  }
  for (const r of [1, 2, 5, 10, 20, 50, 100, 200, 500].filter(r => r <= xMax)) {
    s += `<line x1="${lx(r)}" y1="${MT}" x2="${lx(r)}" y2="${MT + ih}" stroke="${C.grid}"/>`;
    s += `<text x="${lx(r)}" y="${H - 28}" fill="${C.muted}" font-size="11" text-anchor="middle">${r}</text>`;
  }
  s += `<text x="${ML + iw / 2}" y="${H - 6}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">Paper rank, most cited first (log) →</text>`;
  s += `<text x="16" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 16 ${MT + ih / 2})">Citations (log) →</text>`;
  // the diagonal: citations = rank
  const dEnd = Math.min(xMax, 10 ** top);
  s += `<line x1="${lx(1)}" y1="${ly(1)}" x2="${lx(dEnd)}" y2="${ly(dEnd)}" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  s += `<text x="${lx(1.15)}" y="${ly(1.15) - 8}" fill="${C.muted}" font-size="11">citations = rank</text>`;
  // the h-square: h papers, each with at least h citations
  if (h) {
    s += `<rect x="${lx(1)}" y="${ly(Math.max(c[0], h))}" width="${lx(h) - lx(1)}" height="${ly(h) - ly(Math.max(c[0], h))}" fill="rgba(57,135,229,0.07)"/>`;
    s += `<line x1="${lx(h)}" y1="${MT}" x2="${lx(h)}" y2="${MT + ih}" stroke="#3987e5" stroke-width="1.5"/>`;
    s += `<line x1="${ML}" y1="${ly(h)}" x2="${ML + iw}" y2="${ly(h)}" stroke="#3987e5" stroke-width="1" stroke-opacity="0.5"/>`;
  }
  s += `<polyline points="${c.map((v, i) => `${lx(i + 1).toFixed(1)},${ly(v).toFixed(1)}`).join(" ")}" fill="none" stroke="#3987e5" stroke-width="2"/>`;
  if (h) {
    s += `<circle cx="${lx(h)}" cy="${ly(c[h - 1])}" r="5.5" fill="#3987e5" stroke="${C.surface}" stroke-width="2"/>`;
    const right = lx(h) < ML + iw * 0.62;
    s += labelSVG({ x: lx(h) + (right ? 10 : -10), y: MT + 16, a: right ? "start" : "end" }, `h = ${h}: ${h} papers with at least ${h} citations each`, C.ink);
  }
  s += `<rect class="pp-hover" x="${ML}" y="${MT}" width="${iw}" height="${ih}" fill="transparent"/>`;
  s += `</svg>`;
  $("#ppCurve").innerHTML = s;
  const note = c.length < p.oa.works && h === c.length ? ` Only the top ${c.length} papers are drawn.` : "";
  $("#ppCurveNote").textContent = `${p.name}: ${fmtInt(c[0])} citations for the top paper, ${c.length} papers drawn.${h !== p.oa.h ? ` OpenAlex reports h = ${p.oa.h}; this curve gives ${h} because it counts a slightly different set of works.` : ""}${note}`;
  const svg = $("#ppCurve svg"), hov = $("#ppCurve .pp-hover");
  hov.addEventListener("mousemove", e => {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
    const r = Math.min(c.length, Math.max(1, Math.round(10 ** ((loc.x - ML) / iw * Math.log10(xMax)))));
    const t = r <= p.oa.topWorks.length ? p.oa.topWorks[r - 1] : null;
    showTip(e, `<div class="t-name">Paper #${r}${t ? `: ${attr(t.title)}` : ""}</div><div class="t-row"><span>Citations</span><span class="v">${fmtInt(c[r - 1])}</span></div>` +
      `<div class="t-row"><span>${c[r - 1] >= r ? "Counts toward h" : "Below the line"}</span><span class="v">${c[r - 1] >= r ? "yes" : "no"}</span></div>`);
  });
  hov.addEventListener("mouseleave", hideTip);
}

// ============================================================
// CHART: BREADTH VS THE LANDMARK PAPER
// ============================================================
function renderLandmark() {
  const W = 860, H = 440, ML = 62, MR = 24, MT = 16, MB = 46;
  const iw = W - ML - MR, ih = H - MT - MB;
  const hMax = Math.ceil(Math.max(...PEOPLE.map(p => p.oa.h)) / 25) * 25;
  const ys = PEOPLE.map(p => p.oa.top.cites);
  const e0 = Math.floor(Math.log10(Math.min(...ys))), e1 = Math.ceil(Math.log10(Math.max(...ys)));
  const lx = h => ML + h / hMax * iw;
  const ly = v => MT + ih - (Math.log10(v) - e0) / (e1 - e0) * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Each researcher's h-index against the citations of their single most-cited paper">`;
  for (let h = 0; h <= hMax; h += 25) {
    s += `<line x1="${lx(h)}" y1="${MT}" x2="${lx(h)}" y2="${MT + ih}" stroke="${h ? C.grid : C.baseline}"/>`;
    s += `<text x="${lx(h)}" y="${H - 28}" fill="${C.muted}" font-size="11" text-anchor="middle">${h}</text>`;
  }
  for (let e = e0; e <= e1; e++) {
    s += `<line x1="${ML}" y1="${ly(10 ** e)}" x2="${ML + iw}" y2="${ly(10 ** e)}" stroke="${C.grid}"/>`;
    s += `<text x="${ML - 10}" y="${ly(10 ** e) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${fmtK(10 ** e)}</text>`;
  }
  s += `<text x="${ML + iw / 2}" y="${H - 6}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">h-index: breadth of a cited body of work →</text>`;
  s += `<text x="15" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 15 ${MT + ih / 2})">Citations of the single most-cited paper (log) →</text>`;
  s += `<text x="${ML + 10}" y="${MT + 14}" fill="${C.muted}" font-size="11.5">↖ one landmark, a short list</text>`;
  s += `<text x="${ML + iw - 8}" y="${MT + ih - 10}" fill="${C.muted}" font-size="11.5" text-anchor="end">a long, steadily cited record ↘</text>`;

  // Short surnames (He, Li, Le, Ng…) read badly alone, so those get full names.
  const short = p => { const s = p.name.split(" ").slice(-1)[0]; return s.length <= 3 ? p.name : s; };
  const items = PEOPLE.map(p => ({ id: p.id, x: lx(p.oa.h), y: ly(p.oa.top.cites), r: 7, text: short(p) }));
  dodge(items, 7);
  // Label the people the chart is about first; the rest take the room left.
  const rank = id => { const k = PEOPLE_LABEL_FIRST.indexOf(id); return k < 0 ? Infinity : k; };
  const order = items.map((it, i) => i).sort((a, b) => rank(items[a].id) - rank(items[b].id) || a - b);
  const placed = placeLabels(order.map(i => items[i]), { x0: ML, y0: MT, x1: ML + iw, y1: MT + ih });
  const labels = [];
  order.forEach((i, k) => { labels[i] = placed[k]; });
  PEOPLE.forEach((p, i) => {
    const l = labels[i], it = items[i];
    // A label pushed away from its point gets a leader line, so it can't be read as a neighbour's.
    if (l && Math.hypot(l.x - it.x, l.y - it.y) > 21) {
      const lx2 = l.a === "end" ? l.x - 2 : l.a === "start" ? l.x + 2 : l.x;
      s += `<line x1="${it.x}" y1="${it.y}" x2="${lx2}" y2="${l.y - 4}" stroke="${C.muted}" stroke-width="1" stroke-opacity="0.7"/>`;
    }
  });
  PEOPLE.forEach((p, i) => {
    s += groupMarker(p.group, items[i].x, items[i].y, 5.5, `class="pt" data-id="${p.id}" stroke="${C.surface}" stroke-width="2"`);
    s += labelSVG(labels[i], items[i].text);
  });
  s += `</svg>`;
  $("#ppLandmarkLegend").innerHTML = Object.keys(PEOPLE_GROUPS).map(g => `<span class="key">${groupSwatch(g)}${PEOPLE_GROUPS[g].name}</span>`).join("");
  $("#ppLandmark").innerHTML = s;
  $$("#ppLandmark .pt").forEach(el => {
    const p = PPL[el.dataset.id];
    el.addEventListener("mousemove", e => showTip(e, `<div class="t-name">${p.name}</div>` +
      `<div class="t-row"><span>h-index</span><span class="v">${p.oa.h}</span></div>` +
      `<div class="t-row"><span>Most-cited paper</span><span class="v">${fmtInt(p.oa.top.cites)}</span></div>` +
      `<div style="margin-top:3px">${attr(p.oa.top.title)}</div>`));
    el.addEventListener("mouseleave", hideTip);
    el.addEventListener("click", () => { location.hash = "#researchers/" + p.id; });
  });
}

// ---------------- entry point (called by the router) ----------------
let peopleBuilt = false;
function renderPeople() {
  if (peopleBuilt) return;
  peopleBuilt = true;
  $("#ppAsOf").textContent = "Citations as of " + new Date(PEOPLE_AS_OF + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  $("#ppIntro").innerHTML = PEOPLE_INTRO;
  renderPeopleFilters();
  renderPeopleTable();
  $("#ppCurveSel").innerHTML = PEOPLE.slice().sort((a, b) => b.oa.h - a.oa.h).map(p => `<option value="${p.id}">${p.name} (h = ${p.oa.h})</option>`).join("");
  $("#ppCurveSel").value = PEOPLE_CURVE_DEFAULT;
  $("#ppCurveSel").addEventListener("change", e => renderCurve(e.target.value));
  renderCurve(PEOPLE_CURVE_DEFAULT);
  renderLandmark();
  $("#ppLandmarkTake").innerHTML = PEOPLE_LANDMARK_TAKE;
  $("#ppTake").innerHTML = PEOPLE_TAKEAWAYS.map(t => `<li><b>${t.head}</b> ${t.body}</li>`).join("");
  $("#ppSources").innerHTML = PEOPLE_SOURCES;
}
