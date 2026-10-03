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

async function yahooQuote(symbol) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const seed = await fetch("https://fc.yahoo.com", { headers: { "user-agent": ua, accept: "text/html" }, redirect: "manual" });
  let cookie = cookieHeader(seed);
  const page = await fetch("https://finance.yahoo.com/quote/" + encodeURIComponent(symbol), {
    headers: { "user-agent": ua, accept: "text/html,application/xhtml+xml", cookie },
    redirect: "manual"
  });
  cookie = mergeCookie(cookie, cookieHeader(page));
  const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "user-agent": ua, cookie, origin: "https://finance.yahoo.com", referer: "https://finance.yahoo.com/", accept: "*/*" }
  });
  const crumb = (await crumbRes.text()).trim();
  const target = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" + encodeURIComponent(symbol) + "?modules=" + QUOTE_MODULES + "&crumb=" + encodeURIComponent(crumb);
  return fetch(target, { headers: { "user-agent": ua, cookie, origin: "https://finance.yahoo.com", referer: "https://finance.yahoo.com/" } });
}

export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname.startsWith("/yahoo/chart")) {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const range = url.searchParams.get("range") || "1y";
      const interval = url.searchParams.get("interval") || "1d";
      const target = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=" + encodeURIComponent(range) + "&interval=" + encodeURIComponent(interval);
      const up = await fetch(target, { headers: { "user-agent": "Mozilla/5.0" } });
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
    }
    if (url.pathname.startsWith("/yahoo/quote")) {
      const symbol = url.searchParams.get("symbol") || url.searchParams.get("symbols") || "AAPL";
      const up = await yahooQuote(symbol);
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json", "cache-control": "no-store" } });
    }
    const name = ROUTES[url.pathname] || "index.html";
    const file = FILES[name];
    if (!file) return new Response("scan proxy", { headers: cors });
    return new Response(file.body, { headers: { ...cors, "content-type": file.mime, "cache-control": "no-store" } });
  },
};
