// The agent tool's commands (src/agent/commands.ts) on a synthetic backup
// (tests/fixtures/agent/backup.json), with an in-memory runtime and the app's
// real processor worker behind a `self` shim, like scripts/agent-host.mjs.
import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runAgentCommand, listCommandNames, getCommand, type AgentRuntime } from "../../src/agent/commands";

type Plain = Record<string, any>;

const FIXTURE = join(__dirname, "../fixtures/agent/backup.json");
const workerSelf: Plain = { onmessage: null, sink: null, postMessage: (m: Plain) => workerSelf.sink?.(structuredClone(m)) };

function createRuntime(files: Map<string, string>): AgentRuntime {
  return {
    readText: (path) => {
      const text = files.get(path);
      if (text == null) throw new Error(`no file ${path}`);
      return text;
    },
    writeText: (path, text) => {
      if (files.has(path)) throw new Error(`exists ${path}`);
      files.set(path, text);
    },
    exists: (path) => files.has(path),
    resolvePath: (path) => (path.startsWith("/") ? path : `/data/${path}`),
    now: () => Date.UTC(2026, 10, 25, 12, 0, 0),
    createProcessor: () => ({
      send: (message) => workerSelf.onmessage?.({ data: structuredClone(message) }),
      onMessage: (handler) => {
        workerSelf.sink = handler;
      },
    }),
  };
}

let files: Map<string, string>;
let runtime: AgentRuntime;
const run = (command: string, args: Plain = {}) => runAgentCommand(command, { data: "backup.json", ...args }, runtime);

beforeAll(async () => {
  vi.stubGlobal("self", workerSelf);
  await import("../../src/workers/processor.worker");
});

function fresh() {
  files = new Map([["/data/backup.json", readFileSync(FIXTURE, "utf8")]]);
  runtime = createRuntime(files);
}

describe("agent commands", () => {
  it("describe lists every command with its arguments", async () => {
    fresh();
    const out = await runAgentCommand("describe", {}, runtime);
    expect(out.ok).toBe(true);
    const names = out.result.commands.map((command: Plain) => command.name);
    expect(names).toEqual(listCommandNames());
    for (const name of names) expect(getCommand(name)?.summary).toBeTruthy();
  });

  it("errors are JSON with a code, and unknown commands are reported", async () => {
    fresh();
    expect(await runAgentCommand("nope", {}, runtime)).toMatchObject({ ok: false, error: { code: "unknown_command" } });
    expect(await runAgentCommand("characters", {}, runtime)).toMatchObject({ ok: false, error: { code: "missing_argument" } });
    expect(await run("stats", { character: "Nobody" })).toMatchObject({ ok: false, error: { code: "unknown_character" } });
    files.set("/data/broken.json", "{ not json");
    expect(await runAgentCommand("characters", { data: "broken.json" }, runtime)).toMatchObject({
      ok: false,
      error: { code: "invalid_backup" },
    });
  });

  it("characters and echoes read the backup", async () => {
    fresh();
    const characters = await run("characters");
    expect(characters.result.characters.map((c: Plain) => c.key)).toEqual(expect.arrayContaining(["Hiyuki", "Lucilla"]));
    const echoes = await run("echoes", { "held-by": "Lucilla" });
    expect(echoes.result.echoes.map((e: Plain) => e.echoId)).toEqual(["t003"]);
  });

  it("optimize finds loadouts, and applying the best one reproduces its value", async () => {
    fresh();
    const optimized = await run("optimize", { character: "Hiyuki" });
    expect(optimized.ok).toBe(true);
    const { results, combinationsChecked, complete, echoesConsidered } = optimized.result;
    expect(complete).toBe(true);
    expect(combinationsChecked).toBeGreaterThan(0);
    // Lucilla's echo is protected by default.
    expect(echoesConsidered).toBe(9);
    expect(results.length).toBe(5);
    expect(results[0].value).toBeGreaterThanOrEqual(results[1].value);

    const best = results[0];
    const applied = await run("apply", { character: "Hiyuki", echoes: best.echoIds.join(",") });
    expect(applied.ok).toBe(true);
    expect(applied.result.out).toMatch(/^\/data\/backup\.agent-Hiyuki-.*\.json$/);
    // The input file is untouched.
    expect(files.get("/data/backup.json")).toBe(readFileSync(FIXTURE, "utf8"));

    const damage = await runAgentCommand("damage", { data: applied.result.out, character: "Hiyuki" }, runtime);
    const attack = damage.result.attacks.find((a: Plain) => a.key === "ForeclaimingBladeLiberationBaseDMG");
    expect(attack.average).toBe(Math.round(best.value));

    const characters = await runAgentCommand("characters", { data: applied.result.out }, runtime);
    const hiyuki = characters.result.characters.find((c: Plain) => c.key === "Hiyuki");
    expect(hiyuki.builds.map((b: Plain) => b.name)).toContain(applied.result.build.name);
  });

  it("protection none can take echoes from other characters", async () => {
    fresh();
    const optimized = await run("optimize", { character: "Hiyuki", protection: "none", top: 1 });
    expect(optimized.result.echoesConsidered).toBe(10);
  });

  it("apply refuses to overwrite the input or an existing file", async () => {
    fresh();
    expect(await run("apply", { character: "Hiyuki", echoes: "t000", out: "backup.json" })).toMatchObject({
      ok: false,
      error: { code: "would_overwrite_input" },
    });
    files.set("/data/taken.json", "{}");
    expect(await run("apply", { character: "Hiyuki", echoes: "t000", out: "taken.json" })).toMatchObject({
      ok: false,
      error: { code: "out_exists" },
    });
    expect(await run("apply", { character: "Hiyuki", echoes: "zzz" })).toMatchObject({ ok: false, error: { code: "unknown_echo" } });
  });
});

describe("agent team rotations and frames", () => {
  it("lists saved team rotations, character rotations, and characters without presets", async () => {
    fresh();
    const out = await run("rotations");
    expect(out.result.teams).toEqual([
      expect.objectContaining({ id: "team1", name: "Hiyuki Lucilla", characters: ["Hiyuki", "Lucilla", null], actions: 7 }),
    ]);
    expect(out.result.characterRotations).toEqual([expect.objectContaining({ character: "Hiyuki", id: "rot1", actions: 5 })]);
    expect(out.result.charactersWithoutPresets).toEqual(expect.arrayContaining(["Hiyuki"]));
  });

  it("a one-character team gives the same damage as that character's saved rotation in `damage`", async () => {
    fresh();
    const damage = await run("damage", { character: "Hiyuki" });
    const saved = damage.result.rotations.find((rotation: Plain) => rotation.id === "rot1");
    const team = await run("team-rotation", { characters: "Hiyuki", "slot-rotations": "Burst" });
    expect(team.ok).toBe(true);
    expect(team.result.total.average).toBe(saved.average);
    expect(team.result.total.normal).toBe(saved.normal);
    expect(team.result.total.crit).toBe(saved.crit);
  });

  it("a saved team and the same actions given inline agree, with totals, per-character split and frame timeline", async () => {
    fresh();
    const saved = await run("team-rotation", { team: "Hiyuki Lucilla" });
    expect(saved.ok).toBe(true);
    const teamsState = JSON.parse(JSON.parse(readFileSync(FIXTURE, "utf8")).data.teamRotations);
    const inline = await run("team-rotation", {
      characters: "Hiyuki,Lucilla",
      actions: JSON.stringify(teamsState.teams[0].actions),
      duration: 12,
    });
    expect(inline.result.total).toEqual(saved.result.total);
    expect(inline.result.dps).toEqual(saved.result.dps);

    const { total, perCharacter, actions, timeline, dps } = saved.result;
    expect(perCharacter.reduce((sum: number, entry: Plain) => sum + entry.average, 0)).toBeCloseTo(total.average, -1);
    expect(actions.map((action: Plain) => action.character)).toEqual(["Lucilla", "Lucilla", "Hiyuki", "Hiyuki", "Hiyuki", "Hiyuki", "Hiyuki"]);
    expect(timeline.gameFrames).toBeGreaterThan(0);
    expect(timeline.realFrames).toBeGreaterThan(timeline.gameFrames); // liberations stop time
    expect(timeline.timeStopFrames).toBe(timeline.realFrames - timeline.gameFrames);
    const liberation = actions.find((action: Plain) => action.key === "ForeclaimingBladeLiberationBaseDMG");
    expect(liberation.timing).toMatchObject({ timeStopFrames: 360, missingFrameData: false });
    expect(liberation.timing.hitFrames.length).toBe(2);
    expect(dps.map((reading: Plain) => reading.source)).toEqual(["frames", "typed"]);
  });

  it("fills an echo action's main echo from the slot, and reports bad input as JSON errors", async () => {
    fresh();
    const out = await run("team-rotation", {
      characters: "Hiyuki",
      actions: [{ slot: 0, type: "echoAttacks", key: "Aleph1sCreationDMG" }],
    });
    expect(out.result.actions[0]).toMatchObject({ key: "Aleph1sCreationDMG", kind: "damage" });
    expect(out.result.actions[0].average).toBeGreaterThan(0);
    expect(await run("team-rotation", { characters: "Hiyuki", actions: "[{" })).toMatchObject({ ok: false, error: { code: "bad_actions" } });
    expect(await run("team-rotation", { characters: "Hiyuki" })).toMatchObject({ ok: false, error: { code: "missing_actions" } });
    expect(await run("team-rotation", { team: "nope" })).toMatchObject({ ok: false, error: { code: "unknown_team" } });
  });

  it("frames lists a character's action types and keys with frame data, and a main echo's", async () => {
    fresh();
    const character = await runAgentCommand("frames", { character: "Hiyuki" }, runtime);
    const blade = character.result.attacks.find((attack: Plain) => attack.key === "ForeclaimingBladeLiberationBaseDMG");
    expect(blade).toMatchObject({ type: "liberation", frames: { total: 360, timeStop: [0, 360] } });
    const echo = await runAgentCommand("frames", { echo: "ReminiscenceThrenodianVoidborneConstruct" }, runtime);
    expect(echo.result.attacks[0]).toMatchObject({ type: "echoAttacks", key: "Aleph1sCreationDMG" });
  });
});
