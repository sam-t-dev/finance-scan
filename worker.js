// Cloudflare Worker. Bind secret OM_KEY in the dashboard.
const ALLOW = ["https://sam-t-dev.github.io", "https://sam-t-dev.github.io/finance-scan", "http://localhost:4173"];
function cors(origin) {
  const allow = ALLOW.some((a) => origin.startsWith("https://sam-t-dev.github.io") || origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) ? origin : ALLOW[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };
}
export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const headers = cors(origin);
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (!env.OM_KEY) return Response.json({ error: "OM_KEY not bound" }, { status: 500, headers });
    const incoming = new URL(req.url);
    const target = new URL("https://api.openmarket.xyz/v1/points");
    incoming.searchParams.forEach((v, k) => target.searchParams.set(k, v));
    const up = await fetch(target.toString(), { headers: { "X-OpenMarket-Key": env.OM_KEY } });
    const body = await up.text();
    return new Response(body, { status: up.status, headers: { ...headers, "content-type": up.headers.get("content-type") || "application/json" } });
  },
};
