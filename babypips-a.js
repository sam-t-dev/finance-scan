/* BabyPips Cowabunga checklist helpers. Loaded before board.js. */
const DEFAULT_RULES = {
  name: "default",
  loose: { pe: 35, peg: 1.5, epsBeat: 0.05, de: 1.5, yoy: 0.08 },
  tight: { pe: 25, fpe: 25, rsiLow: 30, rsiHigh: 70, de: 1, epsBeat: "yes", qoq: 0.05 },
  // BabyPips Cowabunga / School end-of-course checklist defaults
  // Source: https://www.babypips.com/trading/cowabunga-system
  babypips: {
    emaFast: 5,
    emaSlow: 10,
    higherTfBars: 5,
    rsiPeriod: 9,
    rsiMid: 50,
    stochK: 10,
    stochD: 3,
    stochSmooth: 3,
    stochOb: 80,
    stochOs: 20,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9,
    swingBars: 20,
    rrMin: 1,
    maxStopPct: 8,
    crossLookback: 5
  }
};

function loadRules() {
  try {
    const s = JSON.parse(localStorage.getItem("scan-rules") || "null");
    if (s && s.loose) {
      const base = JSON.parse(JSON.stringify(DEFAULT_RULES));
      const baby = Object.assign({}, base.babypips, s.babypips || {});
      // Migrate older week-plus keys into Cowabunga defaults when missing.
      if (baby.emaFast == null) {
        Object.assign(baby, base.babypips);
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

function emaSeries(values, period) {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let avgG = g / period, avgL = l / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgG = (avgG * (period - 1) + gain) / period;
    avgL = (avgL * (period - 1) + loss) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function stochasticSeries(highs, lows, closes, kPeriod, smooth, dPeriod) {
  const rawK = new Array(closes.length).fill(null);
  for (let i = kPeriod - 1; i < closes.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hi) hi = highs[j];
      if (lows[j] < lo) lo = lows[j];
    }
    rawK[i] = hi === lo ? 50 : ((closes[i] - lo) / (hi - lo)) * 100;
  }
  const k = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i < kPeriod - 1 + smooth - 1) continue;
    let s = 0, c = 0;
    for (let j = i - smooth + 1; j <= i; j++) {
      if (rawK[j] == null) { c = 0; break; }
      s += rawK[j]; c++;
    }
    if (c === smooth) k[i] = s / smooth;
  }
  const d = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (k[i] == null) continue;
    let s = 0, c = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (j < 0 || k[j] == null) { c = 0; break; }
      s += k[j]; c++;
    }
    if (c === dPeriod) d[i] = s / dPeriod;
  }
  return { k, d };
}

function macdHistSeries(closes, fast, slow, signal) {
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macd = closes.map((_, i) => (emaFast[i] == null || emaSlow[i] == null) ? null : emaFast[i] - emaSlow[i]);
  const macdVals = [];
  const map = [];
  for (let i = 0; i < macd.length; i++) {
    if (macd[i] == null) continue;
    map.push(i);
    macdVals.push(macd[i]);
  }
  const sigSparse = emaSeries(macdVals, signal);
  const hist = new Array(closes.length).fill(null);
  for (let j = 0; j < map.length; j++) {
    if (sigSparse[j] == null) continue;
    hist[map[j]] = macdVals[j] - sigSparse[j];
  }
  return hist;
}

function resampleOHLC(bars, every) {
  const out = [];
  for (let i = 0; i < bars.length; i += every) {
    const chunk = bars.slice(i, i + every);
    if (!chunk.length) continue;
    out.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map((b) => b.high)),
      low: Math.min(...chunk.map((b) => b.low)),
      close: chunk[chunk.length - 1].close
    });
  }
  return out;
}

function recentSwing(lows, highs, bars, side) {
  const start = Math.max(0, lows.length - bars);
  if (side === "low") {
    let v = Infinity, idx = -1;
    for (let i = start; i < lows.length - 1; i++) {
      if (lows[i] < v) { v = lows[i]; idx = i; }
    }
    return idx < 0 ? null : v;
  }
  let v = -Infinity, idx = -1;
  for (let i = start; i < highs.length - 1; i++) {
    if (highs[i] > v) { v = highs[i]; idx = i; }
  }
  return idx < 0 ? null : v;
}
