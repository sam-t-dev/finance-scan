const DEFAULT_RULES = {
  name: "default",
  loose: { pe: 35, peg: 1.5, epsBeat: 0.05, de: 1.5, yoy: 0.08 },
  tight: { pe: 25, fpe: 25, rsiLow: 30, rsiHigh: 70, de: 1, epsBeat: "yes", qoq: 0.05 },
  babypips: { trendMa: 50, higherMa: 200, slopeBars: 5, rsiMin: 30, rsiChase: 70, pullbackPct: 3, rrMin: 2 }
};
function loadRules() {
  try {
    const s = JSON.parse(localStorage.getItem("scan-rules") || "null");
    if (s && s.loose) {
      const base = JSON.parse(JSON.stringify(DEFAULT_RULES));
      return Object.assign(base, s, { babypips: Object.assign(base.babypips, s.babypips || {}) });
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
  document.getElementById("btrend").value = r.babypips.trendMa;
  document.getElementById("bhigher").value = r.babypips.higherMa;
  document.getElementById("bslope").value = r.babypips.slopeBars;
  document.getElementById("brlo").value = r.babypips.rsiMin;
  document.getElementById("brhi").value = r.babypips.rsiChase;
  document.getElementById("bpull").value = r.babypips.pullbackPct;
  document.getElementById("brr").value = r.babypips.rrMin;
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
    babypips: { trendMa: Number(document.getElementById("btrend").value), higherMa: Number(document.getElementById("bhigher").value), slopeBars: Number(document.getElementById("bslope").value), rsiMin: Number(document.getElementById("brlo").value), rsiChase: Number(document.getElementById("brhi").value), pullbackPct: Number(document.getElementById("bpull").value), rrMin: Number(document.getElementById("brr").value) }
  };
  localStorage.setItem("scan-rules", JSON.stringify(rules));
  document.getElementById("presetName").textContent = "Saved";
};
