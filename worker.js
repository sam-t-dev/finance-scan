const FILES = {}; // BUILD_FILES
const ROUTES = {
  "/index.html": "index.html",
  "/": "index.html",
  "/board.js": "board.js",
  "/scan-logic.js": "scan-logic.js",
  "/styles.css": "styles.css",
  "/rules.html": "rules.html",
  "/rules": "rules.html",
  "/rules-page.js": "rules-page.js",
  "/about.html": "about.html",
  "/about": "about.html",
  "/universe.json": "universe.json"
};

const ALLOW_ORIGIN = "*";
const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};
const QUOTE_MODULES = "price,summaryDetail,defaultKeyStatistics,financialData,earningsHistory,calendarEvents,earnings";

function cookieHeader(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie().slice() : [];
  if (!list.length) {
    const one = res.headers.get("set-cookie");
    if (one) list.push(one);
  }
  return list.map((c) => String(c).split(";")[0]).filter(Boolean).join("; ");
}

function mergeCookie(a, b) {
  return [a, b].filter(Boolean).join("; ");
}

let quoteSession = null;

function goodCrumb(crumb) {
  return !!crumb && crumb.length >= 6 && crumb.length <= 40 && crumb.indexOf(" ") === -1 && crumb.indexOf("<") === -1;
}

function decodeCrumb(raw) {
  return String(raw || "").replace(/\\u002F/g, "/").replace(/\\\//g, "/").trim();
}

async function yahooSession(force) {
  if (!force && quoteSession && Date.now() - quoteSession.at < 20 * 60 * 1000 && goodCrumb(quoteSession.crumb)) return quoteSession;
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const seed = await fetch("https://fc.yahoo.com", { headers: { "user-agent": ua, accept: "text/html" }, redirect: "manual" });
  let cookie = cookieHeader(seed);
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "user-agent": ua, cookie, accept: "*/*" }
  });
  let crumb = (await crumbRes.text()).trim();
  if (!goodCrumb(crumb)) {
    const page = await fetch("https://finance.yahoo.com/quote/AAPL", {
      headers: { "user-agent": ua, cookie, accept: "text/html" }
    });
    cookie = mergeCookie(cookie, cookieHeader(page));
    const html = await page.text();
    const m = html.match(/"crumb":"([^"]+)"/);
    crumb = m ? decodeCrumb(m[1]) : "";
  }
  if (!goodCrumb(crumb)) return { ua, cookie, crumb: "", at: 0 };
  quoteSession = { ua, cookie, crumb, at: Date.now() };
  return quoteSession;
}

async function yahooQuote(symbol) {
  let sess = await yahooSession(false);
  const headers = (s) => ({ "user-agent": s.ua, cookie: s.cookie, accept: "application/json" });
  const targetFor = (s) => "https://query2.finance.yahoo.com/v10/finance/quoteSummary/" + encodeURIComponent(symbol) + "?modules=" + QUOTE_MODULES + "&crumb=" + encodeURIComponent(s.crumb || "");
  let up = await fetch(targetFor(sess), { headers: headers(sess) });
  if (up.status === 401) {
    quoteSession = null;
    sess = await yahooSession(true);
    up = await fetch(targetFor(sess), { headers: headers(sess) });
  }
  return up;
}

async function yahooNews(symbol) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const target = "https://query1.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(symbol) + "&quotesCount=0&newsCount=8&enableFuzzyQuery=false";
  return fetch(target, { headers: { "user-agent": ua, accept: "application/json" } });
}

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname.startsWith("/yahoo/chart")) {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const range = url.searchParams.get("range") || "1y";
      const interval = url.searchParams.get("interval") || "1d";
      const target = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=" + encodeURIComponent(range) + "&interval=" + encodeURIComponent(interval) + "&events=div%7Csplit%7Cearn";
      const up = await fetch(target, { headers: { "user-agent": "Mozilla/5.0" } });
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (url.pathname.startsWith("/yahoo/quote")) {
      const symbol = url.searchParams.get("symbol") || url.searchParams.get("symbols") || "AAPL";
      const up = await yahooQuote(symbol);
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (url.pathname.startsWith("/yahoo/news")) {
      const symbol = url.searchParams.get("symbol") || url.searchParams.get("q") || "AAPL";
      const up = await yahooNews(symbol);
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
    }
    const name = ROUTES[url.pathname] || "index.html";
    const file = FILES[name];
    if (!file) return new Response("scan proxy", { headers: cors });
    return new Response(file.body, { headers: { ...cors, "content-type": file.mime, "cache-control": "no-store" } });
  },
};
