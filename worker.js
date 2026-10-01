const ALLOW_ORIGIN = "*";
const cors = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
};
export default {
  async fetch(req) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (url.pathname.startsWith("/yahoo/chart")) {
      const symbol = url.searchParams.get("symbol") || "AAPL";
      const range = url.searchParams.get("range") || "1y";
      const interval = url.searchParams.get("interval") || "1d";
      const target = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(symbol) + "?range=" + range + "&interval=" + interval;
      const up = await fetch(target, { headers: { "user-agent": "Mozilla/5.0" } });
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json" } });
    }
    if (url.pathname.startsWith("/yahoo/quote")) {
      const symbol = url.searchParams.get("symbol") || url.searchParams.get("symbols") || "AAPL";
      const target = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/" + encodeURIComponent(symbol) + "?modules=price,summaryDetail,defaultKeyStatistics,financialData,earningsHistory";
      const up = await fetch(target, { headers: { "user-agent": "Mozilla/5.0" } });
      return new Response(await up.text(), { status: up.status, headers: { ...cors, "content-type": "application/json" } });
    }
    return new Response("scan proxy", { headers: cors });
  },
};
