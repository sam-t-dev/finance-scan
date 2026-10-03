import fs from "fs";
import path from "path";

const root = path.dirname(new URL(import.meta.url).pathname);
const files = {
  "index.html": "text/html; charset=utf-8",
  "about.html": "text/html; charset=utf-8",
  "rules.html": "text/html; charset=utf-8",
  "styles.css": "text/css; charset=utf-8",
  "board.js": "text/javascript; charset=utf-8",
  "scan-logic.js": "text/javascript; charset=utf-8",
  "rules-page.js": "text/javascript; charset=utf-8",
  "universe.json": "application/json; charset=utf-8"
};
const entries = Object.entries(files).map(([name, mime]) => {
  const body = fs.readFileSync(path.join(root, name), "utf8");
  return `  ${JSON.stringify(name)}: { mime: ${JSON.stringify(mime)}, body: ${JSON.stringify(body)} }`;
});
const src = fs.readFileSync(path.join(root, "worker.js"), "utf8");
const marker = "const FILES = {}; // BUILD_FILES";
if (!src.includes(marker)) throw new Error("worker.js missing FILES marker");
const out = src.replace(marker, "const FILES = {\n" + entries.join(",\n") + "\n};");
const dest = process.argv[2] || path.join(root, "dist-worker.js");
fs.writeFileSync(dest, out);
console.log("wrote", dest, out.length);
