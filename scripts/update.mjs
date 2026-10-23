#!/usr/bin/env node
/**
 * Tacet Forge self-update, run by start.bat before the app starts.
 *
 * Installs only from this fork (`origin`, github.com/Nocker29/tacet-forge),
 * where code arrives through reviewed PRs: if origin/master is ahead, shows a
 * short summary, asks, fast-forwards, runs `npm ci --ignore-scripts` if the
 * lockfile changed, the unit tests and the build. It never merges or runs
 * code from upstream (Wuthering Tools): new upstream commits are only
 * announced, and an AI assistant merges them through a PR after reviewing
 * the diff (UPDATE-AI.md). It never pushes.
 *
 * Any failure resets the checkout to the commit it started from and restores
 * the previous dist/, so the old version still starts. Never fails
 * start.bat: every outcome exits 0, and being offline just skips the check.
 *
 * Messages are Polish (for the owner).
 *
 * Env (for scripted runs and tests):
 *   TACET_UPDATE_ANSWER       "T"/"N" instead of asking
 *   TACET_UPDATE_TEST_CMD     default "npx vitest run"
 *   TACET_UPDATE_BUILD_CMD    default "npm run build"
 *   TACET_UPDATE_INSTALL_CMD  default "npm ci --ignore-scripts"
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
const ASK_CLAUDE = "Poproś Claude: „zaktualizuj Tacet Forge z Wuthering Tools” (instrukcja: UPDATE-AI.md).";

const commands = {
  test: process.env.TACET_UPDATE_TEST_CMD || "npx vitest run",
  build: process.env.TACET_UPDATE_BUILD_CMD || "npm run build",
  install: process.env.TACET_UPDATE_INSTALL_CMD || "npm ci --ignore-scripts",
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

function commitsBetween(from, to) {
  const res = git(["log", "--no-merges", "--format=%s", `${from}..${to}`]);
  return res.ok && res.out ? res.out.split(/\r?\n/) : [];
}

function describe(name, titles) {
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
  git(["reset", "--hard", startSha]);
  if (lockChanged) run("przywrócenie zależności", commands.install);
  restoreDist();
  console.log("");
  console.log(`Aktualizacja przerwana: ${reason}.`);
  console.log("Przywróciłem poprzednią wersję — aplikacja uruchomi się tak jak wcześniej.");
  console.log("Poproś Claude o pomoc (instrukcja: UPDATE-AI.md, log: logs\\update-last.log).");
  console.log("");
}

async function main() {
  if (!git(["rev-parse", "--is-inside-work-tree"]).ok) return;
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  if (branch !== BRANCH) {
    console.log(`(Sprawdzanie aktualizacji pominięte: aktywna gałąź to "${branch}", nie "${BRANCH}".)`);
    return;
  }

  const fetchedOrigin = git(["fetch", "--quiet", "origin", BRANCH], { timeout: 20_000 }).ok;
  const hasUpstream = git(["remote", "get-url", "upstream"]).ok;
  const fetchedUpstream = hasUpstream && git(["fetch", "--quiet", "upstream", BRANCH], { timeout: 20_000 }).ok;
  if (!fetchedOrigin && !fetchedUpstream) return; // offline: start as usual

  // Upstream is only announced, counting what the fork itself still lacks.
  const base = fetchedOrigin ? `origin/${BRANCH}` : "HEAD";
  const fromUpstream = fetchedUpstream ? commitsBetween(base, `upstream/${BRANCH}`) : [];
  if (fromUpstream.length) {
    console.log("");
    console.log("Nowe zmiany w Wuthering Tools (nie instaluję ich automatycznie):");
    console.log(describe("Wuthering Tools", fromUpstream));
    console.log(`  ${ASK_CLAUDE}`);
  }

  const fromOrigin = fetchedOrigin ? commitsBetween("HEAD", `origin/${BRANCH}`) : [];
  if (!fromOrigin.length) {
    if (fromUpstream.length) console.log("");
    return;
  }

  console.log("");
  console.log("Dostępna aktualizacja Tacet Forge:");
  console.log(describe("Tacet Forge", fromOrigin));

  if (git(["status", "--porcelain", "--untracked-files=no"]).out) {
    console.log("");
    console.log("W folderze są niezapisane zmiany w plikach projektu, więc nie aktualizuję.");
    console.log("Poproś Claude o pomoc (instrukcja: UPDATE-AI.md).");
    console.log("");
    return;
  }
  if (!git(["merge-base", "--is-ancestor", "HEAD", `origin/${BRANCH}`]).ok) {
    console.log("");
    console.log("Lokalna wersja ma zmiany, których nie ma na GitHubie, więc nie aktualizuję.");
    console.log("Poproś Claude o pomoc (instrukcja: UPDATE-AI.md).");
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
    install(startSha);
  } catch (error) {
    rollback(startSha, true, `nieoczekiwany błąd (${error?.message ?? error})`);
  }
}

function install(startSha) {
  console.log("  • pobieranie zmian…");
  if (!git(["merge", "--ff-only", "--quiet", `origin/${BRANCH}`]).ok) {
    return rollback(startSha, false, "nie udało się pobrać zmian");
  }
  log(`now: ${git(["rev-parse", "HEAD"]).out}`);

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
  console.log("");
  console.log("Aktualizacja zakończona.");
  console.log("");
}

try {
  await main();
} catch (error) {
  console.log(`(Sprawdzanie aktualizacji pominięte: ${error?.message ?? error})`);
}
