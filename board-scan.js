/* depends on babypips-a.js + babypips-b.js */
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

async function loadBars(sym) {
  const chart = await getJson(apiBase() + "/yahoo/chart?symbol=" + encodeURIComponent(sym) + "&range=1y&interval=1d");
  const res = chart.chart.result[0];
  const q = res.indicators.quote[0];
  const bars = [];
  for (let i = 0; i < q.close.length; i++) {
    if (q.close[i] == null || q.high[i] == null || q.low[i] == null || q.open[i] == null) continue;
    bars.push({ open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i] });
  }
  return bars;
}

async function loadCloses(sym) {
  const bars = await loadBars(sym);
  return bars.map((b) => b.close);
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
    a.href = "index.html?symbol=" + encodeURIComponent(row.symbol) + "&name=" + encodeURIComponent(row.name);
    const baby = row.baby || "—";
    const babyClass = row.baby || "wait";
    a.innerHTML = '<span class="tick">' + row.symbol + '</span><span class="title">' + row.name + '</span><span class="res pass">pass</span><span class="res ' + babyClass + '">' + baby + '</span>';
    host.appendChild(a);
  });
  return pages;
}

function updatePageLabel(pageLabel) {
  pageLabel.textContent = (state.page + 1) + " / " + Math.max(1, Math.ceil(state.passes.length / 10));
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
  let babyDone = 0;
  const queue = universe.slice();
  const workers = 4;

  function refreshEta() {
    const avg = done ? (Date.now() - started) / done : 0;
    const leftRules = (universe.length - done) * avg / workers;
    // BabyPips runs inline on passes; remaining baby work scales with expected remaining passes.
    const passRate = done ? state.passes.length / done : 0;
    const expectedPassesLeft = Math.max(0, (universe.length - done) * passRate);
    const babyLeft = Math.max(0, expectedPassesLeft + (state.passes.length - babyDone)) * (avg * 0.05);
    const left = leftRules + babyLeft;
    ui.eta.textContent = "Scanner · " + done + " / " + universe.length +
      " · " + state.passes.length + " passed · BabyPips " + babyDone + " / " + state.passes.length +
      " · about " + fmtEta(left) + " left";
  }

  async function one(item) {
    try {
      const [quote, bars] = await Promise.all([loadQuote(item.symbol), loadBars(item.symbol)]);
      const closes = bars.map((b) => b.close);
      const checks = fiveChecks(quote, closes, rules);
      if (checks.every(Boolean)) {
        const row = { symbol: item.symbol, name: item.name, baby: "" };
        state.passes.push(row);
        drawPasses(ui.list);
        updatePageLabel(ui.pageLabel);
        // Let the green "pass" paint, then finish BabyPips and replace with buy/hold/sell.
        await new Promise((r) => setTimeout(r, 0));
        try { row.baby = babySignal(bars, rules); } catch (e) { row.baby = "hold"; }
        babyDone += 1;
        drawPasses(ui.list);
      }
    } catch (e) {}
    done += 1;
    refreshEta();
  }

  async function pump() {
    while (queue.length && !state.abort) {
      const item = queue.shift();
      await one(item);
      // Yield so the UI (spinner, list, ETA) stays responsive.
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  ui.eta.textContent = "Scanner · starting top " + universe.length + " by volume";
  await Promise.all(Array.from({ length: workers }, pump));
  ui.spin.style.display = "none";
  ui.eta.textContent = "Done. Rules " + state.passes.length + " of " + universe.length +
    " · BabyPips " + babyDone + " finished.";
  ui.btn.disabled = false;
  state.running = false;
}
