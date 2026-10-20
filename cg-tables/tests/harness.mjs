// Shared test harness: serves cg-tables/ over HTTP and launches the preinstalled Chromium.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const { chromium } = require("/opt/node22/lib/node_modules/playwright");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".woff2": "font/woff2", ".webp": "image/webp", ".svg": "image/svg+xml", ".json": "application/json" };
export const SHOTS = process.env.SHOTS || "/tmp/cg-shots";

export function serve() {
  const server = http.createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    try {
      const body = await readFile(join(ROOT, path.endsWith("/") ? path + "index.html" : path));
      res.writeHead(200, { "Content-Type": TYPES[extname(path)] || (path.endsWith("/") ? "text/html" : "application/octet-stream") });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

export async function launch() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
}

let failures = 0;
export function check(name, cond, detail = "") {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${detail}`); }
}
export function done() {
  console.log(failures ? `\n${failures} failing` : "\nall passing");
  process.exit(failures ? 1 : 0);
}
