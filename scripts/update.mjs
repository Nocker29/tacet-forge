#!/usr/bin/env node
/**
 * Tacet Forge self-update, run by start.bat before the app starts.
 *
 * Fetches origin (this fork) and upstream (Wuthering Tools). If either has
 * commits the local master lacks, shows a short summary and asks whether to
 * install them. Installing = merge origin, merge upstream, `npm ci` if the
 * lockfile changed, unit tests, build, push master to origin. Any failure
 * rolls the checkout back to the commit it started from and restores the
 * previous dist/, so the old version still starts. Never fails start.bat:
 * every outcome exits 0, and being offline just skips the check.
 *
 * Messages are Polish (for the owner); see UPDATE-AI.md for the manual flow.
 *
 * Env (for scripted runs and tests):
 *   TACET_UPDATE_ANSWER       "T"/"N" instead of asking
 *   TACET_UPDATE_TEST_CMD     default "npx vitest run"
 *   TACET_UPDATE_BUILD_CMD    default "npm run build"
 *   TACET_UPDATE_INSTALL_CMD  default "npm ci"
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRANCH = "master";
const LOG = join(ROOT, "logs", "update-last.log");
const DIST = join(ROOT, "dist");
const DIST_BACKUP = join(ROOT, ".dist-before-update");
const SHOWN_TITLES = 5;
// Files the fork deleted on purpose that upstream keeps editing (a
// modify/delete conflict on every release); a merge may keep them deleted.
const KEEP_DELETED = new Set(["public/sitemap.xml"]);

const commands = {
  test: process.env.TACET_UPDATE_TEST_CMD || "npx vitest run",
  build: process.env.TACET_UPDATE_BUILD_CMD || "npm run build",
  install: process.env.TACET_UPDATE_INSTALL_CMD || "npm ci",
};

function git(args, { timeout = 60_000 } = {}) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout, windowsHide: true });
  return { ok: result.status === 0, out: (result.stdout ?? "").trim(), err: (result.stderr ?? "").trim() };
}

function log(text) {
  appendFileSync(LOG, `${text}\n`);
}

/** Runs a shell command with its output in the log; true on success. */
function run(label, command) {
  log(`\n$ ${command}`);
  const result = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, CYPRESS_INSTALL_BINARY: "0", CI: "1", FORCE_COLOR: "0" },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  log(result.stdout ?? "");
  log(result.stderr ?? "");
  if (result.status === 0) return true;
  console.log(`  ✗ ${label} — nie powiodło się (szczegóły: logs\\update-last.log)`);
  return false;
}

/** Merges `ref`; a conflict only on KEEP_DELETED files is resolved by keeping them deleted. */
function merge(ref, message) {
  const args = ["merge", "--no-edit", ...(message ? ["-m", message] : []), ref];
  if (git(args).ok) return true;
  const conflicted = git(["diff", "--name-only", "--diff-filter=U"]).out.split(/\r?\n/).filter(Boolean);
  if (!conflicted.length || !conflicted.every((file) => KEEP_DELETED.has(file))) return false;
  for (const file of conflicted) git(["rm", "--quiet", file]);
  log(`kept deleted: ${conflicted.join(", ")}`);
  return git(["commit", "--no-edit"]).ok;
}

function commitsBetween(from, to) {
  const res = git(["log", "--no-merges", "--format=%s", `${from}..${to}`]);
  return res.ok && res.out ? res.out.split("\n") : [];
}

function describe(name, titles) {
  if (!titles.length) return null;
  const shown = titles.slice(0, SHOWN_TITLES).map((title) => `    - ${title}`);
  const more = titles.length > SHOWN_TITLES ? [`    … i ${titles.length - SHOWN_TITLES} więcej`] : [];
  const word = titles.length === 1 ? "zmiana" : titles.length < 5 ? "zmiany" : "zmian";
  return [`  ${name}: ${titles.length} ${word}`, ...shown, ...more].join("\n");
}

async function ask(question) {
  if (process.env.TACET_UPDATE_ANSWER) {
    console.log(`${question} ${process.env.TACET_UPDATE_ANSWER}`);
    return /^[tTyY]/.test(process.env.TACET_UPDATE_ANSWER);
  }
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^[tTyY]/.test((await rl.question(`${question} `)).trim());
  } finally {
    rl.close();
  }
}

function backupDist() {
  rmSync(DIST_BACKUP, { recursive: true, force: true });
  if (existsSync(DIST)) renameSync(DIST, DIST_BACKUP);
}

function restoreDist() {
  if (!existsSync(DIST_BACKUP)) return;
  rmSync(DIST, { recursive: true, force: true });
  renameSync(DIST_BACKUP, DIST);
}

function rollback(startSha, lockChanged, reason) {
  git(["merge", "--abort"]);
  git(["reset", "--hard", startSha]);
  if (lockChanged) run("przywrócenie zależności", commands.install);
  restoreDist();
  console.log("");
  console.log(`Aktualizacja przerwana: ${reason}.`);
  console.log("Przywróciłem poprzednią wersję — aplikacja uruchomi się tak jak wcześniej.");
  console.log("Poproś Claude o aktualizację — instrukcja: UPDATE-AI.md");
  console.log("");
}

async function main() {
  if (!git(["rev-parse", "--is-inside-work-tree"]).ok) return;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  if (branch !== BRANCH) {
    console.log(`(Sprawdzanie aktualizacji pominięte: aktywna gałąź to "${branch}", nie "${BRANCH}".)`);
    return;
  }

  const hasUpstream = git(["remote", "get-url", "upstream"]).ok;
  const fetchedOrigin = git(["fetch", "--quiet", "origin", BRANCH], { timeout: 20_000 }).ok;
  const fetchedUpstream = hasUpstream && git(["fetch", "--quiet", "upstream", BRANCH], { timeout: 20_000 }).ok;
  if (!fetchedOrigin && !fetchedUpstream) return; // offline: start as usual

  const fromOrigin = fetchedOrigin ? commitsBetween("HEAD", `origin/${BRANCH}`) : [];
  const fromUpstream = fetchedUpstream ? commitsBetween("HEAD", `upstream/${BRANCH}`) : [];
  if (!fromOrigin.length && !fromUpstream.length) return;

  console.log("");
  console.log("Dostępna aktualizacja:");
  for (const line of [describe("Tacet Forge", fromOrigin), describe("Wuthering Tools", fromUpstream)]) {
    if (line) console.log(line);
  }

  if (git(["status", "--porcelain", "--untracked-files=no"]).out) {
    console.log("");
    console.log("W folderze są niezapisane zmiany w plikach projektu, więc nie aktualizuję.");
    console.log("Poproś Claude o aktualizację — instrukcja: UPDATE-AI.md");
    console.log("");
    return;
  }

  if (!(await ask("Zainstalować aktualizację? [T/N]"))) return;

  mkdirSync(dirname(LOG), { recursive: true });
  writeFileSync(LOG, `Tacet Forge update ${new Date().toISOString()}\n`);
  const startSha = git(["rev-parse", "HEAD"]).out;
  log(`start: ${startSha}`);
  backupDist();
  try {
    await install(startSha, fromOrigin.length > 0, fromUpstream.length > 0);
  } catch (error) {
    rollback(startSha, true, `nieoczekiwany błąd (${error?.message ?? error})`);
  }
}

async function install(startSha, fromOrigin, fromUpstream) {
  console.log("  • scalanie zmian…");
  if (fromOrigin && !merge(`origin/${BRANCH}`)) {
    return rollback(startSha, false, "konflikt przy scalaniu zmian Tacet Forge");
  }
  if (fromUpstream && !merge(`upstream/${BRANCH}`, "Merge upstream Wuthering Tools into Tacet Forge")) {
    return rollback(startSha, false, "konflikt przy scalaniu zmian z Wuthering Tools");
  }

  const lockChanged = !git(["diff", "--quiet", startSha, "HEAD", "--", "package-lock.json"]).ok;
  if (lockChanged) {
    console.log("  • instalowanie zależności…");
    if (!run("instalacja zależności", commands.install)) return rollback(startSha, true, "instalacja zależności się nie udała");
  }
  console.log("  • testy…");
  if (!run("testy", commands.test)) return rollback(startSha, lockChanged, "testy nie przeszły");
  console.log("  • budowanie aplikacji…");
  if (!run("budowanie", commands.build)) return rollback(startSha, lockChanged, "budowanie się nie udało");

  rmSync(DIST_BACKUP, { recursive: true, force: true });
  const pushed = git(["push", "--quiet", "origin", `HEAD:${BRANCH}`], { timeout: 60_000 }).ok;
  console.log("");
  console.log("Aktualizacja zakończona.");
  if (!pushed) console.log("(Nie udało się wysłać zmian na GitHub — Claude zrobi to przy następnej aktualizacji.)");
  console.log("");
}

try {
  await main();
} catch (error) {
  console.log(`(Sprawdzanie aktualizacji pominięte: ${error?.message ?? error})`);
}
