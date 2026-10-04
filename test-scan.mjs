import fs from "fs";
import vm from "vm";
import assert from "assert";

const src = fs.readFileSync(new URL("./scan-logic.js", import.meta.url), "utf8");
const sandbox = { localStorage: { getItem: () => null, setItem() {} }, console, Date, Math, Number, JSON, Object, Array, String };
vm.createContext(sandbox);
vm.runInContext(src + "\nglobalThis.__t = { PAGE_SIZE, CONFIDENCE_BLURB, DEFAULT_RULES, fiveChecks, passesLoose, tightChecks, weekPlus, babySignal, parseNextEvent, parseListedEvent, confidenceFromChecks, sizeFromScore, parseNews, isMaterialHeadline, newsMoveLine, newsAgeText, etaLine, shouldPaintEta, pageWindow, pageLabel, compareRows, eventText, calendarDays, searchUniverse, topByTraded, sortByTraded, sumLastVolumes, zoomWindow, panWindow, scanPayload, formatVolume, quoteFromChart, formatDayMove, yahooQuoteUrl, SCAN_STORE };\n", sandbox);
const t = sandbox.__t;
const rules = t.DEFAULT_RULES;

assert.equal(t.PAGE_SIZE, 100);
assert.equal(t.pageWindow(1000, 0, 100).pages, 10);
assert.equal(t.pageWindow(1000, 9, 100).start, 900);
assert.equal(t.pageWindow(0, 0, 100).pages, 1);
assert.equal(t.pageWindow(101, 1, 100).end, 101);
assert.equal(t.pageLabel(0, 10, 1000), "page 1 of 10 · 1000");
assert.match(t.CONFIDENCE_BLURB, /6 tight/);
assert.match(t.CONFIDENCE_BLURB, /6 technical/);
assert.match(t.CONFIDENCE_BLURB, /Halved if an event is inside 5 days/);
assert.match(t.CONFIDENCE_BLURB, /adds 10/);
assert.match(t.CONFIDENCE_BLURB, /miss subtracts 10/);
assert.equal(t.etaLine(125000), "Estimated time of completion 2m 5s");
assert.equal(t.shouldPaintEta(10000, 4000, false), true);
assert.equal(t.shouldPaintEta(8000, 4000, false), false);
assert.equal(t.shouldPaintEta(8000, 4000, true), true);

const all = [true, true, true, true, true, true];
const half = [true, true, true, false, false, false];
assert.equal(t.confidenceFromChecks(all, all, null), 100);
assert.equal(t.confidenceFromChecks(half, half, null), 50);
assert.equal(t.confidenceFromChecks(all, all, { kind: "earnings", days: 3, beat: null }), 50);
assert.equal(t.confidenceFromChecks(all, all, { kind: "earnings", days: -3, beat: true }), 60);
assert.equal(t.confidenceFromChecks(all, all, { kind: "earnings", days: -3, beat: false }), 40);
assert.equal(t.confidenceFromChecks([false, false, false, false, false, false], [false, false, false, false, false, false], { kind: "earnings", days: -1, beat: false }), 0);
assert.equal(t.sizeFromScore(80, null), "high");
assert.equal(t.sizeFromScore(79, null), "medium");
assert.equal(t.sizeFromScore(50, null), "medium");
assert.equal(t.sizeFromScore(49, null), "low");
assert.equal(t.sizeFromScore(100, { kind: "earnings", days: 3, beat: null }), "low");
assert.equal(t.sizeFromScore(100, { kind: "earnings", days: -2, beat: true }), "low");
assert.equal(t.sizeFromScore(90, { kind: "meeting", days: 30, beat: null }), "high");
assert.equal(t.sizeFromScore(40, { kind: "meeting", days: 30, beat: null }), "low");
assert.equal(t.confidenceFromChecks(all, all, { kind: "meeting", days: 30, beat: null }), 100);

assert.equal(t.eventText("earnings", 3), "Earnings in 3 days");
assert.equal(t.eventText("earnings", 1), "Earnings in 1 day");
assert.equal(t.eventText("earnings", -3), "Earnings 3 days ago");
assert.equal(t.eventText("earnings", -1), "Earnings 1 day ago");
assert.equal(t.eventText("meeting", 30), "Meeting in 30 days");
assert.equal(t.eventText("meeting", 0), "Meeting today");

const now = Date.UTC(2026, 9, 3, 15, 0, 0);
function ev(days, beat) {
  return { event: { kind: "earnings", days, beat, text: "x" }, order: days };
}
const rows = [
  ev(1, null),
  ev(30, null),
  ev(-3, true),
  ev(-40, false),
  { event: null, order: 0 }
];
rows.forEach((r, i) => { r.symbol = "S" + i; r.name = "N" + i; r.order = i; });
const soon = rows.slice().sort((a, b) => t.compareRows(a, b, "event", "up")).map((r) => r.event && r.event.days);
const far = rows.slice().sort((a, b) => t.compareRows(a, b, "event", "down")).map((r) => r.event && r.event.days);
assert.deepEqual(soon, [1, 30, -3, -40, null]);
assert.deepEqual(far, [-40, -3, 30, 1, null]);

const names = [
  { symbol: "MSFT", name: "Beta", loosePass: true, tightPass: false, baby: "sell", confidence: 20, size: "low", order: 0 },
  { symbol: "AAPL", name: "Alpha", loosePass: true, tightPass: true, baby: "buy", confidence: 90, size: "high", order: 1 },
  { symbol: "ZZZ", name: "Gamma", loosePass: true, tightPass: true, baby: "hold", confidence: 55, size: "medium", order: 2 }
];
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "ticker", "up")).map((r) => r.symbol), ["AAPL", "MSFT", "ZZZ"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "ticker", "down")).map((r) => r.symbol), ["ZZZ", "MSFT", "AAPL"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "name", "up")).map((r) => r.name), ["Alpha", "Beta", "Gamma"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "tech", "up")).map((r) => r.baby), ["buy", "hold", "sell"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "tech", "down")).map((r) => r.baby), ["sell", "hold", "buy"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "confidence", "down")).map((r) => r.confidence), [90, 55, 20]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "confidence", "up")).map((r) => r.confidence), [20, 55, 90]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "size", "down")).map((r) => r.size), ["high", "medium", "low"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "size", "up")).map((r) => r.size), ["low", "medium", "high"]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "tight", "up")).map((r) => r.tightPass), [true, true, false]);
assert.deepEqual(names.slice().sort((a, b) => t.compareRows(a, b, "tight", "down")).map((r) => r.tightPass), [false, true, true]);

const day = 86400;
const reported = Math.floor(now / 1000) - 3 * day;
const upcoming = Math.floor(now / 1000) + 26 * day;
const row = {
  calendarEvents: { earnings: { earningsDate: [{ raw: upcoming }] } },
  earnings: { earningsChart: { quarterly: [{ reportedDate: { raw: reported }, actual: { raw: 2.1 }, estimate: { raw: 1.9 } }] } }
};
const parsed = t.parseNextEvent(row, now);
assert.equal(parsed.text, "Earnings 3 days ago");
assert.equal(parsed.beat, true);
const futureOnly = { calendarEvents: { earnings: { earningsDate: [{ raw: Math.floor(now / 1000) + 3 * day }] } } };
assert.equal(t.parseNextEvent(futureOnly, now).text, "Earnings in 3 days");
assert.equal(t.parseNextEvent(futureOnly, now).beat, null);
const miss = { earnings: { earningsChart: { quarterly: [{ reportedDate: { raw: reported }, actual: { raw: 1 }, estimate: { raw: 2 } }] } } };
assert.equal(t.parseNextEvent(miss, now).text, "Earnings 3 days ago");
assert.equal(t.parseNextEvent(miss, now).beat, false);
const meeting = { shareholderMeeting: { date: { raw: Math.floor(now / 1000) + 30 * day } } };
const meet = t.parseNextEvent(meeting, now);
assert.equal(meet.kind, "meeting");
assert.equal(meet.text, "Meeting in 30 days");
assert.equal(meet.beat, null);

const chartOnly = { earnings: { earningsChart: { earningsDate: [{ raw: Math.floor(now / 1000) + 3 * day }] } } };
assert.equal(t.parseNextEvent(chartOnly, now).text, "Earnings in 3 days");
assert.equal(t.parseNextEvent(chartOnly, now).beat, null);
const meetDate = { calendarEvents: { shareholderMeetingDate: { raw: Math.floor(now / 1000) + 30 * day } } };
assert.equal(t.parseNextEvent(meetDate, now).text, "Meeting in 30 days");
assert.equal(t.parseNextEvent(meetDate, now).kind, "meeting");
assert.equal(t.parseNextEvent({}, now), null);

const quote = {
  summaryDetail: { trailingPE: { raw: 20 }, forwardPE: { raw: 18 } },
  defaultKeyStatistics: { pegRatio: { raw: 1.1 } },
  financialData: { debtToEquity: { raw: 40 }, revenueGrowth: { raw: 0.2 } },
  earningsHistory: { history: [{ epsActual: { raw: 2 }, epsEstimate: { raw: 1 } }] },
  earnings: { financialsChart: { quarterly: [{ revenue: { raw: 100 } }, { revenue: { raw: 120 } }] } }
};
const closes = [];
let price = 50;
for (let i = 0; i < 210; i++) { price += 0.2; closes.push(price); }
assert.equal(t.tightChecks(quote, closes, rules).length, 6);
assert.equal(t.weekPlus(closes, rules).checks.length, 6);
const loose = t.fiveChecks(quote, closes, rules);
assert.equal(loose.length, 5);
assert.equal(t.passesLoose(quote, closes, rules), loose.every(Boolean));
const tightFail = t.tightChecks({ summaryDetail: {}, financialData: {}, defaultKeyStatistics: {} }, closes, rules);
assert.equal(tightFail.every(Boolean), false);

function series(n, fn) { const a = []; for (let i = 0; i < n; i++) a.push(fn(i)); return a; }
const down = series(220, (i) => 200 - i * 0.6);
assert.equal(t.babySignal(down, rules), "sell");
const downPack = t.weekPlus(down, rules);
assert.ok(downPack.last < downPack.trend && downPack.last < downPack.higher, "sell is under 50 and under 200");
const riseThenSoft = series(220, (i) => i < 200 ? 40 + i * 0.5 : 140 - (i - 200) * 0.4);
const soft = t.weekPlus(riseThenSoft, rules);
if (soft.last < soft.trend && soft.last > soft.higher) assert.notEqual(soft.signal, "sell");
assert.equal(t.babySignal(series(30, () => 100), rules), "hold");
assert.equal(t.babySignal([], rules), "hold");
assert.equal(rules.babypips.rrMin, 1.5);
assert.equal(rules.babypips.rewardBars, 126);
assert.equal(rules.babypips.pullbackPct, 8);
assert.ok(!rules.babypips.emaFast, "week-plus rules, not Cowabunga");

const board = fs.readFileSync(new URL("./board.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./styles.css", import.meta.url), "utf8");
assert.match(html, /scan-logic\.js/);
assert.match(board, /PAGE_SIZE/);
assert.match(board, /Fundamentals/);
assert.match(board, /Technical analysis/);
assert.doesNotMatch(board, /CONFIDENCE_BLURB/);
assert.match(board, /sortKey: "confidence"/);
assert.match(board, /className = "htxt"/);
assert.match(board, /pack\.times/);
assert.match(board, /axisDate/);
assert.match(board, /shouldPaintEta/);
assert.match(board, /Loose/);
assert.match(board, /Tight/);
assert.doesNotMatch(board, /Cowabunga|emaFast/);
assert.match(css, /button\.arr/);
assert.match(css, /button\.htxt/);
assert.match(css, /#fff/);
assert.match(css, /#000/);
assert.match(css, /\.ev\.beat/);
assert.match(css, /\.ev\.miss/);
assert.equal((board.match(/pageSize = 10|\/ 10/g) || []).length, 0);

const tradedNames = [
  { symbol: "NVDA", name: "NVIDIA", traded: 50 },
  { symbol: "AAPL", name: "Apple", traded: 10 },
  { symbol: "MSFT", name: "Microsoft", traded: 30 },
  { symbol: "ZZZ", name: "Zeta", traded: 5 }
];
assert.deepEqual(t.topByTraded(tradedNames, 2).map((r) => r.symbol), ["NVDA", "MSFT"]);
assert.deepEqual(t.sortByTraded(t.topByTraded(tradedNames, 3), "up").map((r) => r.symbol), ["AAPL", "MSFT", "NVDA"]);
assert.deepEqual(t.sortByTraded(t.topByTraded(tradedNames, 3), "down").map((r) => r.symbol), ["NVDA", "MSFT", "AAPL"]);
assert.deepEqual(t.searchUniverse(tradedNames, "nv"), []);
assert.deepEqual(t.searchUniverse(tradedNames, "nvi").map((r) => r.symbol), ["NVDA"]);
assert.deepEqual(t.searchUniverse(tradedNames, "app").map((r) => r.symbol), ["AAPL"]);
assert.equal(t.sumLastVolumes([1, 2, 3, 4, 5, 6, 7, 8], 7), 35);
assert.equal(t.formatVolume(128359887), "128.4M");
const z = t.zoomWindow(0, 100, 200, 0.5, true);
assert.ok(z.end - z.start < 100);
const pan = t.panWindow(0, 50, 200, 10);
assert.deepEqual(pan, { start: 10, end: 60 });
const saved = t.scanPayload([{ order: 1, symbol: "AAPL", name: "Apple", loosePass: true, tightPass: false, baby: "hold", confidence: 40, size: "low", event: null, closes: [1, 2, 3] }], 2, "ticker", "down");
assert.equal(saved.passes[0].closes, undefined);
assert.equal(saved.passes[0].symbol, "AAPL");
assert.equal(saved.page, 2);
assert.equal(t.SCAN_STORE, "scan-stocks-v1");
assert.equal(t.yahooQuoteUrl("BRK.B"), "https://finance.yahoo.com/quote/BRK.B");
assert.match(board, /sessionStorage/);
assert.match(board, /Scanners/);
assert.match(board, /ETFs/);
assert.match(board, /Commodities/);
assert.match(board, /searchUniverse/);
assert.match(board, /zoomWindow/);
assert.match(board, /Open in Yahoo Finance/);
assert.match(html, /id="suggest"/);
assert.doesNotMatch(html, /type="submit"/);
assert.match(css, /\.wide /);
assert.match(css, /\.cats\.home/);


const upChart = { chart: { result: [{ meta: { regularMarketPrice: 333.69, regularMarketChangePercent: 1.02 }, indicators: { quote: [{ close: [330.32, 333.69] }] } }] } };
const upQ = t.quoteFromChart(upChart);
assert.equal(upQ.last, 333.69);
assert.equal(upQ.pct, 1.02);
assert.ok(Math.abs(upQ.chg - (333.69 - 333.69 / 1.0102)) < 1e-9);
assert.equal(t.formatDayMove(upQ.chg, upQ.pct), "+3.37 +1.02%");
const downChart = { chart: { result: [{ meta: { regularMarketPrice: 100, regularMarketChangePercent: -2.5 }, indicators: { quote: [{ close: [102.56, 100] }] } }] } };
const downQ = t.quoteFromChart(downChart);
assert.ok(downQ.chg < 0);
assert.equal(t.formatDayMove(downQ.chg, downQ.pct), "-2.56 -2.50%");
const barsOnly = { chart: { result: [{ meta: {}, indicators: { quote: [{ close: [10, 11] }] } }] } };
const barQ = t.quoteFromChart(barsOnly);
assert.equal(barQ.last, 11);
assert.equal(barQ.chg, 1);
assert.equal(barQ.pct, 10);
assert.equal(t.quoteFromChart({}), null);
assert.equal(t.formatDayMove(null, 1), "");
assert.match(board, /quoteFromChart/);
assert.match(board, /formatDayMove/);
assert.match(css, /\.qchg\.up/);
assert.match(css, /\.qchg\.down/);
assert.doesNotMatch(board, /regularMarketPrice:\s*\d/);


assert.equal(t.confidenceFromChecks(all, all, null, { material: true }), 50);
assert.equal(t.confidenceFromChecks(all, all, { kind: "earnings", days: 3, beat: null }, { material: true }), 50);
assert.equal(t.confidenceFromChecks(all, all, { kind: "meeting", days: 30, beat: null }, { material: false }), 100);
assert.equal(t.sizeFromScore(100, null, { material: true }), "low");
assert.equal(t.sizeFromScore(100, { kind: "meeting", days: 30, beat: null }, { material: true }), "low");
assert.equal(t.sizeFromScore(90, { kind: "meeting", days: 30, beat: null }, null), "high");

const olderPast = {
  calendarEvents: { earnings: { earningsDate: [{ raw: Math.floor(now / 1000) + 3 * day }] } },
  earnings: { earningsChart: { quarterly: [{ reportedDate: { raw: Math.floor(now / 1000) - 40 * day }, actual: { raw: 2 }, estimate: { raw: 1 } }] } }
};
assert.equal(t.parseNextEvent(olderPast, now).text, "Earnings 40 days ago");
assert.equal(t.parseNextEvent(olderPast, now).beat, true);

const chartEarn = { chartEarnings: { "1": { date: Math.floor(now / 1000) - 3 * day, epsActual: 1.1, epsEstimate: 1.4 } } };
assert.equal(t.parseNextEvent(chartEarn, now).text, "Earnings 3 days ago");
assert.equal(t.parseNextEvent(chartEarn, now).beat, false);
assert.equal(t.parseListedEvent({}, { earnings: { "1": { date: Math.floor(now / 1000) + 3 * day } } }, now).text, "Earnings in 3 days");
assert.equal(t.parseListedEvent({}, { dividends: { "1": { date: Math.floor(now / 1000) - 1 * day, amount: 1 } } }, now), null);

const newsNow = now;
const newsPayload = { news: [
  { title: "Energy roundup", link: "https://finance.yahoo.com/m/roundup.html", providerPublishTime: Math.floor(newsNow / 1000) - 1 * day },
  { title: "Wells Fargo Downgrade hits Exxon", link: "https://finance.yahoo.com/news/downgrade.html", providerPublishTime: Math.floor(newsNow / 1000) - 2 * day },
  { title: "Old oil note", link: "https://finance.yahoo.com/news/old.html", providerPublishTime: Math.floor(newsNow / 1000) - 20 * day }
]};
const parsedNews = t.parseNews(newsPayload, newsNow);
assert.equal(parsedNews.title, "Energy roundup");
assert.equal(parsedNews.link, "https://finance.yahoo.com/m/roundup.html");
assert.equal(parsedNews.text, "1 day ago");
assert.equal(parsedNews.material, true);
assert.equal(parsedNews.materialTitle, "Wells Fargo Downgrade hits Exxon");
assert.equal(t.isMaterialHeadline("AI and Oil Shape Market Leadership"), true);
assert.equal(t.isMaterialHeadline("Energy roundup"), false);
assert.equal(t.parseNews({ news: [] }, newsNow), null);
assert.equal(t.parseNews({ news: [{ title: "No link" }] }, newsNow), null);
const line = t.newsMoveLine(parsedNews);
assert.match(line, /Headline 2 days ago/);
assert.match(line, /Downgrade/);
assert.match(line, /Headline only/);
assert.doesNotMatch(line, /article says|full story|we read/);
const namesNews = names.map((r, i) => Object.assign({}, r, { news: i === 0 ? { days: -1, title: "a", link: "https://e.example/a" } : i === 1 ? { days: -4, title: "b", link: "https://e.example/b" } : null }));
assert.deepEqual(namesNews.slice().sort((a, b) => t.compareRows(a, b, "news", "down")).map((r) => r.symbol), ["MSFT", "AAPL", "ZZZ"]);

assert.match(board, /titleWithArrows\("Event"/);
assert.doesNotMatch(board, /Next event/);
assert.match(board, /titleWithArrows\("News"/);
assert.match(board, /parseListedEvent/);
assert.match(board, /parseNews/);
assert.match(board, /newsMoveLine/);
assert.match(board, /loadNews/);
assert.match(css, /\.news a/);
assert.match(board, /sortKey: "confidence"/);
assert.match(board, /quote-card/);
assert.match(board, /Most traded, 7 days/);


console.log("ok — stocks scan tests passed");
