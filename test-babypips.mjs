// Smoke tests for BabyPips Cowabunga boxes. Run: node test-babypips.mjs
import fs from "fs";
import vm from "vm";
import assert from "assert";

const src = fs.readFileSync("board.js", "utf8");
const cut = src.indexOf("const theme = localStorage");
assert.ok(cut > 0, "expected theme boot marker");
const sandbox = {
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { hostname: "localhost", search: "" },
  document: {
    documentElement: { dataset: {} },
    getElementById: () => ({ textContent: "", classList: { toggle() {} }, onclick: null }),
  },
  URLSearchParams: class { constructor() {} get() { return null; } },
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  setTimeout,
  clearTimeout,
  AbortController,
  Promise,
  Map,
  Date,
  Math,
  Number,
  JSON,
  Object,
  Array,
  encodeURIComponent,
  window: {},
};
vm.createContext(sandbox);
vm.runInContext(
  src.slice(0, cut) +
  "\nglobalThis.__test = { babySignal, babyBoxes, emaSeries, DEFAULT_RULES };\n",
  sandbox
);

const { babySignal, babyBoxes, emaSeries, DEFAULT_RULES } = sandbox.__test;
assert.equal(typeof babySignal, "function");
assert.equal(DEFAULT_RULES.babypips.emaFast, 5);
assert.equal(DEFAULT_RULES.babypips.rsiPeriod, 9);

function synth(n, fn) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const c = fn(i);
    bars.push({ open: c, high: c * 1.01, low: c * 0.99, close: c });
  }
  return bars;
}

const up = synth(200, (i) => 50 + i * 0.4 + (i > 180 ? 2 : 0));
const upSig = babySignal(up, DEFAULT_RULES);
assert.ok(["buy", "hold"].includes(upSig), "uptrend must not be sell, got " + upSig);

const down = synth(200, (i) => 150 - i * 0.4 - (i > 180 ? 2 : 0));
const downSig = babySignal(down, DEFAULT_RULES);
assert.ok(["sell", "hold"].includes(downSig), "downtrend must not be buy, got " + downSig);

const flat = synth(200, () => 100);
assert.equal(babySignal(flat, DEFAULT_RULES), "hold");

const boxes = babyBoxes(up, DEFAULT_RULES);
assert.ok(boxes.detail);
assert.ok(["bull", "bear", "bull-soft", "bear-soft", "flat"].includes(boxes.trend));

const ema = emaSeries([1,2,3,4,5,6,7,8,9,10], 3);
assert.ok(ema[2] != null);
assert.equal(babySignal([], DEFAULT_RULES), "hold");

console.log("ok — BabyPips boxes smoke passed", { upSig, downSig, trend: boxes.trend, momentum: boxes.momentum, structure: boxes.structure });
