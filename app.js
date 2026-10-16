// MODEL ATLAS — app logic. Plain JS + hand-built SVG charts.
"use strict";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const C = {
  dense: "#3987e5", moe: "#d95926",
  ink: "#ffffff", ink2: "#c3c2b7", muted: "#898781",
  grid: "#2c2c2a", baseline: "#383835", surface: "#1a1a19",
};
const typeColor = m => (m.type === "moe" ? C.moe : C.dense);
const typeLabel = m => (m.type === "moe" ? "MoE" : "Dense");
const fmtB = v => (v >= 1000 ? (v / 1000).toFixed(2) + "T" : (v % 1 ? v.toFixed(1) : v) + "B");
const fmtCtx = v => (v >= 1000000 ? (v / 1000000) + "M" : v >= 1024 ? Math.round(v / 1024) + "k" : v);
const monthNum = s => { const [y, m] = s.split("-").map(Number); return y + (m - 1) / 12; };
const fmtDate = s => {
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const [y, m] = s.split("-").map(Number);
  return names[m - 1] + " '" + String(y).slice(2);
};

// Tabs are hash-routed links; the router lives in field-app.js.

// ---------------- tooltip ----------------
const tip = document.createElement("div");
tip.className = "tooltip";
document.body.appendChild(tip);
function showTip(evt, html) {
  tip.innerHTML = html;
  tip.style.display = "block";
  const pad = 14;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const r = tip.getBoundingClientRect();
  if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
  tip.style.left = x + "px"; tip.style.top = y + "px";
}
function hideTip() { tip.style.display = "none"; }

function modelTipHTML(m) {
  const rows = [
    ["Type", typeLabel(m) + (m.experts ? ` (${m.experts.total} experts, top-${m.experts.perTok})` : "")],
    ["Total params", fmtB(m.totalB)],
    ["Active / token", fmtB(m.activeB)],
    ["Active share", sparsityPct(m).toFixed(1) + "%"],
    ["Compute / token", "~" + Math.round(computePerToken(m)) + " GFLOPs"],
    ["VRAM floor (8-bit)", "~" + Math.round(vramFloorGB(m)) + " GB"],
  ];
  return `<div class="t-name">${m.name} <span style="color:${C.muted};font-weight:400">· ${m.lab}, ${fmtDate(m.released)}</span></div>` +
    rows.map(([k, v]) => `<div class="t-row"><span>${k}</span><span class="v">${v}</span></div>`).join("");
}

// ============================================================
// SCATTER: total vs active params (log-log)
// ============================================================
function renderScatter() {
  const W = 860, H = 460, ML = 64, MR = 30, MT = 18, MB = 46;
  const iw = W - ML - MR, ih = H - MT - MB;
  const lx = v => ML + (Math.log10(v) - 0) / (Math.log10(1200) - 0) * iw;
  const ly = v => MT + ih - (Math.log10(v) - 0) / (Math.log10(1200) - 0) * ih;

  const ticks = [1, 3, 10, 30, 100, 300, 1000];
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Scatter plot of total versus active parameters">`;

  for (const t of ticks) {
    s += `<line x1="${lx(t)}" y1="${MT}" x2="${lx(t)}" y2="${MT + ih}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<line x1="${ML}" y1="${ly(t)}" x2="${ML + iw}" y2="${ly(t)}" stroke="${C.grid}" stroke-width="1"/>`;
    s += `<text x="${lx(t)}" y="${H - 24}" fill="${C.muted}" font-size="11" text-anchor="middle">${t >= 1000 ? "1T" : t + "B"}</text>`;
    s += `<text x="${ML - 10}" y="${ly(t) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${t >= 1000 ? "1T" : t + "B"}</text>`;
  }
  // dense frontier: active = total
  s += `<line x1="${lx(1)}" y1="${ly(1)}" x2="${lx(1100)}" y2="${ly(1100)}" stroke="${C.baseline}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  s += `<text x="${lx(150)}" y="${ly(150) - 10}" fill="${C.muted}" font-size="11.5" transform="rotate(-38 ${lx(150)} ${ly(150) - 10})">dense line: every parameter active</text>`;
  // axis titles
  s += `<text x="${ML + iw / 2}" y="${H - 4}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">Total parameters (memory cost) →</text>`;
  s += `<text x="16" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 16 ${MT + ih / 2})">Active per token (compute cost) →</text>`;

  const labeled = new Set(["gpt3", "llama31-405b", "deepseek-v3", "kimi-k2", "gpt-oss-120b", "mixtral", "qwen3-next", "gpt2", "llama4-maverick"]);
  const labelShift = { "gpt2": [10, 4], "gpt3": [10, 4], "mixtral": [10, 4], "llama31-405b": [-10, -10], "deepseek-v3": [10, 14], "kimi-k2": [-10, -10], "gpt-oss-120b": [10, 4], "qwen3-next": [10, 10], "llama4-maverick": [10, 14] };
  for (const m of MODELS) {
    const x = lx(m.totalB), y = ly(m.activeB);
    s += `<circle class="pt" data-id="${m.id}" cx="${x}" cy="${y}" r="6" fill="${typeColor(m)}" stroke="${C.surface}" stroke-width="2"/>`;
    if (labeled.has(m.id)) {
      const [dx, dy] = labelShift[m.id] || [10, 4];
      const anchor = dx < 0 ? "end" : "start";
      s += `<text x="${x + dx}" y="${y + dy}" fill="${C.ink2}" font-size="11.5" text-anchor="${anchor}">${m.name}</text>`;
    }
  }
  s += `</svg>`;
  const wrap = $("#scatter");
  wrap.innerHTML = s;
  $$(".pt", wrap).forEach(c => {
    const m = MODELS.find(x => x.id === c.dataset.id);
    c.addEventListener("mousemove", e => showTip(e, modelTipHTML(m)));
    c.addEventListener("mouseleave", hideTip);
  });
}

// ============================================================
// SPARSITY OVER TIME
// ============================================================
function renderSparsity() {
  const W = 860, H = 380, ML = 56, MR = 30, MT = 16, MB = 46;
  const iw = W - ML - MR, ih = H - MT - MB;
  const x0 = 2019, x1 = 2026.4;
  const lx = v => ML + (v - x0) / (x1 - x0) * iw;
  const yTicks = [3, 5, 10, 25, 50, 100];
  const ly = v => MT + ih - (Math.log10(v) - Math.log10(2.5)) / (Math.log10(110) - Math.log10(2.5)) * ih;

  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="Share of parameters active per token, by release date">`;
  for (let yr = 2019; yr <= 2026; yr++) {
    s += `<line x1="${lx(yr)}" y1="${MT}" x2="${lx(yr)}" y2="${MT + ih}" stroke="${C.grid}"/>`;
    s += `<text x="${lx(yr)}" y="${H - 24}" fill="${C.muted}" font-size="11" text-anchor="middle">${yr}</text>`;
  }
  for (const t of yTicks) {
    s += `<line x1="${ML}" y1="${ly(t)}" x2="${ML + iw}" y2="${ly(t)}" stroke="${C.grid}"/>`;
    s += `<text x="${ML - 10}" y="${ly(t) + 4}" fill="${C.muted}" font-size="11" text-anchor="end">${t}%</text>`;
  }
  s += `<text x="${ML + iw / 2}" y="${H - 4}" fill="${C.ink2}" font-size="12.5" text-anchor="middle">Release date →</text>`;
  s += `<text x="14" y="${MT + ih / 2}" fill="${C.ink2}" font-size="12.5" text-anchor="middle" transform="rotate(-90 14 ${MT + ih / 2})">% of parameters used per token (log)</text>`;

  const labeled = new Set(["mixtral", "deepseek-v3", "llama4-maverick", "gpt-oss-120b", "qwen3-next", "kimi-k2"]);
  const shift = { "mixtral": [8, -8], "deepseek-v3": [8, 12], "llama4-maverick": [-8, 14], "gpt-oss-120b": [-8, -9], "qwen3-next": [-8, 14], "kimi-k2": [8, -8] };
  for (const m of MODELS) {
    const x = lx(monthNum(m.released)), y = ly(sparsityPct(m));
    s += `<circle class="pt" data-id="${m.id}" cx="${x}" cy="${y}" r="6" fill="${typeColor(m)}" stroke="${C.surface}" stroke-width="2"/>`;
    if (labeled.has(m.id)) {
      const [dx, dy] = shift[m.id] || [8, 4];
      s += `<text x="${x + dx}" y="${y + dy}" fill="${C.ink2}" font-size="11.5" text-anchor="${dx < 0 ? "end" : "start"}">${m.name}</text>`;
    }
  }
  s += `<text x="${lx(2019.6)}" y="${ly(100) - 8}" fill="${C.muted}" font-size="11.5">dense era: 100% of the model fires on every token</text>`;
  s += `</svg>`;
  const wrap = $("#sparsityChart");
  wrap.innerHTML = s;
  $$(".pt", wrap).forEach(c => {
    const m = MODELS.find(x => x.id === c.dataset.id);
    c.addEventListener("mousemove", e => showTip(e, modelTipHTML(m)));
    c.addEventListener("mouseleave", hideTip);
  });
}

// ============================================================
// COST BARS (two panels: compute/token, VRAM floor)
// ============================================================
function renderBars(elId, metric, unit, title) {
  const data = [...MODELS].sort((a, b) => metric(b) - metric(a));
  const max = metric(data[0]);
  const rowH = 26, ML = 168, MR = 74, W = 560;
  const H = data.length * rowH + 12;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px" role="img" aria-label="${title}">`;
  s += `<line x1="${ML}" y1="4" x2="${ML}" y2="${H - 4}" stroke="${C.baseline}" stroke-width="1.5"/>`;
  data.forEach((m, i) => {
    const y = 8 + i * rowH;
    const w = Math.max(2, (W - ML - MR) * metric(m) / max);
    s += `<text x="${ML - 8}" y="${y + 13}" fill="${C.ink2}" font-size="11.5" text-anchor="end">${m.name}</text>`;
    s += `<path class="bar" data-id="${m.id}" d="M${ML} ${y + 3} h${w - 4} a4 4 0 0 1 4 4 v4 a4 4 0 0 1 -4 4 h${-(w - 4)} z" fill="${typeColor(m)}"/>`;
    s += `<text x="${ML + w + 6}" y="${y + 13}" fill="${C.muted}" font-size="11" font-variant="tabular-nums">${Math.round(metric(m))}${unit}</text>`;
  });
  s += `</svg>`;
  const wrap = $(elId);
  wrap.innerHTML = s;
  $$(".bar", wrap).forEach(b => {
    const m = MODELS.find(x => x.id === b.dataset.id);
    b.addEventListener("mousemove", e => showTip(e, modelTipHTML(m)));
    b.addEventListener("mouseleave", hideTip);
  });
}

// ============================================================
// MODEL TABLE
// ============================================================
const state = { search: "", type: "all", sortKey: "released", sortDir: -1, openRow: null };

const COLS = [
  { key: "name", label: "Model", get: m => m.name },
  { key: "released", label: "Released", get: m => m.released },
  { key: "type", label: "Type", get: m => m.type },
  { key: "totalB", label: "Total", get: m => m.totalB },
  { key: "activeB", label: "Active", get: m => m.activeB },
  { key: "sparsity", label: "Active %", get: m => sparsityPct(m) },
  { key: "attention", label: "Attention", get: m => m.attention },
  { key: "ctx", label: "Context", get: m => m.ctx },
  { key: "compute", label: "GFLOPs/tok", get: m => computePerToken(m) },
  { key: "vram", label: "VRAM floor", get: m => vramFloorGB(m) },
  { key: "open", label: "Weights", get: m => m.open },
];

function renderTable() {
  const head = COLS.map(c => {
    const arrow = state.sortKey === c.key ? `<span class="arrow">${state.sortDir > 0 ? "▲" : "▼"}</span>` : "";
    return `<th data-key="${c.key}">${c.label} ${arrow}</th>`;
  }).join("");

  let rows = MODELS.filter(m => {
    if (state.type !== "all" && m.type !== state.type) return false;
    const q = state.search.toLowerCase();
    return !q || (m.name + m.lab + m.attention + m.open).toLowerCase().includes(q);
  });
  const col = COLS.find(c => c.key === state.sortKey);
  rows = rows.sort((a, b) => {
    const va = col.get(a), vb = col.get(b);
    return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * state.sortDir;
  });

  const body = rows.map(m => {
    const openChip = m.open === "closed"
      ? `<span class="chip closed">closed</span>`
      : `<span class="chip open">${m.open}</span>`;
    let html = `<tr class="mrow" data-id="${m.id}">
      <td class="name">${m.name}<span class="lab">${m.lab} · ${m.country}</span></td>
      <td>${fmtDate(m.released)}</td>
      <td><span class="chip ${m.type}"><span class="dot"></span>${typeLabel(m)}</span></td>
      <td>${fmtB(m.totalB)}</td>
      <td>${fmtB(m.activeB)}</td>
      <td>${sparsityPct(m).toFixed(0)}%</td>
      <td>${m.attention}</td>
      <td>${fmtCtx(m.ctx)}</td>
      <td>~${Math.round(computePerToken(m))}</td>
      <td>~${Math.round(vramFloorGB(m))} GB</td>
      <td>${openChip}</td>
    </tr>`;
    if (state.openRow === m.id) {
      const experts = m.experts
        ? `${m.experts.total} experts, top-${m.experts.perTok} routed per token${m.experts.shared ? `, +${m.experts.shared} shared (always on)` : ", no shared expert"}`
        : "— (dense: the whole network runs on every token)";
      html += `<tr class="detail"><td colspan="${COLS.length}">
        <div class="detail-inner">
          <div>
            <div class="dt">Expert configuration</div>
            <div style="font-size:13px;margin-bottom:10px">${experts}</div>
            <div class="dt">Architecture notes</div>
            <ul>${m.innovations.map(i => `<li>${i}</li>`).join("")}</ul>
          </div>
          <div>
            <div class="dt">Investor lens</div>
            <div class="inv">${m.investor}</div>
          </div>
        </div>
      </td></tr>`;
    }
    return html;
  }).join("");

  $("#modelTable").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  $("#rowCount").textContent = rows.length + " of " + MODELS.length + " models · click a row for details";

  $$("#modelTable th").forEach(th => th.addEventListener("click", () => {
    const k = th.dataset.key;
    if (state.sortKey === k) state.sortDir *= -1;
    else { state.sortKey = k; state.sortDir = k === "name" || k === "attention" || k === "open" ? 1 : -1; }
    renderTable();
  }));
  $$("#modelTable tr.mrow").forEach(tr => tr.addEventListener("click", () => {
    state.openRow = state.openRow === tr.dataset.id ? null : tr.dataset.id;
    renderTable();
  }));
}

$("#searchBox").addEventListener("input", e => { state.search = e.target.value; renderTable(); });
$$(".filters .fbtn[data-type]").forEach(b => b.addEventListener("click", () => {
  state.type = b.dataset.type;
  $$(".filters .fbtn[data-type]").forEach(x => x.classList.toggle("on", x === b));
  renderTable();
}));

// ============================================================
// COMPARE
// ============================================================
function initCompare() {
  const selA = $("#selA"), selB = $("#selB");
  const opts = MODELS.map(m => `<option value="${m.id}">${m.name} — ${m.lab}</option>`).join("");
  selA.innerHTML = opts; selB.innerHTML = opts;
  selA.value = "llama31-405b"; selB.value = "deepseek-v3";
  selA.addEventListener("change", renderCompare);
  selB.addEventListener("change", renderCompare);
  renderCompare();
}

function renderCompare() {
  const a = MODELS.find(m => m.id === $("#selA").value);
  const b = MODELS.find(m => m.id === $("#selB").value);
  const maxCompute = Math.max(computePerToken(a), computePerToken(b));
  const maxVram = Math.max(vramFloorGB(a), vramFloorGB(b));

  const bar = (v, max) => `<div class="minibar"><div style="width:${Math.max(2, 100 * v / max)}%"></div></div>`;
  // win: lower is better unless higherWins
  const row = (label, getRaw, getDisp, { higherWins = false, mark = true } = {}) => {
    const va = getRaw(a), vb = getRaw(b);
    let winA = "", winB = "";
    if (mark && va !== vb && typeof va === "number") {
      const aWins = higherWins ? va > vb : va < vb;
      winA = aWins ? "win" : ""; winB = aWins ? "" : "win";
    }
    return `<tr><th>${label}</th><td class="${winA}">${getDisp(a)}</td><td class="${winB}">${getDisp(b)}</td></tr>`;
  };

  $("#compareTable").innerHTML = `
    <tr class="head"><th></th><td>${a.name}<div style="font-size:11.5px;color:${C.muted};font-weight:400">${a.lab} · ${fmtDate(a.released)}</div></td>
                     <td>${b.name}<div style="font-size:11.5px;color:${C.muted};font-weight:400">${b.lab} · ${fmtDate(b.released)}</div></td></tr>
    ${row("Type", m => 0, m => `<span class="chip ${m.type}"><span class="dot"></span>${typeLabel(m)}</span>`, { mark: false })}
    ${row("Total parameters", m => m.totalB, m => fmtB(m.totalB), { mark: false })}
    ${row("Active per token", m => m.activeB, m => fmtB(m.activeB))}
    ${row("Active share", m => sparsityPct(m), m => sparsityPct(m).toFixed(1) + "%", { mark: false })}
    ${row("Experts", m => 0, m => m.experts ? `${m.experts.total} total, top-${m.experts.perTok}${m.experts.shared ? " + shared" : ""}` : "—", { mark: false })}
    ${row("Attention", m => 0, m => m.attention, { mark: false })}
    ${row("Context window", m => m.ctx, m => fmtCtx(m.ctx) + " tokens", { higherWins: true })}
    ${row("Compute per token", m => computePerToken(m), m => `~${Math.round(computePerToken(m))} GFLOPs ${bar(computePerToken(m), maxCompute)}`)}
    ${row("VRAM floor (8-bit)", m => vramFloorGB(m), m => `~${Math.round(vramFloorGB(m))} GB ${bar(vramFloorGB(m), maxVram)}`)}
    ${row("Weights", m => 0, m => m.open, { mark: false })}
    <tr><th>Investor lens</th><td style="font-size:12.5px">${a.investor}</td><td style="font-size:12.5px">${b.investor}</td></tr>
  `;
}

// ============================================================
// ANATOMY DIAGRAMS (static SVG)
// ============================================================
function diagramTransformer() {
  const box = (x, y, w, h, fill, stroke, label, sub) => {
    let t = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    t += `<text x="${x + w / 2}" y="${y + (sub ? h / 2 - 4 : h / 2 + 4)}" fill="${C.ink}" font-size="12.5" font-weight="600" text-anchor="middle">${label}</text>`;
    if (sub) t += `<text x="${x + w / 2}" y="${y + h / 2 + 13}" fill="${C.muted}" font-size="10.5" text-anchor="middle">${sub}</text>`;
    return t;
  };
  const arrow = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.muted}" stroke-width="1.4" marker-end="url(#arr)"/>`;

  let s = `<svg viewBox="0 0 860 180" width="100%" style="max-width:860px" role="img" aria-label="Diagram of the transformer pipeline">
    <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${C.muted}"/></marker></defs>`;
  s += `<text x="14" y="90" fill="${C.ink2}" font-size="13">"The cat sat…"</text>`;
  s += arrow(118, 86, 148, 86);
  s += box(150, 62, 100, 48, "#222220", C.baseline, "Tokenizer", "text → tokens");
  s += arrow(250, 86, 280, 86);
  s += box(282, 62, 110, 48, "#222220", C.baseline, "Embedding", "tokens → vectors");
  s += arrow(392, 86, 422, 86);
  // repeated block
  s += `<rect x="424" y="26" width="230" height="120" rx="10" fill="none" stroke="${C.baseline}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  s += `<text x="539" y="20" fill="${C.muted}" font-size="11" text-anchor="middle">one block — repeated 30–100×</text>`;
  s += box(440, 40, 198, 42, "rgba(57,135,229,0.13)", C.dense, "Attention", "each token looks at the others");
  s += arrow(539, 82, 539, 92);
  s += box(440, 94, 198, 42, "rgba(217,89,38,0.14)", C.moe, "Feed-forward / MoE", "process what attention gathered");
  s += arrow(654, 86, 684, 86);
  s += box(686, 62, 122, 48, "#222220", C.baseline, "Output head", "probability of next token");
  s += `<text x="747" y="130" fill="${C.ink2}" font-size="12">→ "on" (then repeat)</text>`;
  s += `</svg>`;
  return s;
}

function diagramMoE() {
  let s = `<svg viewBox="0 0 860 250" width="100%" style="max-width:860px" role="img" aria-label="Dense feed-forward versus mixture of experts">`;
  // left: dense
  s += `<text x="200" y="24" fill="${C.ink}" font-size="13.5" font-weight="700" text-anchor="middle">Dense</text>`;
  s += `<text x="200" y="42" fill="${C.muted}" font-size="11.5" text-anchor="middle">one big FFN — always fully on</text>`;
  s += `<rect x="95" y="58" width="210" height="130" rx="10" fill="rgba(57,135,229,0.25)" stroke="${C.dense}" stroke-width="1.5"/>`;
  s += `<text x="200" y="118" fill="${C.ink}" font-size="13" font-weight="600" text-anchor="middle">Feed-forward network</text>`;
  s += `<text x="200" y="138" fill="${C.ink2}" font-size="11.5" text-anchor="middle">100% of params, every token</text>`;
  s += `<text x="200" y="216" fill="${C.ink2}" font-size="12" text-anchor="middle">compute per token = full size</text>`;
  // divider
  s += `<line x1="430" y1="20" x2="430" y2="235" stroke="${C.grid}"/>`;
  // right: moe
  s += `<text x="645" y="24" fill="${C.ink}" font-size="13.5" font-weight="700" text-anchor="middle">Mixture of Experts</text>`;
  s += `<text x="645" y="42" fill="${C.muted}" font-size="11.5" text-anchor="middle">router picks 2 of 8 experts for this token</text>`;
  s += `<rect x="580" y="56" width="130" height="34" rx="8" fill="#222220" stroke="${C.baseline}" stroke-width="1.2"/>`;
  s += `<text x="645" y="78" fill="${C.ink}" font-size="12" font-weight="600" text-anchor="middle">Router</text>`;
  const ex = 8, ew = 44, gap = 10, x0 = 645 - (ex * ew + (ex - 1) * gap) / 2;
  const active = new Set([2, 5]);
  for (let i = 0; i < ex; i++) {
    const x = x0 + i * (ew + gap);
    const on = active.has(i);
    s += `<line x1="645" y1="90" x2="${x + ew / 2}" y2="126" stroke="${on ? C.moe : C.grid}" stroke-width="${on ? 2 : 1}"/>`;
    s += `<rect x="${x}" y="128" width="${ew}" height="58" rx="7" fill="${on ? "rgba(217,89,38,0.35)" : "#222220"}" stroke="${on ? C.moe : C.baseline}" stroke-width="${on ? 1.6 : 1}"/>`;
    s += `<text x="${x + ew / 2}" y="${161}" fill="${on ? C.ink : C.muted}" font-size="10.5" text-anchor="middle">E${i + 1}</text>`;
  }
  s += `<text x="645" y="216" fill="${C.ink2}" font-size="12" text-anchor="middle">compute = 2 experts · memory = all 8 (idle experts still occupy GPU)</text>`;
  s += `</svg>`;
  return s;
}

function diagramPipeline() {
  const stages = [
    { name: "Pretraining", sub: "predict next token on trillions of tokens", cost: "≈ all the capex · months on a cluster", w: 1.0, fill: "rgba(57,135,229,0.28)", stroke: C.dense },
    { name: "SFT", sub: "imitate curated examples", cost: "cheap · days", w: 0.1, fill: "#222220", stroke: C.baseline },
    { name: "RLHF", sub: "optimize vs human preferences", cost: "modest · preference data $", w: 0.2, fill: "#222220", stroke: C.baseline },
    { name: "RLVR", sub: "RL on checkable tasks → reasoning", cost: "growing fast · the 2025 frontier", w: 0.45, fill: "rgba(217,89,38,0.25)", stroke: C.moe },
  ];
  let s = `<svg viewBox="0 0 860 190" width="100%" style="max-width:860px" role="img" aria-label="Training pipeline stages and relative cost">
    <defs><marker id="arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${C.muted}"/></marker></defs>`;
  let x = 14;
  const bw = [250, 130, 160, 210];
  stages.forEach((st, i) => {
    const w = bw[i];
    s += `<rect x="${x}" y="30" width="${w}" height="74" rx="9" fill="${st.fill}" stroke="${st.stroke}" stroke-width="1.4"/>`;
    s += `<text x="${x + w / 2}" y="56" fill="${C.ink}" font-size="13" font-weight="700" text-anchor="middle">${st.name}</text>`;
    s += `<text x="${x + w / 2}" y="74" fill="${C.ink2}" font-size="10.5" text-anchor="middle">${st.sub}</text>`;
    s += `<text x="${x + w / 2}" y="90" fill="${C.muted}" font-size="10" text-anchor="middle">${st.cost}</text>`;
    // relative-cost bar under each stage
    s += `<rect x="${x}" y="118" width="${Math.max(6, w * st.w)}" height="10" rx="4" fill="${st.stroke}"/>`;
    if (i < stages.length - 1) s += `<line x1="${x + w + 2}" y1="67" x2="${x + w + 16}" y2="67" stroke="${C.muted}" stroke-width="1.4" marker-end="url(#arr2)"/>`;
    x += w + 20;
  });
  s += `<text x="14" y="150" fill="${C.muted}" font-size="11">bars: rough relative cost share (schematic, not to scale)</text>`;
  s += `<text x="14" y="176" fill="${C.ink2}" font-size="12">Reasoning models add a 5th cost center at answer time: hidden "thinking" tokens — training cost shifting into inference.</text>`;
  s += `</svg>`;
  return s;
}

// ============================================================
// GLOSSARY: every term in the field (ALL_GLOSSARY, glossary-plus.js),
// filtered by domain, each linked to the subfields that use it
// ============================================================
const gstate = { search: "", dom: "all" };
const DOMAIN_ORDER = Object.fromEntries(DOMAINS.map((d, i) => [d.id, i]));
const DOMAIN_LABEL = Object.fromEntries(DOMAINS.map(d => [d.id, d.name]));
const TERM_SUBFIELDS = {};
SUBFIELDS.forEach(s => (s.terms || []).forEach(t => (TERM_SUBFIELDS[t] = TERM_SUBFIELDS[t] || []).push(s)));

function renderGlossaryFilters() {
  $("#glossFilters").innerHTML = `<button class="fbtn" data-dom="all">All</button>` +
    DOMAINS.map(d => `<button class="fbtn" data-dom="${d.id}">${d.short}</button>`).join("");
  $$("#glossFilters .fbtn").forEach(b => b.addEventListener("click", () => {
    gstate.dom = b.dataset.dom;
    syncGlossFilters();
    renderGlossary();
  }));
  syncGlossFilters();
}
function syncGlossFilters() {
  $$("#glossFilters .fbtn").forEach(x => x.classList.toggle("on", x.dataset.dom === gstate.dom));
}

function renderGlossary() {
  const q = gstate.search.toLowerCase().trim();
  const items = ALL_GLOSSARY
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => (gstate.dom === "all" || g.dom === gstate.dom) &&
      (!q || (g.term + " " + g.plain + " " + (g.investor || "")).toLowerCase().includes(q)))
    .sort((a, b) => (DOMAIN_ORDER[a.g.dom] - DOMAIN_ORDER[b.g.dom]) || (a.i - b.i))
    .map(x => x.g);
  if (q) items.sort((a, b) => (b.term.toLowerCase() === q) - (a.term.toLowerCase() === q));
  const grouped = gstate.dom === "all" && !q;
  let html = "", lastDom = null;
  for (const g of items) {
    if (grouped && g.dom !== lastDom) { html += `<h3 class="gloss-dom">${DOMAIN_LABEL[g.dom]}</h3>`; lastDom = g.dom; }
    const subs = TERM_SUBFIELDS[g.term] || [];
    html += `
    <div class="gcard" data-term="${g.term.replace(/"/g, "&quot;")}">
      <h3>${g.term} <span class="gcat">${DOMAIN_LABEL[g.dom]}</span></h3>
      <p>${g.plain}</p>
      ${g.investor ? `<div class="inv-label">Why investors care</div><p class="inv">${g.investor}</p>` : ""}
      ${subs.length ? `<div class="g-links">${subs.map(s => `<a href="#subfields/${s.id}">${s.short} →</a>`).join("")}</div>` : ""}
    </div>`;
  }
  $("#glossGrid").innerHTML = html || `<p style="color:${C.muted}">No terms match.</p>`;
  $("#glossCount").textContent = items.length + " of " + ALL_GLOSSARY.length + " terms";
}

$("#glossSearch").addEventListener("input", e => { gstate.search = e.target.value; renderGlossary(); });
renderGlossaryFilters();

// ============================================================
// CONCEPTS (prose + diagrams injected)
// ============================================================
function renderConcepts() {
  $("#anatomyBody").textContent = CONCEPTS.anatomy.body;
  $("#anatomyDiagram").innerHTML = diagramTransformer();
  $("#moeBody").textContent = CONCEPTS.moe.body;
  $("#moeDiagram").innerHTML = diagramMoE();
  $("#moeTakeaway").innerHTML = "<b>Investor takeaway:</b> " + CONCEPTS.moe.takeaway;
  $("#servingBody").textContent = CONCEPTS.serving.body;
  $("#servingTakeaway").innerHTML = "<b>Investor takeaway:</b> " + CONCEPTS.serving.takeaway;
  $("#pipelineBody").textContent = CONCEPTS.pipeline.body;
  $("#pipelineDiagram").innerHTML = diagramPipeline();
  $("#pipelineTakeaway").innerHTML = "<b>Investor takeaway:</b> " + CONCEPTS.pipeline.takeaway;
  $("#closedTitle").textContent = CLOSED_NOTE.title;
  $("#closedBody").textContent = CLOSED_NOTE.body;
}

// ---------------- init ----------------
renderScatter();
renderTable();
initCompare();
renderConcepts();
renderSparsity();
renderBars("#computeBars", computePerToken, "", "Compute per generated token");
renderBars("#vramBars", vramFloorGB, " GB", "Minimum GPU memory for weights at 8-bit");
renderGlossary();
