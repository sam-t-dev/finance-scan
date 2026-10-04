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

function assetUrl(name) {
  const url = new URL(document.baseURI);
  let path = url.pathname || "/";
  if (path.endsWith(".html")) path = path.slice(0, path.lastIndexOf("/") + 1);
  else if (!path.endsWith("/")) path += "/";
  url.pathname = path + String(name).replace(/^\/+/, "");
  url.search = "";
  url.hash = "";
  return url.href;
}

async function loadChart(sym, range) {
  const chart = await getJson(apiBase() + "/yahoo/chart?symbol=" + encodeURIComponent(sym) + "&range=" + encodeURIComponent(range || "1y") + "&interval=1d");
  const res = chart.chart.result[0];
  const raw = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
  const stamps = res.timestamp || [];
  const closes = [];
  const times = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] == null) continue;
    closes.push(raw[i]);
    times.push(stamps[i] == null ? null : Number(stamps[i]));
  }
  return { closes, times, events: res.events || null };
}

async function loadCloses(sym) {
  const series = await loadChart(sym, "1y");
  return series.closes;
}

async function loadNews(sym) {
  try {
    return await getJson(apiBase() + "/yahoo/news?symbol=" + encodeURIComponent(sym));
  } catch (e) {
    return null;
  }
}

const state = { running: false, abort: false, passes: [], page: 0, sortKey: "confidence", sortDir: "down" };

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
    const href = "index.html?symbol=" + encodeURIComponent(row.symbol) + "&name=" + encodeURIComponent(row.name);
    const a = document.createElement("div");
    a.className = "row data";
    a.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("a")) return;
      location.href = href;
    });
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
    const tick = document.createElement("a");
    tick.className = "tick";
    tick.href = href;
    tick.textContent = row.symbol;
    const title = document.createElement("a");
    title.className = "title";
    title.href = href;
    title.textContent = row.name;
    const looseEl = document.createElement("span");
    looseEl.className = "res pass";
    looseEl.textContent = "pass";
    const tightEl = document.createElement("span");
    tightEl.className = "res " + tightClass;
    tightEl.textContent = tightText;
    const babyEl = document.createElement("span");
    babyEl.className = "res " + babyClass;
    babyEl.textContent = baby;
    const confEl = document.createElement("span");
    confEl.className = "num";
    confEl.textContent = conf;
    const sizeEl = document.createElement("span");
    sizeEl.className = "size";
    sizeEl.textContent = size;
    const evEl = document.createElement("span");
    evEl.className = evClass;
    evEl.textContent = ev;
    const newsEl = document.createElement("span");
    newsEl.className = "news";
    if (row.news && row.news.title && row.news.link) {
      if (row.news.text) {
        const when = document.createElement("span");
        when.className = "when";
        when.textContent = row.news.text + " ";
        newsEl.appendChild(when);
      }
      const link = document.createElement("a");
      link.href = row.news.link;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = row.news.title;
      newsEl.appendChild(link);
    }
    a.append(tick, title, looseEl, tightEl, babyEl, confEl, sizeEl, evEl, newsEl);
    list.appendChild(a);
  });
  if (pageLabel) pageLabel.textContent = pageLabelText(win.page, win.pages, rows.length);
  saveScan();
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
  const text = document.createElement("button");
  text.type = "button";
  text.className = "htxt";
  text.textContent = label;
  text.setAttribute("aria-label", "Sort by " + label);
  text.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    let dir;
    if (state.sortKey === key) dir = state.sortDir === "up" ? "down" : "up";
    else dir = key === "ticker" || key === "name" ? "up" : "down";
    setSort(key, dir);
  };
  span.appendChild(text);
  arrowButtons(key).forEach((b) => {
    b.addEventListener("click", (e) => e.stopPropagation());
    span.appendChild(b);
  });
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
  groups.append(blankA, blankB, fund, tech, conf, titleWithArrows("Size", "size"), titleWithArrows("Event", "event"), titleWithArrows("News", "news"));
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
  ui.eta.textContent = "Estimated time of completion \u2026";
  const rules = loadRules();
  let universe = [];
  try {
    universe = await getJson(assetUrl("universe.json"));
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
      const [quote, series, newsRaw] = await Promise.all([
        loadQuote(item.symbol).catch(() => ({})),
        loadChart(item.symbol, "1y"),
        loadNews(item.symbol)
      ]);
      const closes = series.closes;
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
          event: parseListedEvent(quote, series.events),
          news: parseNews(newsRaw),
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
      row.confidence = confidenceFromChecks(row.tight, pack.checks, row.event, row.news);
      row.size = sizeFromScore(row.confidence, row.event, row.news);
    } catch (e) {
      row.baby = "hold";
      row.confidence = confidenceFromChecks(row.tight, [false, false, false, false, false, false], row.event, row.news);
      row.size = sizeFromScore(row.confidence, row.event, row.news);
    }
    delete row.closes;
    paintList(ui.list, ui.pageLabel);
  }
  ui.spin.style.display = "none";
  ui.eta.textContent = "Done. Loose scan " + state.passes.length + " of " + universe.length + ". Technical scan finished.";
  ui.btn.disabled = false;
  state.running = false;
  saveScan();
}

function saveScan() {
  try {
    const payload = scanPayload(state.passes, state.page, state.sortKey, state.sortDir);
    sessionStorage.setItem(SCAN_STORE, JSON.stringify(payload));
  } catch (e) {}
}

function restoreScan() {
  try {
    const data = JSON.parse(sessionStorage.getItem(SCAN_STORE) || "null");
    if (!data || !Array.isArray(data.passes) || !data.passes.length) return false;
    state.passes = data.passes;
    state.page = data.page || 0;
    state.sortKey = data.sortKey || "confidence";
    state.sortDir = data.sortDir || "down";
    return true;
  } catch (e) { return false; }
}

function drawHome() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "home-board";
  const cats = document.createElement("div");
  cats.className = "cats home";
  const icons = {
    Scanners: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 12h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    Stocks: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16l5-5 4 3 7-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ETFs: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    Commodities: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 12v8M12 12L4 8M12 12l8-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  };
  [
    ["Scanners", "index.html?cat=Scanners"],
    ["Stocks", "index.html?cat=Stocks"],
    ["ETFs", "index.html?cat=ETFs"],
    ["Commodities", "index.html?cat=Commodities"]
  ].forEach((item) => {
    const a = document.createElement("a");
    a.href = item[1];
    a.innerHTML = icons[item[0]] + "<span>" + esc(item[0]) + "</span>";
    cats.appendChild(a);
  });
  const head = document.createElement("div");
  head.className = "wide-head";
  const title = document.createElement("span");
  title.className = "htitle";
  title.textContent = "Most traded, 7 days";
  const up = document.createElement("button");
  up.type = "button"; up.className = "arr"; up.textContent = "\u25b2"; up.setAttribute("aria-label", "least traded first");
  const down = document.createElement("button");
  down.type = "button"; down.className = "arr"; down.textContent = "\u25bc"; down.setAttribute("aria-label", "most traded first");
  title.append(up, down);
  const note = document.createElement("span");
  note.className = "muted";
  note.textContent = "Top 20";
  head.append(title, note);
  const list = document.createElement("div");
  list.className = "wides cols";
  card.append(cats, head, list);
  board.appendChild(card);
  const home = { rows: [], dir: "down", label: "listed volume" };
  function paint() {
    const ordered = sortByTraded(home.rows, home.dir);
    list.innerHTML = "";
    ordered.forEach((row) => {
      const a = document.createElement("a");
      a.className = "wide quote-card";
      a.href = "index.html?symbol=" + encodeURIComponent(row.symbol) + "&name=" + encodeURIComponent(row.name);
      const move = formatDayMove(row.chg, row.pct);
      const tone = row.chg > 0 ? "up" : row.chg < 0 ? "down" : "flat";
      const price = row.last != null && Number.isFinite(row.last) ? row.last.toFixed(2) : "\u2014";
      a.innerHTML = "<span class='id'><b>" + esc(row.symbol) + "</b><span class='co muted'>" + esc(row.name) + "</span></span><span class='quote'><span class='qlabel'>Last price</span><span class='qprice'>" + esc(price) + "</span>" + (move ? "<span class='qchg " + tone + "'>" + esc(move) + "</span>" : "<span class='qchg muted'>\u2014</span>") + "</span>";
      list.appendChild(a);
    });
    note.textContent = "Top " + ordered.length + " \u00b7 " + home.label;
  }
  up.onclick = () => { home.dir = "up"; paint(); };
  down.onclick = () => { home.dir = "down"; paint(); };
  getJson(assetUrl("universe.json")).then(async (universe) => {
    const seed = topByTraded((universe || []).map((row) => ({ symbol: row.symbol, name: row.name, traded: Number(row.volume) || 0 })), 40);
    home.rows = seed.slice(0, 20);
    home.label = "listed volume";
    paint();
    const ranked = [];
    const queue = seed.slice();
    async function one() {
      while (queue.length) {
        const row = queue.shift();
        let traded = row.traded;
        let last = null, chg = null, pct = null;
        try {
          const chart = await getJson(apiBase() + "/yahoo/chart?symbol=" + encodeURIComponent(row.symbol) + "&range=1mo&interval=1d");
          try {
            const vol = chart.chart.result[0].indicators.quote[0].volume || [];
            const sum = sumLastVolumes(vol, 7);
            if (sum != null) traded = sum;
          } catch (e) {}
          const q = quoteFromChart(chart);
          if (q) { last = q.last; chg = q.chg; pct = q.pct; }
        } catch (e) {}
        const item = { symbol: row.symbol, name: row.name, traded, last, chg, pct };
        ranked.push(item);
        const shown = home.rows.find((r) => r.symbol === row.symbol);
        if (shown && last != null) { shown.last = last; shown.chg = chg; shown.pct = pct; paint(); }
      }
    }
    await Promise.all([one(), one(), one(), one()]);
    const seven = ranked.filter((row) => row.traded != null);
    if (seven.length) {
      home.rows = topByTraded(seven, 20);
      home.label = "last 7 sessions";
      paint();
    }
  }).catch(() => { note.textContent = "Could not load the universe list."; });
}

function drawCategory(cat) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "card";
  if (cat === "Scanners") {
    card.innerHTML = "<div class='sec-head'><h2>Scanners</h2><a class='ghost link' href='index.html'>Back</a></div><div class='wides'><a class='wide' href='index.html?cat=Stocks'><span><b>Stocks</b> <span class='muted'>Loose 5/5 gate, then technical analysis</span></span><span class='muted'>Top 1,000</span></a></div>";
  } else {
    card.innerHTML = "<div class='sec-head'><h2>" + esc(cat) + "</h2><a class='ghost link' href='index.html'>Back</a></div><p class='muted'>No scan yet. Names are not invented here.</p>";
  }
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
  if (restoreScan()) {
    paintList(list, pageLabelEl);
    eta.textContent = "Saved scan restored. " + state.passes.length + " names. Press Scan to run it again.";
  }
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

const searchForm = document.getElementById("searchForm");
const searchBox = document.getElementById("q");
const suggest = document.getElementById("suggest");
let universeCache = null;
if (searchForm && searchForm.tagName === "FORM") searchForm.onsubmit = (e) => e.preventDefault();
async function paintSearch() {
  const q = searchBox.value.trim();
  suggest.innerHTML = "";
  if (q.length < 3) { suggest.style.display = "none"; return; }
  if (!universeCache) {
    try { universeCache = await getJson(assetUrl("universe.json")); } catch (e) { universeCache = []; }
  }
  const hits = searchUniverse(Array.isArray(universeCache) ? universeCache : [], q);
  if (!hits.length) { suggest.style.display = "none"; return; }
  hits.forEach((hit) => {
    const a = document.createElement("a");
    a.href = assetUrl("index.html") + "?symbol=" + encodeURIComponent(hit.symbol) + "&name=" + encodeURIComponent(hit.name);
    a.textContent = hit.symbol + " \u2014 " + hit.name;
    suggest.appendChild(a);
  });
  suggest.style.display = "block";
}
searchBox.addEventListener("input", () => { paintSearch(); });
document.addEventListener("click", (e) => {
  if (!searchForm.contains(e.target)) suggest.style.display = "none";
});

function axisDate(unix) {
  if (unix == null || !Number.isFinite(Number(unix))) return "";
  const d = new Date(Number(unix) * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d.getUTCDate() + " " + months[d.getUTCMonth()] + " " + String(d.getUTCFullYear());
}

function drawChart(canvas, pack) {
  const full = pack.closes;
  const fullTimes = pack.times || [];
  const view = { start: Math.max(0, full.length - 180), end: full.length };
  let drag = null;
  function draw() {
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * 2;
    const h = canvas.height = canvas.clientHeight * 2;
    const closes = full.slice(view.start, view.end);
    const times = fullTimes.slice(view.start, view.end);
    const s50 = closes.map((_, i) => sma(full.slice(0, view.start + i + 1), 50));
    const s200 = closes.map((_, i) => sma(full.slice(0, view.start + i + 1), 200));
    const vals = closes.concat(s50.filter(Boolean), s200.filter(Boolean));
    if (pack.swingHigh != null) vals.push(pack.swingHigh);
    const lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    const pad = (hi - lo) * 0.08 || 1;
    const axis = 52;
    function X(i) { return 24 + (w - 36) * i / Math.max(1, closes.length - 1); }
    function Y(v) { return 16 + (h - 16 - axis) * (1 - (v - (lo - pad)) / (hi - lo + pad * 2)); }
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0b0b0c";
    ctx.fillRect(0, 0, w, h);
    if (pack.swingHigh != null) {
      ctx.strokeStyle = "#c9a227";
      ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(24, Y(pack.swingHigh)); ctx.lineTo(w - 12, Y(pack.swingHigh)); ctx.stroke();
      ctx.setLineDash([]);
    }
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
    const baseY = h - axis + 8;
    ctx.strokeStyle = "#8d8d96";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, baseY);
    ctx.lineTo(w - 12, baseY);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "22px sans-serif";
    ctx.textBaseline = "top";
    const slots = Math.min(4, closes.length);
    for (let t = 0; t < slots; t++) {
      const i = slots === 1 ? 0 : Math.round(t * (closes.length - 1) / (slots - 1));
      const label = axisDate(times[i]);
      if (!label) continue;
      const x = X(i);
      ctx.textAlign = t === 0 ? "left" : t === slots - 1 ? "right" : "center";
      ctx.fillText(label, x, baseY + 8);
    }
  }
  canvas.onwheel = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const t = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
    const next = zoomWindow(view.start, view.end, full.length, Math.min(1, Math.max(0, t)), e.deltaY < 0);
    view.start = next.start;
    view.end = next.end;
    draw();
  };
  canvas.onpointerdown = (e) => {
    drag = { x: e.clientX, start: view.start, end: view.end };
    canvas.setPointerCapture(e.pointerId);
  };
  canvas.onpointermove = (e) => {
    if (!drag) return;
    const rect = canvas.getBoundingClientRect();
    const span = drag.end - drag.start;
    const bars = Math.round((drag.x - e.clientX) / Math.max(1, rect.width) * span);
    const next = panWindow(drag.start, drag.end, full.length, bars);
    view.start = next.start;
    view.end = next.end;
    draw();
  };
  canvas.onpointerup = () => { drag = null; };
  canvas.ondblclick = () => {
    view.start = Math.max(0, full.length - 180);
    view.end = full.length;
    draw();
  };
  draw();
}

function summaryRow(dl, label, value, cls) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  if (cls) dd.className = cls;
  dl.append(dt, dd);
}

async function drawSymbol(symbol, name) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = "<div class='sec-head'><h2>" + esc(symbol) + "</h2><a class='ghost link' href='index.html?cat=Stocks'>Back</a></div><h1>" + esc(name || symbol) + "</h1><p class='price' id='lastPrice'>\u2014</p><p><a class='ghost link' id='yahooLink' href='" + esc(yahooQuoteUrl(symbol)) + "' target='_blank' rel='noopener'>Open in Yahoo Finance</a></p><p class='muted' id='whyStatus'>Loading the chart.</p><canvas id='chartBox'></canvas><p class='muted chart-hint'>Scroll to zoom. Drag to move. Double-click to reset.</p><dl class='facts' id='facts'></dl><div id='why'></div>";
  board.appendChild(card);
  const facts = document.getElementById("facts");
  try {
    let quote = {};
    let news = null;
    try { quote = await loadQuote(symbol); } catch (e) {}
    try { news = parseNews(await loadNews(symbol)); } catch (e) {}
    const series = await loadChart(symbol, "1y");
    const closes = series.closes;
    const rules = loadRules();
    const pack = explainPack(closes, rules);
    pack.times = series.times;
    const haveFundamentals = !!(quote.summaryDetail || quote.financialData || quote.earningsHistory);
    const loose = haveFundamentals ? fiveChecks(quote, closes, rules) : null;
    const tight = haveFundamentals ? tightChecks(quote, closes, rules) : null;
    const event = parseListedEvent(quote, series.events);
    const confidence = tight ? confidenceFromChecks(tight, pack.checks, event, news) : null;
    const size = confidence == null ? null : sizeFromScore(confidence, event, news);
    const price = pack.last;
    const priceEl = document.getElementById("lastPrice");
    priceEl.textContent = price.toFixed(2);
    document.getElementById("whyStatus").textContent = pack.signal.toUpperCase();
    document.getElementById("whyStatus").className = "res " + pack.signal;
    summaryRow(facts, "Loose", loose ? (loose.every(Boolean) ? "pass" : "fail") : "\u2014", loose ? (loose.every(Boolean) ? "pass" : "fail") : "");
    summaryRow(facts, "Tight", tight ? (tight.every(Boolean) ? "pass" : "fail") : "\u2014", tight ? (tight.every(Boolean) ? "pass" : "fail") : "");
    summaryRow(facts, "Technical analysis", pack.signal, pack.signal);
    summaryRow(facts, "Confidence", confidence == null ? "\u2014" : String(confidence));
    summaryRow(facts, "Size", size || "\u2014");
    const evText = event && event.text ? event.text : "";
    const evCls = event && event.kind === "earnings" && event.beat === true ? "beat" : event && event.kind === "earnings" && event.beat === false ? "miss" : "";
    summaryRow(facts, "Event", evText, evCls);
    const newsDt = document.createElement("dt");
    newsDt.textContent = "News";
    const newsDd = document.createElement("dd");
    if (news && news.title && news.link) {
      if (news.text) newsDd.appendChild(document.createTextNode(news.text + " "));
      const link = document.createElement("a");
      link.href = news.link;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = news.title;
      newsDd.appendChild(link);
    }
    facts.append(newsDt, newsDd);
    summaryRow(facts, "50-day", pack.trend ? pack.trend.toFixed(2) : "\u2014");
    summaryRow(facts, "200-day", pack.higher ? pack.higher.toFixed(2) : "\u2014");
    summaryRow(facts, "RSI", pack.r == null ? "\u2014" : pack.r.toFixed(0));
    const why = document.getElementById("why");
    const moveLine = newsMoveLine(news);
    const lines = pack.lines.slice();
    if (moveLine) lines.push(moveLine);
    lines.forEach((line) => { const para = document.createElement("p"); para.className = "why"; para.textContent = line; why.appendChild(para); });
    drawChart(document.getElementById("chartBox"), pack);
  } catch (e) {
    document.getElementById("whyStatus").textContent = "No chart data.";
  }
}

window.addEventListener("pagehide", () => { if (state.passes.length) saveScan(); });

const boot = new URLSearchParams(location.search);
if (boot.get("symbol")) drawSymbol(boot.get("symbol"), boot.get("name"));
else if (boot.get("cat") === "Stocks") drawStocks();
else if (boot.get("cat") === "Scanners" || boot.get("cat") === "ETFs" || boot.get("cat") === "Commodities") drawCategory(boot.get("cat"));
else drawHome();
