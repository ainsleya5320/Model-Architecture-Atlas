// MODEL ATLAS — Closed frontier tab: evidence ladder, model table with
// per-model evidence panels, price × speed, training-compute estimates with
// their error bars, the price ladder, the claims ledger, open siblings and
// estimation methods. Data lives in closed.js.
// Loads after app.js (uses $, $$, C, showTip, hideTip, fmtDate) and
// before field-app.js, whose router calls renderClosed() and openClosedModel().
"use strict";

const CLM = Object.fromEntries(CLOSED_MODELS.map(m => [m.id, m]));
const EV = Object.fromEntries(EVIDENCE.map(e => [e.id, e]));
const LABS = CLOSED_LABS;

const attr = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const blendOf = p => (p ? (3 * p.in + p.out) / 4 : null);
const blended = m => blendOf(m.price);            // at launch
const blendedNow = m => blendOf(m.now || m.price); // on the snapshot date
const fmtUsd = v => (v == null ? "—" : "$" + (Number.isInteger(v) ? v : v >= 10 ? v.toFixed(1) : v.toFixed(2)));
const fmtTokens = v => (v >= 1e6 ? +(v / 1e6).toFixed(2) + "M" : Math.round(v / 1000) + "k");
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const pow10 = e => "10" + String(e).split("").map(ch => SUP[ch]).join("");
function fmtFlop(v) {
  const e = Math.floor(Math.log10(v)), m = v / 10 ** e;
  return (Math.abs(m - 1) < 0.05 ? "" : (+m.toFixed(1)) + "×") + pow10(e);
}
const dateNum = s => { const [y, m, d] = s.split("-").map(Number); return y + (m - 1) / 12 + ((d || 15) - 1) / 365; };

// Epoch's confidence labels are 90% intervals of ±3×, ±10× and ±31×.
const CONF_FACTOR = { Confident: 3, Likely: 10, Speculative: 31 };
function computeRange(c) {
  if (c.lo && c.hi) return [c.lo, c.hi, c.rangeNote || "Epoch's stated interval"];
  const k = CONF_FACTOR[c.conf];
  return [c.flop / k, c.flop * k, `Epoch's "${c.conf}" label: 90% within ±${k}×`];
}

// ---------- shared marks ----------
function marker(shape, x, y, r, extra = "") {
  if (shape === "square") { const s = r * 0.88; return `<rect x="${x - s}" y="${y - s}" width="${2 * s}" height="${2 * s}" rx="1.5" ${extra}/>`; }
  if (shape === "diamond") { const s = r * 1.22; return `<path d="M${x} ${y - s}L${x + s} ${y}L${x} ${y + s}L${x - s} ${y}Z" ${extra}/>`; }
  if (shape === "triangle") return `<path d="M${x} ${y - r * 1.3}L${x + r * 1.2} ${y + r * 0.85}L${x - r * 1.2} ${y + r * 0.85}Z" ${extra}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" ${extra}/>`;
}
// Every chart mark carries class "pt" and its model id, for the tooltip.
const labMarker = (labId, id, x, y, r = 6) =>
  marker(LABS[labId].shape, x, y, r, `class="pt" data-id="${id}" fill="${LABS[labId].color}" stroke="${C.surface}" stroke-width="2"`);
const anchorMarker = (id, x, y) =>
  `<circle class="pt" data-id="${id}" cx="${x}" cy="${y}" r="5.5" fill="${C.surface}" stroke="${C.ink2}" stroke-width="2"/>`;

function swatch(labId) {
  return `<svg class="cl-sw" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">${marker(LABS[labId].shape, 8, 8, 5.2, `fill="${LABS[labId].color}"`)}</svg>`;
}
function labLegend(extra = "") {
  return Object.keys(LABS).map(id => `<span class="key">${swatch(id)}${LABS[id].name}</span>`).join("") + extra;
}
const anchorKey = label =>
  `<span class="key"><svg class="cl-sw" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="5" fill="none" stroke="${C.ink2}" stroke-width="2"/></svg>${label}</span>`;

// Nudge marks that would sit on top of each other (same price, same week)
// sideways so both stay visible.
function dodge(items, min = 8) {
  items.forEach((a, i) => {
    for (let j = 0; j < i; j++) {
      const b = items[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < min) a.x = b.x + min;
    }
  });
}

// Greedy label placement: try positions around each point in turn and keep the
// first one that stays inside the plot and clears every label already placed,
// every marker (labelled or not) and every obstacle (error bars). A label with
// no room is left off; the tooltip still names the point.
function placeLabels(items, box, obstacles = []) {
  const width = t => t.length * 6.2 + 4, H = 13;
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const marks = items.map(it => ({ x0: it.x - it.r - 1, y0: it.y - it.r - 1, x1: it.x + it.r + 1, y1: it.y + it.r + 1 }));
  const taken = [];
  const spots = [[10, 4, "start"], [-10, 4, "end"], [0, -12, "middle"], [0, 20, "middle"], [9, -9, "start"], [-9, -9, "end"],
    [9, 17, "start"], [-9, 17, "end"], [14, -19, "start"], [-14, -19, "end"], [14, 27, "start"], [-14, 27, "end"]];
  // Second pass lets a label cross an error bar (its halo keeps it legible)
  // rather than drop it; labels and markers are never overlapped.
  return items.map((it, i) => {
    if (!it.text) return null;
    const order = it.prefer != null ? [spots[it.prefer], ...spots] : spots;
    for (const soft of [false, true]) {
      for (const [dx, dy, a] of order) {
        const w = width(it.text), x = it.x + dx, y = it.y + dy;
        const x0 = a === "start" ? x : a === "end" ? x - w : x - w / 2;
        const r = { x0, y0: y - H + 3, x1: x0 + w, y1: y + 3 };
        if (r.x0 < box.x0 || r.x1 > box.x1 || r.y0 < box.y0 || r.y1 > box.y1) continue;
        if (taken.some(t => hit(t, r)) || marks.some((m, j) => j !== i && hit(m, r))) continue;
        if (!soft && obstacles.some(o => o.owner !== it.id && hit(o, r))) continue;
        taken.push(r);
        return { x, y, a };
      }
    }
    return null;
  });
}
const labelSVG = (p, text, fill = C.ink2) =>
  p ? `<text x="${p.x}" y="${p.y}" fill="${fill}" font-size="11.5" text-anchor="${p.a}" stroke="${C.surface}" stroke-width="3.5" stroke-linejoin="round" paint-order="stroke">${attr(text)}</text>` : "";

function bindTips(root, sel, html) {
  $$(sel, root).forEach(el => {
    el.addEventListener("mousemove", e => showTip(e, html(el.dataset.id)));
    el.addEventListener("mouseleave", hideTip);
  });
}

function closedTipHTML(id) {
  const m = CLM[id] || COMPUTE_ANCHORS.find(a => a.id === id) || SPEED_ANCHORS.find(a => a.id === id);
  if (!m) return "";
  const labName = LABS[m.lab] ? LABS[m.lab].name : m.labName;
  const rows = [];
  if (m.price) rows.push([m.now ? "Launch price in / out" : "List price in / out", `${fmtUsd(m.price.in)} / ${fmtUsd(m.price.out)}`]);
  if (m.now) rows.push(["Price now in / out", `${fmtUsd(m.now.in)} / ${fmtUsd(m.now.out)}`]);
  if (m.price) rows.push([m.now ? "Blended now (3:1)" : "Blended (3:1)", fmtUsd(blendedNow(m))]);
  if (m.speed) rows.push(["Output speed", `${Math.round(m.speed.tps)} tok/s`]);
  if (m.compute) {
    const [lo, hi] = computeRange(m.compute);
    rows.push(["Training compute", fmtFlop(m.compute.flop) + " FLOP"], ["90% range", `${fmtFlop(lo)} – ${fmtFlop(hi)}`]);
  }
  if (m.known) rows.push(["Known", m.known]);
  return `<div class="t-name">${attr(m.name)} <span style="color:${C.muted};font-weight:400">· ${attr(labName)}, ${fmtDate(m.released.slice(0, 7))}</span></div>` +
    rows.map(([k, v]) => `<div class="t-row"><span>${k}</span><span class="v">${v}</span></div>`).join("");
}

// ---------- evidence badges ----------
function evBadge(tierId, label) {
  const t = EV[tierId];
  return `<span class="ev ev-${t.rank}" title="${attr(t.name + " — " + t.short)}"><span class="ev-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${label || t.name}</span>`;
}
const STATUS = {
  confirmed: ["✓", "Confirmed"], corroborated: ["✓", "Corroborated"], unverified: ["·", "Unverified"],
  contested: ["!", "Contested"], superseded: ["↻", "Superseded"], retracted: ["✕", "Retracted"],
};
const statusChip = s => `<span class="st st-${s}"><span aria-hidden="true">${STATUS[s][0]}</span> ${STATUS[s][1]}</span>`;
const claimsFor = id => CLOSED_CLAIMS.filter(c => c.model === id);
const claimLabs = c => c.labs || [c.lab || (CLM[c.model] ? CLM[c.model].lab : null)];
const sizeClaims = id => claimsFor(id).filter(c => c.size && c.status !== "retracted" && c.status !== "superseded");
// The table shows one size claim per model: the strongest rung, except that
// a claim others have corroborated outranks a contested estimate (GPT-4's
// leaked 1.8T over a disputed knowledge-probe reading). Ties go to the newest.
const claimScore = c => EV[c.tier].rank + (c.status === "corroborated" || c.status === "confirmed" ? 2 : 0) - (c.status === "contested" ? 0.5 : 0);
function bestSize(id) {
  const cs = sizeClaims(id);
  if (!cs.length) return null;
  return cs.slice().sort((a, b) => claimScore(b) - claimScore(a) || (b.date > a.date ? 1 : -1))[0];
}

// ============================================================
// EVIDENCE LADDER
// ============================================================
function renderLadder() {
  $("#clAsOf").textContent = "Data as of " + new Date(CLOSED_AS_OF + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  $("#clLadder").innerHTML = EVIDENCE.map(e => `
    <div class="rung">
      <div class="rung-h">${evBadge(e.id)}</div>
      <p class="rung-def">${e.def}</p>
      <dl class="rung-dl">
        <dt>Examples</dt><dd>${e.examples}</dd>
        <dt>Trust it for</dt><dd>${e.trust}</dd>
        <dt>Not for</dt><dd>${e.notFor}</dd>
      </dl>
    </div>`).join("");
}

// ============================================================
// MODEL TABLE + EVIDENCE PANELS
// ============================================================
const cstate = { lab: "all", current: false, sortKey: "released", sortDir: -1, open: null };

const CCOLS = [
  { key: "name", label: "Model", get: m => m.name, text: true },
  { key: "released", label: "Released", get: m => m.released, text: true },
  { key: "price", label: "List $/M in · out", ev: "disclosed", get: m => m.price ? m.price.in : null },
  { key: "blend", label: "Blended", ev: "disclosed", get: m => blended(m) },
  { key: "ctx", label: "Context", ev: "disclosed", get: m => m.ctx || null },
  { key: "speed", label: "Speed", ev: "measured", get: m => m.speed ? m.speed.tps : null },
  { key: "compute", label: "Training compute", ev: "estimated", get: m => m.compute ? m.compute.flop : null },
  { key: "size", label: "Size claims", get: m => { const b = bestSize(m.id); return b ? EV[b.tier].rank : null; } },
];

function renderClosedFilters() {
  $("#clLabs").innerHTML = `<button type="button" class="fbtn" data-lab="all">All labs</button>` +
    Object.entries(LABS).map(([id, l]) => `<button type="button" class="fbtn" data-lab="${id}">${swatch(id)}${l.name}</button>`).join("");
  $$("#clLabs .fbtn").forEach(b => b.addEventListener("click", () => { cstate.lab = b.dataset.lab; renderClosedTable(); }));
  $("#clCurrent").addEventListener("change", e => { cstate.current = e.target.checked; renderClosedTable(); });
}

function sizeCell(m) {
  const b = bestSize(m.id);
  if (!b) return `<span class="muted">none public</span>`;
  const more = sizeClaims(m.id).length - 1;
  const flag = b.status === "contested" ? ` <span class="st st-contested" title="Contested: the method is disputed"><span aria-hidden="true">!</span><span class="sr-only">contested</span></span>` : "";
  return `<span class="cl-size" title="${attr(b.text.replace(/<[^>]+>/g, ""))}">${b.size}</span>${evBadge(b.tier)}${flag}${more > 0 ? `<span class="muted cl-more">+${more} more</span>` : ""}`;
}

function computeCell(m) {
  if (!m.compute) return `<span class="muted">—</span>`;
  const [lo, hi] = computeRange(m.compute);
  return `<span title="90% range ${fmtFlop(lo)} – ${fmtFlop(hi)} FLOP">${fmtFlop(m.compute.flop)}<span class="cl-sub">Epoch: ${m.compute.conf}</span></span>`;
}

function renderClosedTable() {
  $$("#clLabs .fbtn").forEach(b => b.classList.toggle("on", b.dataset.lab === cstate.lab));
  const head = CCOLS.map(c => {
    const arrow = cstate.sortKey === c.key ? `<span class="arrow">${cstate.sortDir > 0 ? "▲" : "▼"}</span>` : "";
    const tier = c.ev ? `<span class="ev-mini ev-${EV[c.ev].rank}" title="${EV[c.ev].name}"><span class="ev-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span></span>` : "";
    return `<th data-key="${c.key}" aria-sort="${cstate.sortKey === c.key ? (cstate.sortDir > 0 ? "ascending" : "descending") : "none"}">${tier}${c.label} ${arrow}</th>`;
  }).join("");

  const col = CCOLS.find(c => c.key === cstate.sortKey);
  const rows = CLOSED_MODELS
    .filter(m => (cstate.lab === "all" || m.lab === cstate.lab) && (!cstate.current || m.status === "current"))
    .sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (col.text ? String(va).localeCompare(String(vb)) : va - vb) * cstate.sortDir;
    });

  const body = rows.map(m => {
    const L = LABS[m.lab];
    const open = cstate.open === m.id;
    let html = `<tr class="mrow${open ? " is-open" : ""}" data-id="${m.id}" tabindex="0" aria-expanded="${open}">
      <td class="name">${swatch(m.lab)} ${m.name}<span class="lab">${L.name} · ${TIER_NAMES[m.tier]}${m.status === "current" ? "" : ` · ${m.status}`}</span></td>
      <td>${fmtDate(m.released.slice(0, 7))}</td>
      <td>${m.price ? `${fmtUsd(m.price.in)} · ${fmtUsd(m.price.out)}` : `<span class="muted">—</span>`}</td>
      <td>${fmtUsd(blended(m))}</td>
      <td>${m.ctx ? fmtTokens(m.ctx) : `<span class="muted">—</span>`}</td>
      <td>${m.speed ? `${Math.round(m.speed.tps)} <span class="cl-unit">tok/s</span>` : `<span class="muted">—</span>`}</td>
      <td>${computeCell(m)}</td>
      <td class="cl-sizecell">${sizeCell(m)}</td>
    </tr>`;
    if (open) html += `<tr class="detail"><td colspan="${CCOLS.length}">${dossierHTML(m)}</td></tr>`;
    return html;
  }).join("");

  $("#clTable").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  $("#clCount").textContent = `${rows.length} of ${CLOSED_MODELS.length} models · click a row for its evidence`;

  $$("#clTable th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.key, c = CCOLS.find(x => x.key === k);
    if (cstate.sortKey === k) cstate.sortDir *= -1;
    else { cstate.sortKey = k; cstate.sortDir = c.text && k !== "released" ? 1 : -1; }
    renderClosedTable();
  }));
  $$("#clTable tr.mrow").forEach(tr => {
    const toggle = () => { cstate.open = cstate.open === tr.dataset.id ? null : tr.dataset.id; renderClosedTable(); };
    tr.addEventListener("click", e => { if (!e.target.closest("a")) toggle(); });
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
  });
}

function claimLI(c) {
  return `<li>${c.text}${c.status !== "unverified" ? " " + statusChip(c.status) : ""}
    <span class="cl-src">${c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${c.source} ↗</a>` : c.source}${c.date ? `, ${fmtDate(c.date.slice(0, 7))}` : ""}</span></li>`;
}

function dossierHTML(m) {
  const cs = claimsFor(m.id);
  const by = tier => cs.filter(c => c.tier === tier);
  const asOf = new Date(CLOSED_AS_OF + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const disclosed = [
    m.price ? `${m.now ? "Launch" : "List"} price ${fmtUsd(m.price.in)} in / ${fmtUsd(m.price.out)} out per million tokens${m.priceNote ? ` (${m.priceNote})` : ""}${m.now ? `; ${fmtUsd(m.now.in)} / ${fmtUsd(m.now.out)} on ${asOf}` : ""}.` : `No public per-token API price${m.priceNote ? ` (${m.priceNote})` : ""}.`,
    m.ctx ? `Context window ${fmtTokens(m.ctx)} tokens.` : "",
    m.position || "",
  ].filter(Boolean).map(t => `<li>${t}</li>`).join("") + by("disclosed").map(claimLI).join("");
  const measured = (m.speed
    ? `<li>${Math.round(m.speed.tps)} output tokens per second at the "${m.speed.effort}" reasoning setting <span class="cl-src"><a href="https://artificialanalysis.ai/" target="_blank" rel="noopener">Artificial Analysis ↗</a>, ${fmtDate(CLOSED_AS_OF.slice(0, 7))}</span></li>`
    : `<li class="muted">No speed reading in the October 2026 snapshot, which covers only some of the models then being served.</li>`) + by("measured").map(claimLI).join("");
  let estimated = by("estimated").map(claimLI).join("");
  if (m.compute) {
    const [lo, hi, how] = computeRange(m.compute);
    estimated = `<li>Training compute ≈ ${fmtFlop(m.compute.flop)} FLOP, 90% range ${fmtFlop(lo)}–${fmtFlop(hi)} (${how}). ${m.compute.basis}
      <span class="cl-src"><a href="https://epoch.ai/data/ai-models" target="_blank" rel="noopener">Epoch AI ↗</a></span></li>` + estimated;
  }
  const rumored = by("rumored").map(claimLI).join("");
  const sec = (tier, body, empty) => `<div class="dos-sec">
      <div class="dos-h">${evBadge(tier)}</div>
      <ul class="dos-list">${body || `<li class="muted">${empty}</li>`}</ul>
    </div>`;
  return `<div class="dossier">
      ${sec("disclosed", disclosed, "")}
      ${sec("measured", measured, "")}
      ${sec("estimated", estimated, "No method-based estimate published.")}
      ${sec("rumored", rumored, "Nothing circulating with a named source.")}
      <div class="dos-read"><div class="dt">Reading it</div><p>${m.read}</p></div>
    </div>`;
}

function openClosedModel(id) {
  if (!CLM[id]) return;
  cstate.lab = "all";
  cstate.current = false;
  $("#clCurrent").checked = false;
  cstate.open = id;
  renderClosedTable();
  const row = $(`#clTable tr.mrow[data-id="${id}"]`);
  if (row) row.scrollIntoView({ block: "center" });
}

// ============================================================
// CHART A — PRICE × SPEED (current lineup)
// ============================================================
function renderSpeedChart() {
  // Speeds were measured on the snapshot date, so prices are that day's too.
  const pts = CLOSED_MODELS.filter(m => m.speed && m.price).map(m => ({ m, x: blendedNow(m), y: m.speed.tps, anchor: false }))
    .concat(SPEED_ANCHORS.map(a => ({ m: a, x: blendedNow(a), y: a.speed.tps, anchor: true })));
  const W = 860, H = 430, ML = 58, MR = 24, MT = 22, MB = 48;
  const iw = W - ML - MR, ih = H - MT - MB;
  const xs = pts.map(p => p.x), lo = Math.min(...xs) / 1.5, hi = Math.max(...xs) * 1.6;
  const lx = v => ML + (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * iw;
  const yMax = Math.ceil(Math.max(...pts.map(p => p.y)) / 50) * 50;
  const ly = v => MT + ih - v / yMax * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Scatter of list price against measured output speed for current closed models">`;
  for (const t of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].filter(t => t >= lo && t <= hi)) {
    s += `<line x1="${lx(t)}" y1="${MT}" x2="${lx(t)}" y2="${MT + ih}" stroke="${C.grid}"/>`;
    s += `<text x="${lx(t)}" y="${H - 28}" fill="${C.muted}" font-size="11" text-anchor="middle" font-variant="tabular-nums">${fmtUsd(t)}</text>`;
  }
  for (let t = 0; t <= yMax; t += 50) {
    s += `<line x1="${ML}" y1="${ly(t)}" x2="${ML + iw}" y2="${ly(t)}" stroke="${t ? C.grid : C.baseline}"/>`;
    s += `<text x="${ML - 10}" y="${ly(t) + 4}" fill="${C.muted}" font-size="11" text-anchor="end" font-variant="tabular-nums">${t}</text>`;
  }
  s += `<text x="${ML + iw / 2}" y="${H - 6}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">Blended list price, $ per million tokens (log) →</text>`;
  s += `<text x="15" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 15 ${MT + ih / 2})">Output tokens per second →</text>`;
  s += `<text x="${ML + 8}" y="${MT + 14}" fill="${C.muted}" font-size="11.5">↖ cheap and fast: small or very sparse</text>`;
  s += `<text x="${ML + iw - 8}" y="${MT + ih - 10}" fill="${C.muted}" font-size="11.5" text-anchor="end">pricey and slow: the largest served ↘</text>`;

  const items = pts.map(p => ({ id: p.m.id, x: lx(p.x), y: ly(p.y), r: 7, text: p.m.short, prefer: p.m.lblPos }));
  dodge(items);
  const labels = placeLabels(items, { x0: ML, y0: MT, x1: ML + iw, y1: MT + ih });
  pts.forEach((p, i) => {
    const { x, y } = items[i];
    s += p.anchor ? anchorMarker(p.m.id, x, y) : labMarker(p.m.lab, p.m.id, x, y);
    s += labelSVG(labels[i], p.m.short, p.anchor ? C.muted : C.ink2);
  });
  s += `</svg>`;
  $("#clSpeedLegend").innerHTML = labLegend(anchorKey("open-weight reference (size known)"));
  $("#clSpeed").innerHTML = s;
  bindTips($("#clSpeed"), ".pt", closedTipHTML);
}

// ============================================================
// CHART B — TRAINING COMPUTE, WITH ERROR BARS
// ============================================================
function renderComputeChart() {
  const closed = CLOSED_MODELS.filter(m => m.compute).map(m => {
    const [lo, hi] = computeRange(m.compute);
    return { m, t: dateNum(m.released), v: m.compute.flop, lo, hi, anchor: false };
  });
  const anchors = COMPUTE_ANCHORS.map(a => ({ m: a, t: dateNum(a.released), v: a.flop, lo: a.flop, hi: a.flop, anchor: true }));
  const all = closed.concat(anchors);
  const W = 860, H = 470, ML = 60, MR = 24, MT = 16, MB = 46;
  const iw = W - ML - MR, ih = H - MT - MB;
  const t0 = Math.floor(Math.min(...all.map(p => p.t))), t1 = Math.max(...all.map(p => p.t)) + 0.35;
  // Axis spans the point estimates plus a decade either side; wider
  // (speculative) ranges run off the edge and end in an arrow.
  const e0 = Math.floor(Math.log10(Math.min(...all.map(p => p.v)))) - 1;
  const e1 = Math.ceil(Math.log10(Math.max(...all.map(p => p.v)))) + 1;
  const lx = t => ML + (t - t0) / (t1 - t0) * iw;
  const ly = v => MT + ih - (Math.log10(Math.min(Math.max(v, 10 ** e0), 10 ** e1)) - e0) / (e1 - e0) * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Estimated training compute of closed models with 90 percent ranges, against open-weight models whose compute is known">`;
  for (let y = Math.ceil(t0); y <= Math.floor(t1); y++) {
    s += `<line x1="${lx(y)}" y1="${MT}" x2="${lx(y)}" y2="${MT + ih}" stroke="${C.grid}"/>`;
    s += `<text x="${lx(y)}" y="${H - 26}" fill="${C.muted}" font-size="11" text-anchor="middle">${y}</text>`;
  }
  for (let e = e0; e <= e1; e++) {
    s += `<line x1="${ML}" y1="${ly(10 ** e)}" x2="${ML + iw}" y2="${ly(10 ** e)}" stroke="${C.grid}"/>`;
    s += `<text x="${ML - 10}" y="${ly(10 ** e) + 4}" fill="${C.muted}" font-size="11.5" text-anchor="end">${pow10(e)}</text>`;
  }
  s += `<text x="${ML + iw / 2}" y="${H - 4}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">Release date →</text>`;
  s += `<text x="15" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 15 ${MT + ih / 2})">Training compute, FLOP (log) →</text>`;

  // Positions first (closed models lead `all`), so a dodged mark keeps its bar.
  const items = all.map(p => ({ id: p.m.id, x: lx(p.t), y: ly(p.v), r: 7, text: p.m.short, prefer: p.m.lblPos }));
  dodge(items);
  const obstacles = [];
  const end = (x, y, col, clipped, up) => clipped
    ? `<path d="M${x - 5} ${y + (up ? 7 : -7)}L${x} ${y}L${x + 5} ${y + (up ? 7 : -7)}" fill="none" stroke="${col}" stroke-opacity="0.7" stroke-width="2"/>`
    : `<line x1="${x - 5}" y1="${y}" x2="${x + 5}" y2="${y}" stroke="${col}" stroke-opacity="0.6" stroke-width="2"/>`;
  closed.forEach((p, i) => {
    const x = items[i].x, y0 = ly(p.hi), y1 = ly(p.lo), col = LABS[p.m.lab].color;
    const dash = p.m.compute.conf === "Speculative" ? ` stroke-dasharray="4 3"` : "";
    s += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}" stroke="${col}" stroke-opacity="0.6" stroke-width="2"${dash}/>`;
    s += end(x, y0, col, p.hi > 10 ** e1, true) + end(x, y1, col, p.lo < 10 ** e0, false);
    obstacles.push({ owner: p.m.id, x0: x - 5, x1: x + 5, y0, y1 });
  });
  const labels = placeLabels(items, { x0: ML, y0: MT, x1: ML + iw, y1: MT + ih }, obstacles);
  all.forEach((p, i) => {
    const { x, y } = items[i];
    s += p.anchor ? anchorMarker(p.m.id, x, y) : labMarker(p.m.lab, p.m.id, x, y);
    s += labelSVG(labels[i], p.m.short, p.anchor ? C.muted : C.ink2);
  });
  s += `</svg>`;
  $("#clComputeLegend").innerHTML = labLegend(anchorKey("open-weight model, compute known") +
    `<span class="key"><svg class="cl-sw" viewBox="0 0 26 14" width="26" height="14" aria-hidden="true"><line x1="2" y1="7" x2="24" y2="7" stroke="${C.ink2}" stroke-width="2"/></svg>90% range, Confident or Likely</span>` +
    `<span class="key"><svg class="cl-sw" viewBox="0 0 26 14" width="26" height="14" aria-hidden="true"><line x1="2" y1="7" x2="24" y2="7" stroke="${C.ink2}" stroke-width="2" stroke-dasharray="4 3"/></svg>Speculative</span>`);
  $("#clCompute").innerHTML = s;
  bindTips($("#clCompute"), ".pt", closedTipHTML);
}

// ============================================================
// CHART C — THE PRICE LADDER
// ============================================================
function renderLadderChart() {
  const pts = CLOSED_MODELS.filter(m => m.price).map(m => ({ m, t: dateNum(m.released), v: blended(m) }));
  const W = 860, H = 420, ML = 62, MR = 24, MT = 16, MB = 46;
  const iw = W - ML - MR, ih = H - MT - MB;
  const t0 = Math.floor(Math.min(...pts.map(p => p.t))), t1 = Math.max(...pts.map(p => p.t)) + 0.3;
  const vs = pts.map(p => p.v), lo = Math.min(...vs) / 1.6, hi = Math.max(...vs) * 1.5;
  const lx = t => ML + (t - t0) / (t1 - t0) * iw;
  const ly = v => MT + ih - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)) * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Blended list price of closed models at launch, by release date">`;
  for (let y = Math.ceil(t0); y <= Math.floor(t1); y++) {
    s += `<line x1="${lx(y)}" y1="${MT}" x2="${lx(y)}" y2="${MT + ih}" stroke="${C.grid}"/>`;
    s += `<text x="${lx(y)}" y="${H - 26}" fill="${C.muted}" font-size="11" text-anchor="middle">${y}</text>`;
  }
  for (const t of [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100].filter(t => t >= lo && t <= hi)) {
    s += `<line x1="${ML}" y1="${ly(t)}" x2="${ML + iw}" y2="${ly(t)}" stroke="${C.grid}"/>`;
    s += `<text x="${ML - 10}" y="${ly(t) + 4}" fill="${C.muted}" font-size="11" text-anchor="end" font-variant="tabular-nums">${fmtUsd(t)}</text>`;
  }
  s += `<text x="${ML + iw / 2}" y="${H - 4}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">Release date →</text>`;
  s += `<text x="15" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 15 ${MT + ih / 2})">Blended price at launch, $/M tokens (log) →</text>`;

  // Thin connector per lab through its top-tier launches: the ceiling.
  for (const lab of Object.keys(LABS)) {
    const top = pts.filter(p => p.m.lab === lab && p.m.tier === "top").sort((a, b) => a.t - b.t);
    if (top.length > 1) s += `<polyline points="${top.map(p => `${lx(p.t)},${ly(p.v)}`).join(" ")}" fill="none" stroke="${LABS[lab].color}" stroke-opacity="0.45" stroke-width="1.5"/>`;
  }
  const items = pts.map(p => ({ id: p.m.id, x: lx(p.t), y: ly(p.v), r: 7, text: p.m.ladder ? p.m.short : "", prefer: p.m.lblPos }));
  dodge(items);
  const labels = placeLabels(items, { x0: ML, y0: MT, x1: ML + iw, y1: MT + ih });
  pts.forEach((p, i) => {
    s += labMarker(p.m.lab, p.m.id, items[i].x, items[i].y, p.m.tier === "top" ? 6 : 4.5);
    s += labelSVG(labels[i], p.m.short);
  });
  s += `</svg>`;
  $("#clLadderLegend").innerHTML = labLegend(`<span class="key muted">large marks and lines: each lab's top tier · small marks: mid and small tiers</span>`);
  $("#clLadderChart").innerHTML = s;
  bindTips($("#clLadderChart"), ".pt", closedTipHTML);
}

// ============================================================
// LEDGER, SIBLINGS, METHODS, TAKEAWAYS
// ============================================================
const lstate = { lab: "all", tier: "all" };

function renderLedgerFilters() {
  $("#clLedgerFilters").innerHTML =
    `<span class="cl-labs"><button type="button" class="fbtn" data-llab="all">All labs</button>` +
    Object.entries(LABS).map(([id, l]) => `<button type="button" class="fbtn" data-llab="${id}">${swatch(id)}${l.name}</button>`).join("") + `</span>` +
    `<span class="cl-labs"><button type="button" class="fbtn" data-ltier="all">All evidence</button>` +
    EVIDENCE.map(e => `<button type="button" class="fbtn" data-ltier="${e.id}">${e.name}</button>`).join("") + `</span>` +
    `<span class="count" id="clLedgerCount"></span>`;
  $$("#clLedgerFilters [data-llab]").forEach(b => b.addEventListener("click", () => { lstate.lab = b.dataset.llab; renderLedger(); }));
  $$("#clLedgerFilters [data-ltier]").forEach(b => b.addEventListener("click", () => { lstate.tier = b.dataset.ltier; renderLedger(); }));
}

function renderLedger() {
  $$("#clLedgerFilters [data-llab]").forEach(b => b.classList.toggle("on", b.dataset.llab === lstate.lab));
  $$("#clLedgerFilters [data-ltier]").forEach(b => b.classList.toggle("on", b.dataset.ltier === lstate.tier));
  const all = CLOSED_CLAIMS.filter(c => c.ledger !== false);
  const rows = all
    .filter(c => (lstate.lab === "all" || claimLabs(c).includes(lstate.lab)) && (lstate.tier === "all" || c.tier === lstate.tier))
    .sort((a, b) => a.date.localeCompare(b.date));
  $("#clLedgerCount").textContent = `${rows.length} of ${all.length} claims`;
  $("#clLedger").innerHTML = `<thead><tr><th>Date</th><th>Model</th><th>Claim</th><th>Evidence</th><th>Source</th><th>Status</th></tr></thead><tbody>` +
    rows.map(c => {
      const m = CLM[c.model];
      const model = m ? `<a href="#closed/${m.id}">${m.name}</a>` : c.modelName;
      return `<tr><td>${fmtDate(c.date.slice(0, 7))}</td><td class="name">${model}</td><td>${c.text}</td><td>${evBadge(c.tier)}</td>
        <td>${c.url ? `<a href="${c.url}" target="_blank" rel="noopener">${c.source} ↗</a>` : c.source}</td><td>${statusChip(c.status)}</td></tr>`;
    }).join("") + `</tbody>`;
}

function renderSiblings() {
  $("#clSiblings").innerHTML = OPEN_SIBLINGS.map(s => `
    <div class="sib">
      <div class="sib-h">${swatch(s.lab)}<b>${LABS[s.lab].name}</b><span class="muted">${s.models}</span></div>
      <p>${s.what}</p>
      <p class="sib-reveal"><b>What it gives away:</b> ${s.reveals}</p>
    </div>`).join("");
}

function renderMethods() {
  $("#clMethods").innerHTML = METHODS.map(m => `
    <div class="method">
      <div class="method-h"><b>${m.name}</b>${evBadge(m.tier)}</div>
      <p>${m.how}</p>
      <p class="method-catch"><b>The catch:</b> ${m.catch}</p>
      ${m.example ? `<p class="muted method-ex">${m.example}</p>` : ""}
    </div>`).join("");
}

function renderTakeaways() {
  $("#clSpeedTake").innerHTML = CHART_TAKES.speed;
  $("#clComputeTake").innerHTML = CHART_TAKES.compute;
  $("#clLadderTake").innerHTML = CHART_TAKES.ladder;
  $("#clTakeaways").innerHTML = TAKEAWAYS.map(t => `<li><b>${t.head}</b> ${t.body}</li>`).join("");
  $("#clSources").innerHTML = CLOSED_SOURCES;
}

// ---------------- entry point (called by the router) ----------------
let closedBuilt = false;
function renderClosed() {
  if (closedBuilt) return;
  closedBuilt = true;
  renderLadder();
  renderClosedFilters();
  renderClosedTable();
  renderSpeedChart();
  renderComputeChart();
  renderLadderChart();
  renderLedgerFilters();
  renderLedger();
  renderSiblings();
  renderMethods();
  renderTakeaways();
}
