const DEFAULT_RULES = {
  name: "default",
  loose: { pe: 35, peg: 1.5, epsBeat: 0.05, de: 1.5, yoy: 0.08 },
  tight: { pe: 25, fpe: 25, rsiLow: 30, rsiHigh: 70, de: 1, epsBeat: "yes", qoq: 0.05 },
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
      if (baby.emaFast == null) Object.assign(baby, base.babypips);
      return Object.assign(base, s, { babypips: baby });
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_RULES));
}
function fill(r) {
  document.getElementById("lpe").value = r.loose.pe;
  document.getElementById("lpeg").value = r.loose.peg;
  document.getElementById("leps").value = r.loose.epsBeat * 100;
  document.getElementById("lde").value = r.loose.de;
  document.getElementById("lyoy").value = r.loose.yoy * 100;
  document.getElementById("tpe").value = r.tight.pe;
  document.getElementById("tfpe").value = r.tight.fpe;
  document.getElementById("trlo").value = r.tight.rsiLow;
  document.getElementById("trhi").value = r.tight.rsiHigh;
  document.getElementById("tde").value = r.tight.de;
  document.getElementById("teps").value = r.tight.epsBeat === "no" ? "no" : "yes";
  document.getElementById("tqoq").value = r.tight.qoq * 100;
  document.getElementById("bemaf").value = r.babypips.emaFast;
  document.getElementById("bemas").value = r.babypips.emaSlow;
  document.getElementById("bhtf").value = r.babypips.higherTfBars;
  document.getElementById("bcross").value = r.babypips.crossLookback;
  document.getElementById("brsip").value = r.babypips.rsiPeriod;
  document.getElementById("brsim").value = r.babypips.rsiMid;
  document.getElementById("bstk").value = r.babypips.stochK;
  document.getElementById("bstd").value = r.babypips.stochD;
  document.getElementById("bsts").value = r.babypips.stochSmooth;
  document.getElementById("bstob").value = r.babypips.stochOb;
  document.getElementById("bstos").value = r.babypips.stochOs;
  document.getElementById("bmacdf").value = r.babypips.macdFast;
  document.getElementById("bmacds").value = r.babypips.macdSlow;
  document.getElementById("bmacdg").value = r.babypips.macdSignal;
  document.getElementById("bswing").value = r.babypips.swingBars;
  document.getElementById("brr").value = r.babypips.rrMin;
  document.getElementById("bstop").value = r.babypips.maxStopPct;
  document.getElementById("presetName").textContent = r.name === "default" ? "Default values" : "Custom values";
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
fill(loadRules());
document.getElementById("useDefault").onclick = () => {
  localStorage.setItem("scan-rules", JSON.stringify(DEFAULT_RULES));
  fill(DEFAULT_RULES);
  document.getElementById("presetName").textContent = "Reset to default";
};
document.getElementById("save").onclick = () => {
  const rules = {
    name: "custom",
    loose: { pe: Number(document.getElementById("lpe").value), peg: Number(document.getElementById("lpeg").value), epsBeat: Number(document.getElementById("leps").value) / 100, de: Number(document.getElementById("lde").value), yoy: Number(document.getElementById("lyoy").value) / 100 },
    tight: { pe: Number(document.getElementById("tpe").value), fpe: Number(document.getElementById("tfpe").value), rsiLow: Number(document.getElementById("trlo").value), rsiHigh: Number(document.getElementById("trhi").value), de: Number(document.getElementById("tde").value), epsBeat: document.getElementById("teps").value, qoq: Number(document.getElementById("tqoq").value) / 100 },
    babypips: {
      emaFast: Number(document.getElementById("bemaf").value),
      emaSlow: Number(document.getElementById("bemas").value),
      higherTfBars: Number(document.getElementById("bhtf").value),
      crossLookback: Number(document.getElementById("bcross").value),
      rsiPeriod: Number(document.getElementById("brsip").value),
      rsiMid: Number(document.getElementById("brsim").value),
      stochK: Number(document.getElementById("bstk").value),
      stochD: Number(document.getElementById("bstd").value),
      stochSmooth: Number(document.getElementById("bsts").value),
      stochOb: Number(document.getElementById("bstob").value),
      stochOs: Number(document.getElementById("bstos").value),
      macdFast: Number(document.getElementById("bmacdf").value),
      macdSlow: Number(document.getElementById("bmacds").value),
      macdSignal: Number(document.getElementById("bmacdg").value),
      swingBars: Number(document.getElementById("bswing").value),
      rrMin: Number(document.getElementById("brr").value),
      maxStopPct: Number(document.getElementById("bstop").value)
    }
  };
  localStorage.setItem("scan-rules", JSON.stringify(rules));
  document.getElementById("presetName").textContent = "Saved";
};
