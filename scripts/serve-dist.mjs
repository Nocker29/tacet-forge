// Serves the production build (dist/) on a fixed local port, with the SPA fallback
// the router needs. No dependencies, so it runs from an offline copy with only Node.
//
// The port must stay fixed: localStorage (all builds, inventory and settings) is
// per origin, so a different port or host name looks like an empty app.
//
//   node scripts/serve-dist.mjs            # http://localhost:4317
//   node scripts/serve-dist.mjs --port 5000
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_PORT = 4317;
const root = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
const portArg = process.argv.indexOf("--port");
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : DEFAULT_PORT;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".gz": "application/gzip",
};

if (!existsSync(join(root, "index.html"))) {
  console.error(`No build found in ${root}. Run "npm run build" first.`);
  process.exit(1);
}

function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const file = normalize(join(root, decoded));
  // Never serve anything outside dist/.
  if (file !== root && !file.startsWith(root + sep)) return null;
  if (existsSync(file) && statSync(file).isFile()) return file;
  return null;
}

const server = createServer((req, res) => {
  const urlPath = req.url ?? "/";
  // Unknown paths without an extension are app routes (/optimizer, /info/credits…).
  const file = resolveFile(urlPath) ?? (extname(urlPath.split("?")[0]) ? null : join(root, "index.html"));
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Is the app already running? Open http://localhost:${port}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Tacet Forge is running at http://localhost:${port}  (Ctrl+C to stop)`);
});
