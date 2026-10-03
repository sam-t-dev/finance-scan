const PAGE_SIZE = 100;

const CONFIDENCE_BLURB = "Percent of 6 tight and 6 technical checks. Halved if an event is inside 5 days. A beat in the last 5 days adds 10; a miss subtracts 10.";

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

function passesLoose(row, closes, rules) {
  return fiveChecks(row, closes, rules).every(Boolean);
}

function qoqRevenue(row) {
  const q = row.earnings && row.earnings.financialsChart && row.earnings.financialsChart.quarterly;
  if (!Array.isArray(q) || q.length < 2) return null;
  const prev = num(q[q.length - 2].revenue);
  const last = num(q[q.length - 1].revenue);
  if (prev == null || last == null || !prev) return null;
  return (last - prev) / Math.abs(prev);
}

function tightChecks(row, closes, rules) {
  const t = rules.tight;
  const pe = num(row.summaryDetail && row.summaryDetail.trailingPE);
  const fpe = num((row.summaryDetail && row.summaryDetail.forwardPE) || (row.defaultKeyStatistics && row.defaultKeyStatistics.forwardPE));
  const deRaw = num(row.financialData && row.financialData.debtToEquity);
  const de = deRaw != null ? deRaw / 100 : null;
  const r = rsi(closes, 14);
  const eh = row.earningsHistory && row.earningsHistory.history;
  let eps = null;
  if (Array.isArray(eh) && eh.length) {
    const last = eh[eh.length - 1];
    const a = num(last.epsActual), e = num(last.epsEstimate);
    if (a != null && e) eps = (a - e) / Math.abs(e);
  }
  const qoq = qoqRevenue(row);
  const epsBox = t.epsBeat === "no" ? true : (eps != null && eps > 0);
  return [
    pe != null && pe < t.pe,
    fpe != null && fpe < t.fpe,
    r != null && r >= t.rsiLow && r <= t.rsiHigh,
    de != null && de < t.de,
    epsBox,
    qoq != null && qoq > t.qoq
  ];
}

function weekPlus(closes, rules) {
  const b = rules.babypips;
  const last = closes[closes.length - 1];
  const trend = sma(closes, b.trendMa);
  const higher = sma(closes, b.higherMa);
  const trendSlope = slope(closes, b.trendMa, b.slopeBars);
  const r = rsi(closes, 14);
  const bars = b.rewardBars || 126;
  const window = closes.slice(-bars);
  const swingHigh = window.length ? Math.max.apply(null, window) : last;
  const dist = trend != null && trend > 0 ? (last - trend) / trend * 100 : null;
  const risk = trend != null ? last - trend : 0;
  const reward = swingHigh - last;
  const rr = risk > 0 ? reward / risk : 0;
  const aboveTrend = trend != null && last > trend;
  const aboveHigher = higher != null && last > higher;
  const rising = trendSlope != null && trendSlope > 0;
  const rsiOk = r != null && r >= b.rsiMin && r <= b.rsiChase;
  const pullback = dist != null && dist >= 0 && dist <= b.pullbackPct;
  const rrOk = rr >= b.rrMin;
  const checks = [aboveTrend, aboveHigher, rising, rsiOk, pullback, rrOk];
  const up = trend != null && last > trend && trendSlope != null && trendSlope > 0 && (higher == null || last > higher);
  const down = trend != null && last < trend && trendSlope != null && trendSlope < 0;
  const sell = down && higher != null && last < higher;
  const buy = up && rsiOk && pullback && rrOk;
  let signal = "hold";
  if (buy) signal = "buy";
  else if (sell) signal = "sell";
  return { signal, checks, last, trend, higher, trendSlope, r, dist, risk, reward, rr, bars, swingHigh, closes };
}

function babySignal(closes, rules) {
  if (!closes || closes.length < 2) return "hold";
  return weekPlus(closes, rules).signal;
}

function calendarDays(unixSeconds, nowMs) {
  const event = new Date(unixSeconds * 1000);
  const now = new Date(nowMs);
  const e = Date.UTC(event.getFullYear(), event.getMonth(), event.getDate());
  const n = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((e - n) / 86400000);
}

function eventText(kind, days) {
  const word = kind === "meeting" ? "Meeting" : "Earnings";
  if (days === 0) return word + " today";
  if (days > 0) {
    return word + " in " + days + (days === 1 ? " day" : " days");
  }
  const n = Math.abs(days);
  return word + " " + n + (n === 1 ? " day ago" : " days ago");
}

function unixOf(v) {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v.raw != null) return num(v.raw);
  return null;
}

function parseNextEvent(row, nowMs) {
  const now = nowMs == null ? Date.now() : nowMs;
  const candidates = [];
  const earnings = row && row.calendarEvents && row.calendarEvents.earnings;
  const upcoming = earnings && earnings.earningsDate;
  if (Array.isArray(upcoming) && upcoming.length) {
    const u = unixOf(upcoming[0]);
    if (u) candidates.push({ kind: "earnings", unix: u, beat: null });
  }
  const quarterly = row && row.earnings && row.earnings.earningsChart && row.earnings.earningsChart.quarterly;
  if (Array.isArray(quarterly) && quarterly.length) {
    const last = quarterly[quarterly.length - 1];
    const u = unixOf(last.reportedDate);
    const actual = num(last.actual);
    const estimate = num(last.estimate);
    let beat = null;
    if (actual != null && estimate != null && actual !== estimate) beat = actual > estimate;
    if (u) candidates.push({ kind: "earnings", unix: u, beat });
  }
  const meeting = row && (row.shareholderMeeting || (row.calendarEvents && row.calendarEvents.shareholderMeeting));
  const meetingUnix = unixOf(meeting && (meeting.date || meeting.startDate || meeting));
  if (meetingUnix) candidates.push({ kind: "meeting", unix: meetingUnix, beat: null });
  if (!candidates.length) return null;
  candidates.forEach((c) => { c.days = calendarDays(c.unix, now); });
  candidates.sort((a, b) => {
    const da = Math.abs(a.days), db = Math.abs(b.days);
    if (da !== db) return da - db;
    const aKnown = a.beat != null, bKnown = b.beat != null;
    if (aKnown !== bKnown) return aKnown ? -1 : 1;
    if ((a.days >= 0) !== (b.days >= 0)) return a.days >= 0 ? -1 : 1;
    return 0;
  });
  const best = candidates[0];
  const beat = best.kind === "earnings" && best.days <= 0 ? best.beat : null;
  return { kind: best.kind, days: best.days, beat, text: eventText(best.kind, best.days) };
}

function confidenceFromChecks(tight, tech, event) {
  const checks = (tight || []).concat(tech || []);
  const total = checks.length || 1;
  let score = Math.round(100 * checks.filter(Boolean).length / total);
  if (event && event.days != null && Math.abs(event.days) <= 5) score = Math.round(score / 2);
  if (event && event.kind === "earnings" && event.days != null && event.days <= 0 && event.days >= -5 && event.beat != null) {
    score += event.beat ? 10 : -10;
  }
  return Math.max(0, Math.min(100, score));
}

function sizeFromScore(score, event) {
  const order = ["low", "medium", "high"];
  let size = score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  if (event && event.kind === "earnings" && event.days != null && event.days <= 0 && event.days >= -5 && event.beat != null) {
    let i = order.indexOf(size) + (event.beat ? 1 : -1);
    if (i < 0) i = 0;
    if (i > 2) i = 2;
    size = order[i];
  }
  if (event && event.days != null && Math.abs(event.days) <= 5) size = "low";
  return size;
}

function fmtEta(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return r + "s";
  return m + "m " + r + "s";
}

function etaLine(ms) {
  return "Estimated time of completion " + fmtEta(ms);
}

function shouldPaintEta(now, last, force) {
  if (force) return true;
  if (last == null) return true;
  return now - last >= 5000;
}

function pageWindow(len, page, pageSize) {
  const size = pageSize || PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(len / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { pages, page: p, start: p * size, end: Math.min(len, p * size + size) };
}

function pageLabel(pageIndex, pages, count) {
  return "page " + (pageIndex + 1) + " of " + pages + " · " + count;
}

function eventSortKey(ev, up) {
  if (!ev || ev.days == null) return [2, 0];
  if (up) {
    if (ev.days >= 0) return [0, ev.days];
    return [1, -ev.days];
  }
  if (ev.days < 0) return [0, ev.days];
  return [1, -ev.days];
}

function compareRows(a, b, key, dir) {
  const up = dir !== "down";
  const tie = (a.order || 0) - (b.order || 0);
  if (key === "ticker") return (up ? 1 : -1) * a.symbol.localeCompare(b.symbol) || tie;
  if (key === "name") return (up ? 1 : -1) * a.name.localeCompare(b.name) || tie;
  if (key === "loose" || key === "tight") {
    const field = key === "loose" ? "loosePass" : "tightPass";
    const rank = (row) => row[field] ? 0 : 1;
    const d = rank(a) - rank(b);
    return (up ? d : -d) || tie;
  }
  if (key === "tech") {
    const order = { buy: 0, hold: 1, sell: 2 };
    const rank = (row) => row.baby && order[row.baby] != null ? order[row.baby] : 9;
    if (rank(a) === 9 && rank(b) === 9) return tie;
    if (rank(a) === 9) return 1;
    if (rank(b) === 9) return -1;
    const d = rank(a) - rank(b);
    return (up ? d : -d) || tie;
  }
  if (key === "confidence") {
    if (a.confidence == null && b.confidence == null) return tie;
    if (a.confidence == null) return 1;
    if (b.confidence == null) return -1;
    const d = a.confidence - b.confidence;
    return (up ? d : -d) || tie;
  }
  if (key === "size") {
    const order = { low: 0, medium: 1, high: 2 };
    const rank = (row) => row.size && order[row.size] != null ? order[row.size] : 9;
    if (rank(a) === 9 && rank(b) === 9) return tie;
    if (rank(a) === 9) return 1;
    if (rank(b) === 9) return -1;
    const d = rank(a) - rank(b);
    return (up ? d : -d) || tie;
  }
  if (key === "event") {
    const ka = eventSortKey(a.event, up);
    const kb = eventSortKey(b.event, up);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1] - kb[1] || tie;
  }
  return tie;
}

function explainPack(closes, rules) {
  const pack = weekPlus(closes, rules);
  const b = rules.babypips;
  const lines = [];
  lines.push(pack.signal === "buy" ? "Buy, because the week-plus checklist cleared." : pack.signal === "sell" ? "Sell, because price is under the 50-day and under the 200-day." : "Hold, because at least one entry box failed.");
  lines.push("Price is " + pack.last.toFixed(2) + ". The 50-day is " + (pack.trend ? pack.trend.toFixed(2) : "missing") + " and the 200-day is " + (pack.higher ? pack.higher.toFixed(2) : "missing") + ".");
  lines.push(pack.trendSlope > 0 ? "The 50-day is rising, so the trend gate passes." : "The 50-day is not rising, so the trend gate fails.");
  lines.push(pack.dist != null && pack.dist >= 0 && pack.dist <= b.pullbackPct ? "It is " + pack.dist.toFixed(1) + "% above the 50-day, inside the " + b.pullbackPct + "% pullback band." : "It is " + (pack.dist == null ? "not" : pack.dist.toFixed(1) + "%") + " above the 50-day, outside the " + b.pullbackPct + "% pullback band.");
  lines.push(pack.r != null && pack.r >= b.rsiMin && pack.r <= b.rsiChase ? "RSI is " + pack.r.toFixed(0) + ", not chased." : "RSI is " + (pack.r == null ? "missing" : pack.r.toFixed(0)) + ", outside " + b.rsiMin + " to " + b.rsiChase + ".");
  lines.push("Stop is a close under the 50-day, " + pack.risk.toFixed(2) + " away. The " + pack.bars + "-session high is " + pack.swingHigh.toFixed(2) + ", " + pack.reward.toFixed(2) + " above. Reward to risk is " + pack.rr.toFixed(1) + " against a minimum of " + b.rrMin + ".");
  pack.lines = lines;
  return pack;
}
