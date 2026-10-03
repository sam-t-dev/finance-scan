/* continues board-scan.js */
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
  prev.onclick = () => { state.page = Math.max(0, state.page - 1); drawPasses(list); updatePageLabel(pageLabel); };
  next.onclick = () => { const pages = Math.max(1, Math.ceil(state.passes.length / 10)); state.page = Math.min(pages - 1, state.page + 1); drawPasses(list); updatePageLabel(pageLabel); };
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
  eta.className = "muted";
  eta.textContent = "Scanner idle · top 1,000 by volume · 5/5 rules, then BabyPips boxes";
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

function explain(bars, rules) {
  const pack = babyBoxes(bars, rules);
  const d = pack.detail;
  const lines = [];
  lines.push(pack.signal === "buy"
    ? "Buy: Trend, Momentum, and Support/Resistance boxes are all bullish (BabyPips Cowabunga checklist)."
    : pack.signal === "sell"
      ? "Sell: Trend, Momentum, and Support/Resistance boxes are all bearish (BabyPips Cowabunga checklist)."
      : "Hold: at least one BabyPips box failed (Trend=" + pack.trend + ", Momentum=" + pack.momentum + ", S/R=" + pack.structure + ").");
  lines.push("Trend box: weekly EMA" + rules.babypips.emaFast + "/" + rules.babypips.emaSlow +
    (d.higherUp ? " is up" : d.higherDown ? " is down" : " is flat") +
    "; daily cross " + (d.longCross ? "up" : d.shortCross ? "down" : "none") +
    "; EMA fast " + (d.emaFast != null ? d.emaFast.toFixed(2) : "?") +
    " vs slow " + (d.emaSlow != null ? d.emaSlow.toFixed(2) : "?") + ".");
  lines.push("Momentum box: RSI(" + rules.babypips.rsiPeriod + ")=" +
    (d.r == null ? "?" : d.r.toFixed(0)) +
    " (mid " + rules.babypips.rsiMid + "); Stochastic %K=" +
    (d.kNow == null ? "?" : d.kNow.toFixed(0)) +
    "; MACD hist=" + (d.h0 == null ? "?" : d.h0.toFixed(3)) + ".");
  lines.push("Support/Resistance box: swing low " +
    (d.swingLow == null ? "?" : d.swingLow.toFixed(2)) +
    ", swing high " + (d.swingHigh == null ? "?" : d.swingHigh.toFixed(2)) +
    "; long R:R " + (d.rrLong != null ? d.rrLong.toFixed(2) : "?") +
    ", short R:R " + (d.rrShort != null ? d.rrShort.toFixed(2) : "?") +
    " (min " + rules.babypips.rrMin + ").");
  const closes = bars.map((b) => b.close);
  return {
    signal: pack.signal,
    lines,
    last: d.last,
    trend: d.emaFast,
    higher: d.emaSlow,
    swingHigh: d.swingHigh,
    closes
  };
}

function drawChart(canvas, pack) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = canvas.clientHeight * 2;
  const closes = pack.closes.slice(-180);
  const s50 = closes.map((_, i) => sma(pack.closes.slice(0, pack.closes.length - closes.length + i + 1), 50));
  const s200 = closes.map((_, i) => sma(pack.closes.slice(0, pack.closes.length - closes.length + i + 1), 200));
  const vals = closes.concat(s50.filter(Boolean), s200.filter(Boolean), pack.swingHigh != null ? [pack.swingHigh] : []);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  function X(i) { return 24 + (w - 36) * i / Math.max(1, closes.length - 1); }
  function Y(v) { return 16 + (h - 32) * (1 - (v - (lo - pad)) / (hi - lo + pad * 2)); }
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
}

async function drawSymbol(symbol, name) {
  const board = document.getElementById("board");
  board.innerHTML = "";
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = "<div class='sec-head'><h2>" + symbol + "</h2><a class='ghost link' href='index.html?cat=Stocks'>Back</a></div><h1>" + (name || symbol) + "</h1><p class='muted' id='whyStatus'>Loading the chart.</p><canvas id='chartBox'></canvas><div id='why'></div>";
  board.appendChild(card);
  try {
    const bars = await loadBars(symbol);
    const pack = explain(bars, loadRules());
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
