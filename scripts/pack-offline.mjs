// Builds an offline package: the full source tree (every git-tracked file, as
// GPL-3.0 requires for a distributed copy) plus the prebuilt dist/, so
// start.bat runs without npm or network. Writes tacet-forge-offline.zip.
//
//   npm run build && npm run package:offline
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tacet-forge-offline.zip");

if (!existsSync(join(root, "dist", "index.html"))) {
  console.error('No build found in dist/. Run "npm run build" first.');
  process.exit(1);
}

const staging = mkdtempSync(join(tmpdir(), "tacet-forge-"));
const target = join(staging, "tacet-forge");
try {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  for (const file of files) {
    const from = join(root, file);
    if (!existsSync(from)) continue; // deleted in the working tree
    mkdirSync(dirname(join(target, file)), { recursive: true });
    cpSync(from, join(target, file));
  }
  cpSync(join(root, "dist"), join(target, "dist"), { recursive: true });
  rmSync(out, { force: true });
  // bsdtar ships with Windows 10+ and macOS; -a picks zip from the file name. On
  // Windows, call it by path: Git Bash puts GNU tar (no zip support) first on PATH.
  const windowsTar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
  const tar = process.platform === "win32" && existsSync(windowsTar) ? windowsTar : "tar";
  execFileSync(tar, ["-a", "-c", "-f", out, "-C", staging, "tacet-forge"], { stdio: "inherit" });
  console.log(`Wrote ${out} (${files.length} source files + dist/)`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
