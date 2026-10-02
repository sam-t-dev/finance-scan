const DEFAULT_RULES = {
  name: "default",
  loose: { pe: 35, peg: 1.5, epsBeat: 0.05, de: 1.5, yoy: 0.08 },
  tight: { pe: 25, fpe: 25, rsiLow: 30, rsiHigh: 70, de: 1, epsBeat: "yes", qoq: 0.05 },
  babypips: { trendMa: 50, higherMa: 200, slopeBars: 5, rsiMin: 30, rsiChase: 70, pullbackPct: 8, rrMin: 1.5, rewardBars: 126 }
};

function loadRules() {
  try {
    const s = JSON.parse(localStorage.getItem("scan-rules") || "null");
    if (s && s.loose) {
      const base = JSON.parse(JSON.stringify(DEFAULT_RULES));
      const baby = Object.assign(base.babypips, s.babypips || {});
      if (!s.babypips || s.babypips.rewardBars == null) {
        baby.pullbackPct = base.babypips.pullbackPct;
        baby.rrMin = base.babypips.rrMin;
        baby.rewardBars = base.babypips.rewardBars;
      }
      return Object.assign(base, s, { babypips: baby });
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}

function apiBase() {
  if (location.hostname.endsWith("workers.dev")) return "";
  return "https://finance-scan-proxy.samtonin-registry.workers.dev";
}

function num(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "object" && v.raw != null) return Number(v.raw);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sma(closes, n) {
  if (closes.length < n) return null;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / n;
}

function slope(closes, n, bars) {
  if (closes.length < n + bars) return null;
  const now = sma(closes, n);
  const prev = sma(closes.slice(0, -bars), n);
  if (now == null || prev == null) return null;
  return now - prev;
}

function rsi(closes, n) {
  if (closes.length < n + 1) return null;
  let g = 0, l = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  if (!l) return 100;
  const rs = (g / n) / (l / n);
  return 100 - 100 / (1 + rs);
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

function fiveChecks(row, closes, rules) {
  const eh = row.earningsHistory && row.earningsHistory.history;
  let eps = null;
  if (Array.isArray(eh) && eh.length) {
    const last = eh[eh.length - 1];
    const a = num(last.epsActual), e = num(last.epsEstimate);
    if (a != null && e) eps = (a - e) / Math.abs(e);
  }
  const pe = num(row.summaryDetail && row.summaryDetail.trailingPE);
  const peg = num(row.defaultKeyStatistics && row.defaultKeyStatistics.pegRatio);
  const deRaw = num(row.financialData && row.financialData.debtToEquity);
  const de = deRaw != null ? deRaw / 100 : null;
  const yoy = num(row.financialData && row.financialData.revenueGrowth);
  const ma20 = sma(closes, 20), ma50 = sma(closes, 50), s20 = slope(closes, 20, 5);
  const loose = rules.loose;
  return [
    pe != null && peg != null && pe < loose.pe && peg < loose.peg,
    ma20 != null && ma50 != null && s20 != null && ma20 > ma50 && s20 > 0,
    eps != null && eps > loose.epsBeat,
    de != null && de < loose.de,
    yoy != null && yoy > loose.yoy
  ];
}

function babySignal(closes, rules) {
  const b = rules.babypips;
  const last = closes[closes.length - 1];
  const trend = sma(closes, b.trendMa);
  const higher = sma(closes, b.higherMa);
  const trendSlope = slope(closes, b.trendMa, b.slopeBars);
  const r = rsi(closes, 14);
  const bars = b.rewardBars || 126;
  const window = closes.slice(-bars);
  const swingHigh = Math.max(...window);
  const dist = trend != null && trend > 0 ? (last - trend) / trend * 100 : null;
  const pullback = dist != null && dist >= 0 && dist <= b.pullbackPct;
  const risk = trend != null ? last - trend : 0;
  const reward = swingHigh - last;
  const rr = risk > 0 ? reward / risk : 0;
  const up = trend != null && last > trend && trendSlope != null && trendSlope > 0 && (higher == null || last > higher);
  const down = trend != null && last < trend && trendSlope != null && trendSlope < 0;
  const notChase = r != null && r >= b.rsiMin && r <= b.rsiChase;
  const buy = up && notChase && pullback && rr >= b.rrMin;
  const sell = down && (higher != null && last < higher);
  if (buy) return "buy";
  if (sell) return "sell";
  return "hold";
}

function fmtEta(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return r + "s";
  return m + "m " + r + "s";
}

const state = { running: false, abort: false, passes: [], page: 0, phase: "" };

function drawPasses(host) {
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(state.passes.length / pageSize));
  if (state.page > pages - 1) state.page = pages - 1;
  const slice = state.passes.slice(state.page * pageSize, state.page * pageSize + pageSize);
  host.innerHTML = "";
  const head = document.createElement("div");
  head.className = "row head";
  head.innerHTML = "<span>Ticker</span><span>Title</span><span>Scan results</span><span>BabyPips results</span>";
  host.appendChild(head);
  slice.forEach((row) => {
    const a = document.createElement("a");
    a.className = "row";
    a.href = "https://finance.yahoo.com/quote/" + encodeURIComponent(row.symbol);
    a.target = "_blank";
    a.rel = "noreferrer";
    const baby = row.baby || "—";
    const babyClass = row.baby || "wait";
    a.innerHTML = '<span class="tick">' + row.symbol + '</span><span class="title">' + row.name + '</span><span class="res pass">pass</span><span class="res ' + babyClass + '">' + baby + '</span>';
    host.appendChild(a);
  });
  return pages;
}

async function runScan(ui) {
  if (state.running) return;
  state.running = true;
  state.abort = false;
  state.passes = [];
  state.page = 0;
  ui.btn.disabled = true;
  ui.spin.style.display = "inline-block";
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
  const cache = new Map();
  const queue = universe.slice();
  const workers = 4;
  async function one(item) {
    const t0 = Date.now();
    try {
      const [quote, closes] = await Promise.all([loadQuote(item.symbol), loadCloses(item.symbol)]);
      const checks = fiveChecks(quote, closes, rules);
      if (checks.every(Boolean)) {
        state.passes.push({ symbol: item.symbol, name: item.name, baby: "", closes });
        cache.set(item.symbol, closes);
        drawPasses(ui.list);
        ui.pageLabel.textContent = (state.page + 1) + " / " + Math.max(1, Math.ceil(state.passes.length / 10));
      }
    } catch (e) {}
    done += 1;
    const avg = (Date.now() - started) / done;
    const left = (universe.length - done) * avg / workers;
    ui.eta.textContent = "Rules scan " + done + " / " + universe.length + " · " + state.passes.length + " passed · about " + fmtEta(left) + " left";
  }
  async function pump() {
    while (queue.length && !state.abort) {
      const item = queue.shift();
      await one(item);
    }
  }
  ui.eta.textContent = "Scanning top " + universe.length + " by volume";
  await Promise.all(Array.from({ length: workers }, pump));
  ui.eta.textContent = "Rules scan done. " + state.passes.length + " passed. Starting BabyPips scan.";
  for (let i = 0; i < state.passes.length; i++) {
    const row = state.passes[i];
    ui.eta.textContent = "BabyPips scan " + (i + 1) + " / " + state.passes.length;
    try { row.baby = babySignal(row.closes, rules); } catch (e) { row.baby = "hold"; }
    delete row.closes;
    drawPasses(ui.list);
  }
  ui.spin.style.display = "none";
  ui.eta.textContent = "Done. Rules scan " + state.passes.length + " of " + universe.length + ". BabyPips scan finished.";
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
  const pageLabel = document.createElement("span");
  pageLabel.className = "muted"; pageLabel.textContent = "1 / 1";
  const next = document.createElement("button");
  next.type = "button"; next.className = "ghost"; next.textContent = ">";
  prev.onclick = () => { state.page = Math.max(0, state.page - 1); drawPasses(list); pageLabel.textContent = (state.page + 1) + " / " + Math.max(1, Math.ceil(state.passes.length / 10)); };
  next.onclick = () => { const pages = Math.max(1, Math.ceil(state.passes.length / 10)); state.page = Math.min(pages - 1, state.page + 1); drawPasses(list); pageLabel.textContent = (state.page + 1) + " / " + pages; };
  pager.append(prev, pageLabel, next);
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
  eta.className = "muted"; eta.textContent = "Top 1,000 by volume. 5/5 first, then BabyPips.";
  status.append(spin, eta);
  const list = document.createElement("div");
  list.className = "list";
  card.append(head, bar, status, list);
  bar.appendChild(btn);
  board.appendChild(card);
  btn.onclick = () => runScan({ btn, spin, eta, list, pageLabel });
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

if (new URLSearchParams(location.search).get("cat") === "Stocks") drawStocks();
else drawHome();
