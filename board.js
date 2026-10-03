function apiBase() {
  if (location.hostname.endsWith("workers.dev")) return "";
  return "https://finance-scan-proxy.samtonin-registry.workers.dev";
}

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
  clearTimeout(timer);
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function loadQuote(sym) {
  const row = await getJson(apiBase() + "/yahoo/quote?symbol=" + encodeURIComponent(sym));
  return (row.quoteSummary && row.quoteSummary.result && row.quoteSummary.result[0]) || {};
}

async function loadCloses(sym) {
  const chart = await getJson(apiBase() + "/yahoo/chart?symbol=" + encodeURIComponent(sym) + "&range=1y&interval=1d");
  const res = chart.chart.result[0];
  return (res.indicators.quote[0].close || []).filter((x) => x != null);
}

const state = { running: false, abort: false, passes: [], page: 0, sortKey: null, sortDir: "up" };

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function sortedPasses() {
  const rows = state.passes.slice();
  if (!state.sortKey) return rows;
  rows.sort((a, b) => compareRows(a, b, state.sortKey, state.sortDir));
  return rows;
}

function paintList(list, pageLabel) {
  const rows = sortedPasses();
  const win = pageWindow(rows.length, state.page, PAGE_SIZE);
  state.page = win.page;
  const slice = rows.slice(win.start, win.end);
  const body = list.querySelectorAll(".row.data");
  body.forEach((n) => n.remove());
  slice.forEach((row) => {
    const a = document.createElement("a");
    a.className = "row data";
    a.href = "index.html?symbol=" + encodeURIComponent(row.symbol) + "&name=" + encodeURIComponent(row.name);
    const baby = row.baby || "—";
    const babyClass = row.baby || "wait";
    const tightClass = row.tightPass ? "pass" : "fail";
    const tightText = row.tightPass ? "pass" : "fail";
    const conf = row.confidence == null ? "—" : String(row.confidence);
    const size = row.size || "—";
    let ev = "";
    let evClass = "ev";
    if (row.event && row.event.text) {
      ev = row.event.text;
      if (row.event.kind === "earnings" && row.event.beat === true) evClass += " beat";
      else if (row.event.kind === "earnings" && row.event.beat === false) evClass += " miss";
    }
    a.innerHTML = '<span class="tick">' + esc(row.symbol) + '</span><span class="title">' + esc(row.name) + '</span><span class="res pass">pass</span><span class="res ' + tightClass + '">' + tightText + '</span><span class="res ' + babyClass + '">' + esc(baby) + '</span><span class="num">' + esc(conf) + '</span><span class="size">' + esc(size) + '</span><span class="' + evClass + '">' + esc(ev) + '</span>';
    list.appendChild(a);
  });
  if (pageLabel) pageLabel.textContent = pageLabelText(win.page, win.pages, rows.length);
  return win;
}

function pageLabelText(page, pages, count) {
  return pageLabel(page, pages, count);
}

function arrowButtons(key) {
  const up = document.createElement("button");
  up.type = "button";
  up.className = "arr";
  up.textContent = "\u25b2";
  up.setAttribute("aria-label", key + " up");
  const down = document.createElement("button");
  down.type = "button";
  down.className = "arr";
  down.textContent = "\u25bc";
  down.setAttribute("aria-label", key + " down");
  up.onclick = () => setSort(key, "up");
  down.onclick = () => setSort(key, "down");
  return [up, down];
}

function titleWithArrows(label, key) {
  const span = document.createElement("span");
  span.className = "htitle";
  span.appendChild(document.createTextNode(label));
  arrowButtons(key).forEach((b) => span.appendChild(b));
  return span;
}

let listEl = null;
let pageEl = null;

function setSort(key, dir) {
  state.sortKey = key;
  state.sortDir = dir;
  state.page = 0;
  if (listEl) paintList(listEl, pageEl);
}

function buildHead(list) {
  const groups = document.createElement("div");
  groups.className = "row head groups";
  const blankA = document.createElement("span");
  const blankB = document.createElement("span");
  const fund = document.createElement("span");
  fund.className = "group";
  fund.textContent = "Fundamentals";
  const tech = titleWithArrows("Technical analysis", "tech");
  const conf = document.createElement("span");
  conf.className = "confhead";
  conf.appendChild(titleWithArrows("Confidence", "confidence"));
  const sub = document.createElement("span");
  sub.className = "sub";
  sub.textContent = CONFIDENCE_BLURB;
  conf.appendChild(sub);
  groups.append(blankA, blankB, fund, tech, conf, titleWithArrows("Size", "size"), titleWithArrows("Next event", "event"));
  const cols = document.createElement("div");
  cols.className = "row head cols";
  cols.append(
    titleWithArrows("Ticker", "ticker"),
    titleWithArrows("Name", "name"),
    titleWithArrows("Loose", "loose"),
    titleWithArrows("Tight", "tight"),
    document.createElement("span"),
    document.createElement("span"),
    document.createElement("span"),
    document.createElement("span")
  );
  list.append(groups, cols);
}

async function runScan(ui) {
  if (state.running) return;
  state.running = true;
  state.abort = false;
  state.passes = [];
  state.page = 0;
  ui.btn.disabled = true;
  ui.spin.style.display = "inline-block";
  ui._lastEta = Date.now();
  ui.eta.textContent = "Estimated time of completion …";
  const rules = loadRules();
  let universe = [];
  try {
    universe = await getJson("universe.json");
  } catch (e) {
    ui.eta.textContent = "Could not load the universe list.";
    state.running = false;
    ui.btn.disabled = false;
    ui.spin.style.display = "none";
    return;
  }
  universe = universe.slice(0, 1000);
  const started = Date.now();
  let done = 0;
  const queue = universe.slice();
  const workers = 4;
  function noteEta(ms) {
    if (!shouldPaintEta(Date.now(), ui._lastEta, false)) return;
    ui._lastEta = Date.now();
    ui.eta.textContent = etaLine(ms);
  }
  async function one(item) {
    try {
      const [quote, closes] = await Promise.all([loadQuote(item.symbol), loadCloses(item.symbol)]);
      const loose = fiveChecks(quote, closes, rules);
      if (loose.every(Boolean)) {
        const tight = tightChecks(quote, closes, rules);
        state.passes.push({
          order: state.passes.length,
          symbol: item.symbol,
          name: item.name,
          loosePass: true,
          tightPass: tight.every(Boolean),
          tight,
          baby: "",
          confidence: null,
          size: null,
          event: parseNextEvent(quote),
          closes
        });
        paintList(ui.list, ui.pageLabel);
      }
    } catch (e) {}
    done += 1;
    const avg = (Date.now() - started) / done;
    const left = (universe.length - done) * avg / workers;
    noteEta(left);
  }
  async function pump() {
    while (queue.length && !state.abort) {
      const item = queue.shift();
      await one(item);
    }
  }
  await Promise.all(Array.from({ length: workers }, pump));
  const babyStarted = Date.now();
  for (let i = 0; i < state.passes.length; i++) {
    const row = state.passes[i];
    const spent = Date.now() - babyStarted;
    const avg = i === 0 ? 40 : spent / i;
    noteEta((state.passes.length - i) * avg);
    try {
      const pack = weekPlus(row.closes, rules);
      row.baby = pack.signal;
      row.confidence = confidenceFromChecks(row.tight, pack.checks, row.event);
      row.size = sizeFromScore(row.confidence, row.event);
    } catch (e) {
      row.baby = "hold";
      row.confidence = confidenceFromChecks(row.tight, [false, false, false, false, false, false], row.event);
      row.size = sizeFromScore(row.confidence, row.event);
    }
    delete row.closes;
    paintList(ui.list, ui.pageLabel);
  }
  ui.spin.style.display = "none";
  ui.eta.textContent = "Done. Loose scan " + state.passes.length + " of " + universe.length + ". Technical scan finished.";
  ui.btn.disabled = false;
  state.running = false;
}

function drawHome() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = "<h2>Board</h2><div class='cats'><a href='index.html?cat=Stocks'><b>Stocks</b><div class='muted'>Scan top 1,000 by volume</div></a></div>";
  board.appendChild(card);
}

function drawStocks() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "card";
  const head = document.createElement("div");
  head.className = "sec-head";
  head.innerHTML = "<h2>Stocks</h2>";
  const pager = document.createElement("div");
  pager.className = "pager";
  const prev = document.createElement("button");
  prev.type = "button"; prev.className = "ghost"; prev.textContent = "<";
  const pageLabelEl = document.createElement("span");
  pageLabelEl.className = "muted";
  pageLabelEl.textContent = pageLabel(0, 1, 0);
  const next = document.createElement("button");
  next.type = "button"; next.className = "ghost"; next.textContent = ">";
  const list = document.createElement("div");
  list.className = "list";
  listEl = list;
  pageEl = pageLabelEl;
  prev.onclick = () => {
    state.page = Math.max(0, state.page - 1);
    paintList(list, pageLabelEl);
  };
  next.onclick = () => {
    const win = pageWindow(state.passes.length, state.page + 1, PAGE_SIZE);
    state.page = win.page;
    paintList(list, pageLabelEl);
  };
  pager.append(prev, pageLabelEl, next);
  head.appendChild(pager);
  const bar = document.createElement("div");
  bar.className = "scan-bar";
  const btn = document.createElement("button");
  btn.type = "button"; btn.textContent = "Scan";
  const status = document.createElement("div");
  status.className = "scan-status";
  const spin = document.createElement("span");
  spin.className = "spin"; spin.style.display = "none";
  const eta = document.createElement("span");
  eta.className = "muted"; eta.textContent = "Top 1,000 by volume. Loose 5/5 first, then technical analysis.";
  status.append(spin, eta);
  card.append(head, bar, status, list);
  bar.appendChild(btn);
  board.appendChild(card);
  buildHead(list);
  btn.onclick = () => runScan({ btn, spin, eta, list, pageLabel: pageLabelEl });
}

const theme = localStorage.getItem("scan-theme") || "dark";
document.documentElement.dataset.theme = theme;
document.getElementById("themeBtn").textContent = theme === "dark" ? "Light" : "Dark";
document.getElementById("themeBtn").onclick = () => {
  const n = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = n;
  localStorage.setItem("scan-theme", n);
  document.getElementById("themeBtn").textContent = n === "dark" ? "Light" : "Dark";
};
document.getElementById("menuBtn").onclick = () => document.getElementById("nav").classList.toggle("open");
document.getElementById("searchForm").onsubmit = (e) => {
  e.preventDefault();
  const q = document.getElementById("q").value.trim();
  if (q) window.open("https://finance.yahoo.com/quote/" + encodeURIComponent(q.toUpperCase()), "_blank");
};

function drawChart(canvas, pack) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = canvas.clientHeight * 2;
  const closes = pack.closes.slice(-180);
  const s50 = closes.map((_, i) => sma(pack.closes.slice(0, pack.closes.length - closes.length + i + 1), 50));
  const s200 = closes.map((_, i) => sma(pack.closes.slice(0, pack.closes.length - closes.length + i + 1), 200));
  const vals = closes.concat(s50.filter(Boolean), s200.filter(Boolean), [pack.swingHigh]);
  const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  const pad = (hi - lo) * 0.08 || 1;
  function X(i) { return 24 + (w - 36) * i / Math.max(1, closes.length - 1); }
  function Y(v) { return 16 + (h - 32) * (1 - (v - (lo - pad)) / (hi - lo + pad * 2)); }
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#c9a227";
  ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.moveTo(24, Y(pack.swingHigh)); ctx.lineTo(w - 12, Y(pack.swingHigh)); ctx.stroke();
  ctx.setLineDash([]);
  function line(arr, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    arr.forEach((v, i) => { if (v == null) return; const x = X(i), y = Y(v); if (i === 0 || arr[i - 1] == null) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
  }
  line(closes, "#ececec");
  line(s50, "#3dd68c");
  line(s200, "#6ea8ff");
  ctx.fillStyle = "#3dd68c";
  ctx.beginPath(); ctx.arc(X(closes.length - 1), Y(closes[closes.length - 1]), 5, 0, 7); ctx.fill();
}

async function drawSymbol(symbol, name) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = "<div class='sec-head'><h2>" + esc(symbol) + "</h2><a class='ghost link' href='index.html?cat=Stocks'>Back</a></div><h1>" + esc(name || symbol) + "</h1><p class='muted' id='whyStatus'>Loading the chart.</p><canvas id='chartBox'></canvas><div id='why'></div>";
  board.appendChild(card);
  try {
    const closes = await loadCloses(symbol);
    const pack = explainPack(closes, loadRules());
    document.getElementById("whyStatus").textContent = pack.signal.toUpperCase();
    document.getElementById("whyStatus").className = "res " + pack.signal;
    const why = document.getElementById("why");
    pack.lines.forEach((line) => { const p = document.createElement("p"); p.className = "why"; p.textContent = line; why.appendChild(p); });
    drawChart(document.getElementById("chartBox"), pack);
  } catch (e) {
    document.getElementById("whyStatus").textContent = "No chart data.";
  }
}

if (new URLSearchParams(location.search).get("symbol")) drawSymbol(new URLSearchParams(location.search).get("symbol"), new URLSearchParams(location.search).get("name"));
else if (new URLSearchParams(location.search).get("cat") === "Stocks") drawStocks();
else drawHome();
