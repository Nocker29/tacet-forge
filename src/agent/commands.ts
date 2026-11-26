/**
 * Tacet Forge agent tool: commands an AI agent runs against a backup file
 * (see AGENTS.md). Every number comes from the app's own code: the backup is
 * loaded through the app's import (validation + migrations) into in-memory
 * Pinia stores, stats/damage through buildCharacterCalculationContext and
 * calcDamages, the optimizer through the app's processor worker, and "apply"
 * through the same store actions as equipping an optimizer result.
 *
 * Runs in Node through Vite's module runner (scripts/agent.mjs), which supplies
 * an in-memory localStorage and the worker message shim (`AgentRuntime`).
 */
import { createPinia, setActivePinia } from "pinia";
import { applyImportedDatabase, BackupImportError, getExportData } from "../utils/settingsBackup";
import { useCharacterStore } from "../stores/character";
import { useInventoryStore } from "../stores/inventory";
import { useTeamRotationsStore } from "../stores/teamRotations";
import { allCharactersList, getCharacterRosterDisplayName, getCharByName } from "../characters/characters";
import { getCharacterLevel, getSequenceLevel } from "../characters/characterOverview";
import {
  buildCharacterCalculationContext,
  resolveTeamEnemyConfig,
} from "../calculator/buildCharacterContext";
import { resolveCharactersForBuild } from "../calculator/buildOverride";
import { calcDamages } from "../calculator/attacks";
import { calcCharacterRotationDamage } from "../calculator/characterRotation";
import {
  filterEchoesForOptimizer,
  generateLoadouts,
  getOptimizerLoadoutHash,
  normalizeLoadoutFormat,
  normalizeOptimizerLoadout,
} from "../calculator/optimizer";
import { buildCharacterBuffUpdatesFromOptimizer } from "../calculator/syncOptimizerBuffs";
import { createSerializableContext, serializeEchoes } from "../workers/optimizerRun";
import { filterEchoesBySets } from "../echoes/optimizerProtection";
import { echoSetLabelMap, subStatLabelMap } from "../echoes/stats";
import { getCostByClass, mainEchoesData } from "../echoes/index";
import { buildAgentOptimizerContext } from "./optimizerContext";
import { calculatorStatePatch, withCalculatorStateFor } from "./calculatorState";
import {
  actionsFromSources,
  characterFrames,
  echoAttackFrames,
  FRAME_FORMAT,
  normalizeInlineActions,
  presetActions,
  presetEcho,
  runTeamRotation,
} from "./teamRotation";
import type { TeamRotationAction, TeamRotationInput } from "../calculator/teamRotation";
import { echoFramesSyncedAt } from "../echoes/frames";
import { computeEchoSetPassiveBuffs, computeMainEchoStats, readOptimizerSettings } from "./optimizerInputs";

type Plain = Record<string, any>;

/** Supplied by the CLI/MCP host (scripts/agent.mjs). */
export interface AgentRuntime {
  readText(path: string): string;
  writeText(path: string, text: string): void;
  exists(path: string): boolean;
  resolvePath(path: string): string;
  /** Starts a fresh instance of the app's processor worker and returns its message port. */
  createProcessor(): { send(message: Plain): void; onMessage(handler: (message: Plain) => void): void };
  now(): number;
}

export class AgentError extends Error {
  constructor(
    public code: string,
    message: string,
    public hint?: string,
  ) {
    super(message);
  }
}

export const AGENT_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------- session

interface Session {
  characters: Record<string, Plain>;
  inventory: Plain;
  dataPath: string;
}

function openSession(runtime: AgentRuntime, dataPath: unknown): Session {
  if (typeof dataPath !== "string" || !dataPath) {
    throw new AgentError(
      "missing_data",
      "Pass --data <path to a Tacet Forge / Wuthering Tools backup .json>.",
      "Ask the user to export one: Settings → Backup & Restore → Download .json.",
    );
  }
  const path = runtime.resolvePath(dataPath);
  if (!runtime.exists(path)) throw new AgentError("data_not_found", `No file at ${path}.`);
  setActivePinia(createPinia());
  try {
    applyImportedDatabase(runtime.readText(path));
  } catch (error) {
    if (error instanceof BackupImportError) throw new AgentError("invalid_backup", error.message);
    throw error;
  }
  return {
    characters: useCharacterStore().characters,
    inventory: useInventoryStore().$state,
    dataPath: path,
  };
}

function exportSession(): string {
  return JSON.stringify({
    meta: getExportData().meta,
    data: {
      character: JSON.stringify(useCharacterStore().$state),
      inventory: JSON.stringify(useInventoryStore().$state),
      teamRotations: JSON.stringify(useTeamRotationsStore().$state),
    },
  });
}

// ---------------------------------------------------------------- helpers

const rosterByKey = new Map(allCharactersList.map((entry: Plain) => [entry.key, entry]));

function resolveCharacter(session: Session, input: unknown): string {
  const wanted = String(input ?? "").trim();
  if (!wanted) throw new AgentError("missing_character", "Pass --character <key or name>.", "Run `characters` to list them.");
  const keys = Object.keys(session.characters);
  const match =
    keys.find((key) => key === wanted) ??
    keys.find((key) => key.toLowerCase() === wanted.toLowerCase()) ??
    keys.find((key) => getCharacterRosterDisplayName(key).toLowerCase() === wanted.toLowerCase());
  if (!match) {
    throw new AgentError("unknown_character", `No saved character "${wanted}" in this backup.`, "Run `characters` to list the saved ones.");
  }
  return match;
}

function resolveBuild(record: Plain, input: unknown): { id: string | null; name: string | null } {
  const builds = (record.builds ?? []) as Plain[];
  const active = builds.find((build) => build.id === record.activeBuildId);
  if (input == null || input === "") return { id: null, name: active?.name ?? null };
  const wanted = String(input);
  const build = builds.find((entry) => entry.id === wanted) ?? builds.find((entry) => entry.name?.toLowerCase() === wanted.toLowerCase());
  if (!build) throw new AgentError("unknown_build", `No build "${wanted}".`, "Run `characters` to list each character's builds.");
  return { id: build.id === record.activeBuildId ? null : build.id, name: build.name ?? null };
}

/**
 * The characters as the calculator sees them for one character/build: the
 * build's overrides (resolveCharactersForBuild) plus the state the
 * calculator saves on render (calculatorState.ts).
 */
function charactersForCalculation(characters: Record<string, Plain>, character: string, buildId: string | null, inventoryEchoes: Plain[]) {
  return withCalculatorStateFor(resolveCharactersForBuild(characters, character, buildId) as Record<string, Plain>, character, inventoryEchoes);
}

const round = (value: unknown, digits = 2) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : value ?? null;

const STAT_KEYS = [
  "totalHp", "totalAtk", "totalDef", "critRate", "critDMG", "energyRegen",
  "glacio", "fusion", "electro", "aero", "spectro", "havoc",
  "basicAttackDMGBonus", "heavyAttackDMGBonus", "resonanceSkillDMGBonus", "resonanceLiberationDMGBonus",
  "introSkillDMGBonus", "outroSkillDMGBonus", "echoDMGBonus", "healingBonus", "shieldBonus",
] as const;

/**
 * The app's final stats in the units its UI (and `--min-stat`) uses: percents
 * as percents (energyRegen is stored as a multiplier, 1.168 → 116.8). Zero
 * entries are left out; element DMG bonuses from buffs are applied at damage
 * time, so `damage` is the number to trust for those.
 */
function pickStats(finalStats: Plain) {
  const out: Plain = {};
  for (const key of STAT_KEYS) {
    const raw = finalStats?.[key];
    if (typeof raw !== "number" || raw === 0) continue;
    out[key] = round(key === "energyRegen" ? raw * 100 : raw);
  }
  return out;
}

function describeEcho(echo: Plain, holders: Map<string, Set<string>>) {
  const substats = [1, 2, 3, 4, 5]
    .map((n) => ({ stat: echo[`echoSubStatsType${n}`], value: echo[`echoSubStatsValue${n}`] }))
    .filter((entry) => entry.stat && entry.stat !== "none")
    .map((entry) => ({ stat: entry.stat, label: (subStatLabelMap as Plain)[entry.stat] ?? entry.stat, value: entry.value }));
  return {
    echoId: echo.echoId,
    echo: echo.echo,
    name: (mainEchoesData as Plain)[echo.echo]?.name ?? echo.echo,
    set: echo.echoSet ?? null,
    setLabel: (echoSetLabelMap as Plain)[echo.echoSet] ?? echo.echoSet ?? null,
    cost: echo.type ?? null,
    rank: echo.rank ?? null,
    mainStat: echo.stat ?? null,
    substats,
    heldBy: [...(holders.get(echo.echoId) ?? [])],
    locked: Boolean(echo.locked),
    favorite: Boolean(echo.favorite),
  };
}

function splitList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(splitList);
  if (value == null || value === "" || value === true) return [];
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- commands

interface ArgDef {
  name: string;
  type: "string" | "number" | "boolean" | "list" | "json";
  required?: boolean;
  description: string;
}

interface CommandDef {
  name: string;
  summary: string;
  args: ArgDef[];
  output: string;
  run(args: Plain, runtime: AgentRuntime): Promise<Plain>;
}

const DATA_ARG: ArgDef = {
  name: "data",
  type: "string",
  required: true,
  description: "Path to a backup .json (Settings → Backup & Restore → Download .json). Never modified.",
};
const CHARACTER_ARG: ArgDef = {
  name: "character",
  type: "string",
  required: true,
  description: "Character key or display name, e.g. Hiyuki (see `characters`).",
};
const BUILD_ARG: ArgDef = {
  name: "build",
  type: "string",
  description: "Build id or name (default: the active build).",
};

const commands: CommandDef[] = [
  {
    name: "describe",
    summary: "Every command with its arguments and output shape (machine-readable).",
    args: [],
    output: "{ schemaVersion, commands: [{ name, summary, args: [{ name, type, required, description }], output }] }",
    async run() {
      return {
        schemaVersion: AGENT_SCHEMA_VERSION,
        commands: commands.map(({ name, summary, args, output }) => ({ name, summary, args, output })),
      };
    },
  },
  {
    name: "characters",
    summary: "Saved characters with level, sequence, weapon, builds and saved optimizer settings.",
    args: [DATA_ARG],
    output:
      "{ characters: [{ key, name, element, weaponType, rarity, level, sequence, weapon, echoesEquipped, activeBuild, builds: [{ id, name, active }], optimizer: { target, sets, mainEchoes, minStats, damageType } }] }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const characters = Object.entries(session.characters)
        .filter(([key, record]) => rosterByKey.has(key) && record && typeof record === "object")
        .map(([key, record]) => {
          const roster = rosterByKey.get(key) as Plain;
          const builds = ((record.builds ?? []) as Plain[]).map((build) => ({
            id: build.id,
            name: build.name,
            active: build.id === record.activeBuildId,
          }));
          const settings = readOptimizerSettings(record);
          return {
            key,
            name: roster.name,
            element: roster.element,
            weaponType: roster.weapon,
            rarity: roster.rarity,
            level: getCharacterLevel(record),
            sequence: getSequenceLevel(record.resonanceChains),
            weapon: record.weapon ?? null,
            echoesEquipped: Object.values(record.echoes ?? {}).filter((slot: any) => slot?.echoId).length,
            activeBuild: builds.find((build) => build.active)?.name ?? null,
            builds,
            optimizer: {
              target: settings.target,
              sets: settings.setFilters,
              mainEchoes: settings.mainEchoes,
              minStats: settings.minStats,
              damageType: settings.damageType,
            },
          };
        });
      return { characters };
    },
  },
  {
    name: "echoes",
    summary: "Echoes in the inventory, filterable. Use the echoId values with `apply`.",
    args: [
      DATA_ARG,
      { name: "set", type: "list", description: "Only these set keys (see `catalog --what sets`)." },
      { name: "cost", type: "number", description: "Only this cost (1, 3 or 4)." },
      { name: "main-stat", type: "string", description: "Only this main stat key (e.g. CritRate, ATK, Glacio)." },
      { name: "held-by", type: "string", description: "Only echoes this character has equipped or in their preset." },
      { name: "free", type: "boolean", description: "Only echoes nobody holds." },
      { name: "limit", type: "number", description: "Max echoes to return (default 200)." },
    ],
    output: "{ total, returned, echoes: [{ echoId, echo, name, set, setLabel, cost, rank, mainStat, substats: [{ stat, label, value }], heldBy, locked, favorite }] }",
    async run(args, runtime) {
      openSession(runtime, args.data);
      const inventory = useInventoryStore();
      const holders = inventory.echoHolders as Map<string, Set<string>>;
      const sets = new Set(splitList(args.set));
      const heldBy = args["held-by"] ? String(args["held-by"]) : null;
      let echoes = ((inventory.echoes ?? []) as Plain[]).filter((echo) => echo.echo);
      if (sets.size) echoes = echoes.filter((echo) => sets.has(echo.echoSet));
      if (args.cost != null) echoes = echoes.filter((echo) => Number(echo.type) === Number(args.cost));
      if (args["main-stat"]) echoes = echoes.filter((echo) => echo.stat === args["main-stat"]);
      if (heldBy) echoes = echoes.filter((echo) => holders.get(echo.echoId)?.has(heldBy));
      if (args.free) echoes = echoes.filter((echo) => !holders.get(echo.echoId)?.size);
      const limit = Number(args.limit ?? 200);
      return {
        total: echoes.length,
        returned: Math.min(limit, echoes.length),
        echoes: echoes.slice(0, limit).map((echo) => describeEcho(echo, holders)),
      };
    },
  },
  {
    name: "stats",
    summary: "Final stats of a character's build, exactly as the calculator shows them (all saved buffs applied).",
    args: [DATA_ARG, CHARACTER_ARG, BUILD_ARG],
    output: "{ character, build, weapon, level, finalStats: { totalAtk, totalHp, critRate, critDMG, energyRegen, <element>, <skill bonuses>… }, echoes: [echo…] }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const character = resolveCharacter(session, args.character);
      const record = session.characters[character];
      const build = resolveBuild(record, args.build);
      const inventory = useInventoryStore();
      const characters = charactersForCalculation(session.characters, character, build.id, inventory.echoes);
      const effective = characters[character] ?? {};
      const calc = await buildCharacterCalculationContext(character, characters, resolveTeamEnemyConfig(effective), inventory.echoes);
      const holders = inventory.echoHolders as Map<string, Set<string>>;
      const echoes = Object.values(effective.echoes ?? {})
        .map((slot: any) => slot?.echoId && inventory.getEchoById(slot.echoId))
        .filter(Boolean)
        .map((echo: any) => describeEcho(echo, holders));
      return {
        character,
        build: build.name,
        weapon: effective.weapon ?? null,
        level: calc.characterLevel,
        finalStats: pickStats(calc.finalStats),
        echoes,
      };
    },
  },
  {
    name: "damage",
    summary: "Damage of every attack and every saved rotation for a build, as the calculator computes it.",
    args: [DATA_ARG, CHARACTER_ARG, BUILD_ARG],
    output:
      "{ character, build, attacks: [{ group, key, label, normal, average, crit, healing, shield }], rotations: [{ id, name, normal, average, crit }] }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const character = resolveCharacter(session, args.character);
      const build = resolveBuild(session.characters[character], args.build);
      const echoesInventory = useInventoryStore().echoes;
      const characters = charactersForCalculation(session.characters, character, build.id, echoesInventory);
      const effective = characters[character] ?? {};
      const enemy = resolveTeamEnemyConfig(effective);
      const calc = await buildCharacterCalculationContext(character, characters, enemy, echoesInventory);
      const all = (calcDamages(calc.context) ?? {}) as Plain;
      const attacks: Plain[] = [];
      for (const [group, list] of Object.entries(all)) {
        if (group === "rotations" || !Array.isArray(list)) continue;
        for (const attack of list as Plain[]) {
          const damage = attack?.damage ?? {};
          attacks.push({
            group,
            key: attack.key,
            label: attack.label,
            normal: round(damage.totalDamage ?? damage.damage, 0),
            average: round(damage.avgDamage ?? damage.damage, 0),
            crit: round(damage.critDamage ?? damage.damage, 0),
            healing: round(damage.healing, 0),
            shield: round(damage.shield, 0),
          });
        }
      }
      const rotations: Plain[] = [];
      for (const rotation of (effective.rotations ?? []) as Plain[]) {
        const result = await calcCharacterRotationDamage(
          {
            id: rotation.id,
            name: rotation.name,
            description: rotation.description,
            duration: rotation.duration ?? null,
            mainEcho: rotation.echo ?? null,
            mainEchoRank: rotation.echoRank ?? null,
            actions: rotation.actions ?? [],
          },
          { chosenChar: calc.chosenChar, characterLevel: calc.characterLevel, context: calc.context },
          character,
          characters,
          enemy,
          echoesInventory,
        );
        rotations.push({
          id: rotation.id,
          name: rotation.name,
          normal: round(result.damageAggregation.normalDamage, 0),
          average: round(result.damageAggregation.avgDamage, 0),
          crit: round(result.damageAggregation.critDamage, 0),
        });
      }
      return { character, build: build.name, attacks, rotations };
    },
  },
  {
    name: "targets",
    summary: "Valid --target values for `optimize`: stats, every attack, and the character's saved rotations.",
    args: [DATA_ARG, CHARACTER_ARG],
    output: "{ character, current, targets: [{ value, label, group }] }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const character = resolveCharacter(session, args.character);
      const record = session.characters[character];
      const calc = await buildCharacterCalculationContext(character, session.characters, resolveTeamEnemyConfig(record), []);
      const targets: Plain[] = [
        ["totalHp", "HP"],
        ["totalAtk", "ATK"],
        ["totalDef", "DEF"],
        ["totalCritRate", "Crit Rate"],
        ["totalCritDMG", "Crit DMG"],
        ["energyRegen", "Energy Regen"],
      ].map(([key, label]) => ({ value: `Stat:${key}`, label, group: "Stats" }));
      const groups: Array<[string, string]> = [
        ["basicAttacks", "Basic"],
        ["skillAttacks", "Skill"],
        ["forteCircuitAttacks", "Forte Circuit"],
        ["liberationAttacks", "Liberation"],
        ["introAttacks", "Intro"],
        ["outroAttacks", "Outro"],
        ["tuneBreakAttacks", "TuneBreak"],
      ];
      for (const [groupKey, label] of groups) {
        for (const attack of (calc.chosenChar?.[groupKey]?.attacks ?? []) as Plain[]) {
          targets.push({ value: `Attack:${groupKey}|${attack.key}`, label: attack.label, group: label });
        }
      }
      for (const rotation of (record.rotations ?? []) as Plain[]) {
        targets.push({ value: `Rotation:${rotation.id}`, label: rotation.name, group: "Rotations" });
      }
      return { character, current: readOptimizerSettings(record).target, targets };
    },
  },
  {
    name: "catalog",
    summary: "Reference lists: echo set keys, echo keys (for --main-echoes) with their cost, substat keys.",
    args: [{ name: "what", type: "string", description: "sets | main-echoes | substats (default: all)." }],
    output: "{ sets?: [{ key, label }], mainEchoes?: [{ key, name, cost }] (every echo; the main slot is usually cost 4), substats?: [{ key, label }] }",
    async run(args) {
      const what = String(args.what ?? "all");
      const out: Plain = {};
      if (what === "all" || what === "sets") {
        out.sets = Object.entries(echoSetLabelMap).map(([key, label]) => ({ key, label }));
      }
      if (what === "all" || what === "main-echoes") {
        // Any echo can be the main echo; the main slot is usually a cost-4 one.
        out.mainEchoes = Object.entries(mainEchoesData as Plain).map(([key, echo]) => ({
          key,
          name: echo?.name ?? key,
          cost: getCostByClass(echo?.class),
        }));
      }
      if (what === "all" || what === "substats") {
        out.substats = Object.entries(subStatLabelMap).map(([key, label]) => ({ key, label }));
      }
      return out;
    },
  },
  {
    name: "optimize",
    summary:
      "Best echo loadouts for a character, with the app's optimizer. Defaults to the character's saved optimizer settings; any option overrides them.",
    args: [
      DATA_ARG,
      CHARACTER_ARG,
      { name: "target", type: "string", description: "What to maximize, e.g. Attack:liberationAttacks|<key>, Rotation:<id>, Stat:totalAtk (see `targets`)." },
      { name: "sets", type: "list", description: "Eligible echo set keys, comma-separated (required by the app; see `catalog --what sets`)." },
      { name: "main-echoes", type: "list", description: "Cost-4 echo keys allowed in the main slot (see `catalog --what main-echoes`)." },
      { name: "min-stat", type: "list", description: "Stat floors like energyRegen>=120,critRate>=60 (keys from `stats`.finalStats)." },
      { name: "damage-type", type: "string", description: "Normal | Average | Crit (default: saved, else Average)." },
      { name: "loadout-format", type: "string", description: "Any | 43311 | 44111 (cost layout)." },
      { name: "protection", type: "string", description: "app (default: skip echoes held by protected characters, as the app) | none (use every echo)." },
      { name: "top", type: "number", description: "How many results (default 5)." },
      { name: "max-combinations", type: "number", description: "Stop after checking this many loadouts (default 3000000)." },
      { name: "time-limit", type: "number", description: "Stop after this many seconds (default 180)." },
    ],
    output:
      "{ character, settings: {…used}, echoesConsidered, combinationsChecked, complete, stoppedBy, results: [{ rank, value, echoIds: [main, …], echoes: [echo…], finalStats, takesFrom: [{ character, count }] }] }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const character = resolveCharacter(session, args.character);
      const record = session.characters[character];
      const saved = readOptimizerSettings(record);
      const setFilters = args.sets != null ? splitList(args.sets) : saved.setFilters;
      const mainEchoes = args["main-echoes"] != null ? splitList(args["main-echoes"]) : saved.mainEchoes;
      const target = (args.target as string | undefined) ?? saved.target;
      const damageType = (args["damage-type"] as OptimizerDamage | undefined) ?? saved.damageType;
      const loadoutFormat = normalizeLoadoutFormat(args["loadout-format"] ?? saved.loadoutFormat);
      const minStats =
        args["min-stat"] != null
          ? splitList(args["min-stat"]).map((rule) => {
              const match = /^([A-Za-z]+)\s*>=\s*(-?\d+(?:\.\d+)?)$/.exec(rule);
              if (!match) throw new AgentError("bad_min_stat", `Can't read min stat "${rule}".`, "Use stat>=value, e.g. energyRegen>=120.");
              return { stat: match[1], minValue: match[2] };
            })
          : saved.minStats;
      if (!target) throw new AgentError("missing_target", "No optimization target saved or given.", "Pass --target (run `targets` for the options).");
      if (!setFilters.length) throw new AgentError("missing_sets", "The optimizer needs at least one echo set.", "Pass --sets (run `catalog --what sets`).");
      if (!mainEchoes.length) throw new AgentError("missing_main_echoes", "The optimizer needs at least one main echo.", "Pass --main-echoes (run `catalog --what main-echoes`).");

      const inventory = useInventoryStore();
      let echoes = filterEchoesBySets(filterEchoesForOptimizer(inventory.echoes) as Plain[], setFilters);
      const protection = String(args.protection ?? "app");
      if (protection === "app") {
        const protectedIds = inventory.protectedEchoIds(character) as Map<string, string[]>;
        echoes = echoes.filter((echo) => !protectedIds.has(echo.echoId));
      }

      const characters = charactersForCalculation(session.characters, character, null, inventory.echoes);
      const { context, rotationData } = await buildAgentOptimizerContext(character, characters, inventory.echoes, target);
      if (target.startsWith("Rotation:") && !rotationData) {
        throw new AgentError("unknown_rotation", `No saved rotation ${target.slice(9)}.`, "Run `targets` for the rotations.");
      }
      const topN = Math.max(1, Number(args.top ?? 5));
      const echoSetPassiveBuffs = computeEchoSetPassiveBuffs(characters[character], setFilters);
      const mainEchoStats = computeMainEchoStats(characters[character], character, mainEchoes);
      const run = await runOptimizer(runtime, {
        echoes,
        context,
        topN,
        mainEchoKeys: mainEchoes,
        minStats,
        echoSetPassiveBuffs,
        mainEchoStats,
        target,
        damageType,
        rotationData,
        loadoutFormat,
        maxCombinations: Number(args["max-combinations"] ?? 3_000_000),
        timeLimitMs: Number(args["time-limit"] ?? 180) * 1000,
      });

      const holders = inventory.echoHolders as Map<string, Set<string>>;
      return {
        character,
        settings: { target, sets: setFilters, mainEchoes, minStats, damageType, loadoutFormat, protection, top: topN },
        echoesConsidered: echoes.length,
        combinationsChecked: run.checked,
        complete: run.stoppedBy === null,
        stoppedBy: run.stoppedBy,
        results: run.results.map((result, index) => {
          const echoIds = (result.loadout as Plain[]).map((echo) => echo.echoId);
          const counts = new Map<string, number>();
          for (const id of echoIds) {
            for (const holder of holders.get(id) ?? []) if (holder !== character) counts.set(holder, (counts.get(holder) ?? 0) + 1);
          }
          return {
            rank: index + 1,
            value: round(result.targetValue, 2),
            echoIds,
            echoes: echoIds.map((id) => describeEcho(inventory.getEchoById(id), holders)),
            finalStats: pickStats(result.context?.finalStats ?? {}),
            takesFrom: [...counts].map(([holder, count]) => ({ character: holder, count })),
          };
        }),
      };
    },
  },
  {
    name: "apply",
    summary:
      "Equip echoes on a character as a NEW build and write a NEW backup file for the user to import. The input file is never changed.",
    args: [
      DATA_ARG,
      CHARACTER_ARG,
      { name: "echoes", type: "list", required: true, description: "Up to 5 echoIds, main echo first (e.g. `echoIds` from an `optimize` result)." },
      { name: "build-name", type: "string", description: "Name of the new build (default: Agent build <date>)." },
      { name: "out", type: "string", description: "Output path (default: next to --data, <name>.agent-<character>-<time>.json). Never the input file." },
      { name: "keep-active", type: "boolean", description: "Keep the current build active (the new one is saved but not equipped)." },
    ],
    output: "{ character, build: { id, name, active }, echoes: [echo…], finalStats, out, next }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const character = resolveCharacter(session, args.character);
      const echoIds = splitList(args.echoes);
      if (!echoIds.length || echoIds.length > 5) throw new AgentError("bad_echoes", "Pass 1–5 echoIds with --echoes, main echo first.");
      const inventory = useInventoryStore();
      for (const id of echoIds) {
        if (!inventory.getEchoById(id)) throw new AgentError("unknown_echo", `No echo ${id} in the inventory.`, "Use echoIds from `optimize` or `echoes`.");
      }
      const out = runtime.resolvePath(
        (args.out as string | undefined) ??
          session.dataPath.replace(/\.json$/i, "") +
            `.agent-${character}-${new Date(runtime.now()).toISOString().replace(/[:.]/g, "-")}.json`,
      );
      if (out === session.dataPath) throw new AgentError("would_overwrite_input", "--out must not be the input file.");
      if (runtime.exists(out)) throw new AgentError("out_exists", `${out} already exists.`, "Pass another --out.");

      const characterStore = useCharacterStore();
      const previousBuildId = characterStore.characters[character]?.activeBuildId ?? null;
      const name = String(args["build-name"] ?? `Agent build ${new Date(runtime.now()).toISOString().slice(0, 10)}`);
      const build = characterStore.createBuild(character, name, { from: "active" });
      // What equipping an optimizer result does (OptimizerWorkspaceSpotlight.vue's equipLoadout).
      characterStore.applyEchoLoadout(character, { echoIds, presetId: null, fillSlots: echoIds.length });
      // Save what the calculator would on opening the new build (sets, main echo).
      characterStore.setCharacterData(character, calculatorStatePatch(characterStore.characters[character], inventory.echoes));
      const loadout = echoIds.map((id) => inventory.getEchoById(id));
      const buffUpdates = buildCharacterBuffUpdatesFromOptimizer(
        characterStore.characters[character] ?? {},
        loadout,
        (echoId: string) => inventory.getEchoById(echoId)?.echo,
      );
      if (buffUpdates.mainEcho || buffUpdates.echoSetPassives) characterStore.setCharacterData(character, buffUpdates);
      if (args["keep-active"] && previousBuildId) characterStore.equipBuild(character, previousBuildId);

      const calc = await buildCharacterCalculationContext(
        character,
        charactersForCalculation(characterStore.characters, character, args["keep-active"] ? build.id : null, inventory.echoes),
        resolveTeamEnemyConfig(characterStore.characters[character]),
        inventory.echoes,
      );
      runtime.writeText(out, exportSession());
      const holders = inventory.echoHolders as Map<string, Set<string>>;
      return {
        character,
        build: { id: build.id, name, active: !args["keep-active"] },
        echoes: loadout.map((echo) => describeEcho(echo, holders)),
        finalStats: pickStats(calc.finalStats),
        out,
        next: "Ask the user to open Tacet Forge → Settings → Backup & Restore → Import & overwrite, choose this file, and check the preview. Undo last import restores their previous data.",
      };
    },
  },
  {
    name: "rotations",
    summary:
      "Saved team rotations, each character's saved rotations, and the app's built-in rotation presets (which are empty for many characters).",
    args: [DATA_ARG, { name: "character", type: "string", description: "Only this character's rotations and presets." }],
    output:
      "{ teams: [{ id, name, characters, buildIds, actions, duration }], characterRotations: [{ character, id, name, actions, duration }], presets: [{ character, name, actions, echo }], charactersWithoutPresets: [key…] }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const only = args.character != null ? resolveCharacter(session, args.character) : null;
      const keys = only ? [only] : Object.keys(session.characters);
      const teams = (useTeamRotationsStore().teams as Plain[])
        .filter((team) => !only || (team.characterIds ?? []).includes(only))
        .map((team) => ({
          id: team.id,
          name: team.name,
          characters: team.characterIds,
          buildIds: team.buildIds ?? [null, null, null],
          actions: (team.actions ?? []).length,
          duration: team.duration ?? null,
        }));
      const characterRotations = keys.flatMap((key) =>
        ((session.characters[key]?.rotations ?? []) as Plain[]).map((rotation) => ({
          character: key,
          id: rotation.id,
          name: rotation.name,
          actions: (rotation.actions ?? []).length,
          duration: rotation.duration ?? null,
        })),
      );
      const presets: Plain[] = [];
      const charactersWithoutPresets: string[] = [];
      for (const key of keys) {
        const data = (await getCharByName(key).catch(() => null)) as Plain | null;
        const list = ((data?.rotations ?? []) as Plain[]).filter((preset) => presetActions(preset).length);
        if (!list.length) charactersWithoutPresets.push(key);
        for (const preset of list) {
          presets.push({ character: key, name: preset.name, actions: presetActions(preset).length, echo: presetEcho(preset) });
        }
      }
      return { teams, characterRotations, presets, charactersWithoutPresets };
    },
  },
  {
    name: "team-rotation",
    summary:
      "Damage, DPS and frame-data timeline of a team rotation (up to 3 characters), with the app's Teams calculation. Use a saved team (--team), or build one from --characters plus --actions or --slot-rotations.",
    args: [
      DATA_ARG,
      { name: "team", type: "string", description: "Saved team rotation id or name (see `rotations`)." },
      { name: "characters", type: "list", description: "Up to 3 character keys in slot order (slot 0,1,2), e.g. Hiyuki,Lucilla,Chisa." },
      { name: "builds", type: "list", description: "Per-slot build id or name; empty = active build (e.g. ,MyBuild,)." },
      {
        name: "actions",
        type: "json",
        description:
          "Inline actions as JSON, or @path to a JSON file: [{ \"slot\": 0, \"type\": \"intro\", \"key\": \"FrostedgeDMG\", \"count\": 1 }, …] in play order. Types and keys: `frames --character X`; echo actions use type echoAttacks (+ optional mainEcho); { \"slot\": 0, \"type\": \"wait\", \"frames\": 30 } waits.",
      },
      {
        name: "slot-rotations",
        type: "list",
        description:
          "Instead of --actions: per slot, a saved rotation id/name of that character or a preset name, appended slot after slot (like the Teams page's import).",
      },
      { name: "duration", type: "number", description: "Rotation length in seconds for the typed-duration DPS (frame-data DPS needs none)." },
    ],
    output:
      "{ team: { name, characters, builds, duration, source }, total: { normal, average, crit, healing, shield }, dps: [{ source: frames|typed, seconds, normal, average, crit, actionsWithoutFrameData }], headlineDps, perCharacter: [{ character, normal, average, crit, shareOfAverage }], actions: [{ order, slot, character, type, key, label, count, normal, average, crit, kind, timing: { startFrame, gameFrames, realFrames, timeStopFrames, hitFrames, missingFrameData } }], timeline: { gameFrames, realFrames, gameSeconds, realSeconds, timeStopFrames, actionsWithoutFrameData, blocks, landings } | null, notes }",
    async run(args, runtime) {
      const session = openSession(runtime, args.data);
      const teamsStore = useTeamRotationsStore();
      let team: TeamRotationInput & { enemyConfig?: Plain };
      let source: string;

      if (args.team != null) {
        const wanted = String(args.team);
        const saved = (teamsStore.teams as Plain[]).find(
          (entry) => entry.id === wanted || String(entry.name ?? "").toLowerCase() === wanted.toLowerCase(),
        );
        if (!saved) throw new AgentError("unknown_team", `No saved team rotation "${wanted}".`, "Run `rotations` to list them.");
        team = { ...(JSON.parse(JSON.stringify(saved)) as Plain), duration: args.duration ?? saved.duration ?? null } as never;
        source = "saved team";
      } else {
        const characterIds = splitList(args.characters).map((name) => resolveCharacter(session, name));
        if (!characterIds.length || characterIds.length > 3) {
          throw new AgentError("bad_team", "Pass --team, or --characters with 1–3 characters.", "Run `rotations` for saved teams.");
        }
        const buildInputs = args.builds != null ? String(Array.isArray(args.builds) ? args.builds.join(",") : args.builds).split(",") : [];
        const buildIds = characterIds.map((key, slot) => {
          const wantedBuild = buildInputs[slot]?.trim();
          return wantedBuild ? resolveBuild(session.characters[key], wantedBuild).id : null;
        });
        let actions: TeamRotationAction[];
        if (args.actions != null) {
          try {
            const text = typeof args.actions === "string" ? args.actions : null;
            const parsed =
              text == null ? args.actions : JSON.parse(text.startsWith("@") ? runtime.readText(runtime.resolvePath(text.slice(1))) : text);
            actions = normalizeInlineActions(parsed);
          } catch (error) {
            throw new AgentError("bad_actions", `Can't read --actions: ${error instanceof Error ? error.message : String(error)}`, "See `team-rotation --help`.");
          }
          source = "inline actions";
        } else if (args["slot-rotations"] != null) {
          const names = String(Array.isArray(args["slot-rotations"]) ? args["slot-rotations"].join(",") : args["slot-rotations"]).split(",");
          const sources = [];
          for (let slot = 0; slot < characterIds.length; slot++) {
            const name = names[slot]?.trim();
            if (!name) continue;
            const key = characterIds[slot];
            const saved = ((session.characters[key]?.rotations ?? []) as Plain[]).find(
              (rotation) => rotation.id === name || String(rotation.name ?? "").toLowerCase() === name.toLowerCase(),
            );
            const data = saved ? null : ((await getCharByName(key)) as Plain);
            const preset =
              saved ?? ((data?.rotations ?? []) as Plain[]).find((entry) => String(entry.name ?? "").toLowerCase() === name.toLowerCase());
            if (!preset || !presetActions(preset).length) {
              throw new AgentError("unknown_rotation", `No rotation or preset "${name}" with actions for ${key}.`, `Run \`rotations --character ${key}\`.`);
            }
            sources.push({ slot: slot as 0 | 1 | 2, actions: presetActions(preset), echo: presetEcho(preset) });
          }
          actions = actionsFromSources(sources);
          source = "slot rotations";
        } else {
          throw new AgentError("missing_actions", "Pass --actions or --slot-rotations (or --team).", "See `team-rotation --help`.");
        }
        // A new team's enemy, as the Teams page creates it.
        const defaults = teamsStore.createTeam("agent");
        teamsStore.deleteTeam(defaults.id);
        team = {
          name: "Agent team",
          characterIds: [0, 1, 2].map((slot) => characterIds[slot] ?? null),
          buildIds: [0, 1, 2].map((slot) => buildIds[slot] ?? null),
          actions,
          duration: args.duration ?? null,
          enemyConfig: defaults.enemyConfig,
        };
      }

      const inventoryEchoes = useInventoryStore().echoes;
      // Each member as the calculator leaves it after rendering (calculatorState.ts),
      // so these numbers agree with `damage` for the same build.
      let characters = session.characters as Record<string, Plain>;
      for (const key of team.characterIds) if (key) characters = withCalculatorStateFor(characters, key, inventoryEchoes);
      // Echo actions need their echo; the Teams page fills in the slot's main echo when adding one.
      team.actions = team.actions.map((action) => {
        if (action.type !== "echoAttacks" || action.mainEcho) return action;
        const key = team.characterIds[action.slot];
        const member = key ? resolveCharactersForBuild(characters, key, team.buildIds?.[action.slot] ?? null)[key] : null;
        return { ...action, mainEcho: member?.mainEcho?.echo ?? null, mainEchoRank: action.mainEchoRank ?? member?.mainEcho?.rank ?? 5 };
      });
      const result = await runTeamRotation(team, characters, (team.enemyConfig ?? {}) as never, inventoryEchoes);
      const notes: string[] = [];
      if (!result.timeline) notes.push("No frame data for these characters: no timeline or frame-data DPS; pass --duration for a typed DPS.");
      else if (result.timeline.actionsWithoutFrameData) {
        notes.push(`${result.timeline.actionsWithoutFrameData} action(s) have no frame data and count as 0 frames.`);
      }
      notes.push("Buff windows aren't modelled by the app: buffs apply as configured on each character and action, not by time.");
      return {
        team: { name: team.name, characters: team.characterIds, builds: team.buildIds, duration: team.duration ?? null, source },
        ...result,
        notes,
      };
    },
  },
  {
    name: "frames",
    summary:
      "A character's attacks by action type (the type/key pairs rotations use) with wuwalab frame data, or a main echo's attacks with --echo. No --data needed.",
    args: [
      { name: "character", type: "string", description: "Character key, e.g. Hiyuki (any released character, saved or not)." },
      { name: "echo", type: "string", description: "Main echo key for its echoAttacks (see `catalog --what main-echoes`)." },
    ],
    output:
      "{ character? | echo?, syncedAt, format, attacks: [{ type, key, label, frames: { total, cancel, noSwap, timeStop, motionStop, cooldown, onCast, hits, offField, shared } | null }] }",
    async run(args) {
      if (args.echo != null) {
        const echo = echoAttackFrames(String(args.echo));
        if (!echo) throw new AgentError("unknown_echo", `No main echo "${args.echo}".`, "Run `catalog --what main-echoes`.");
        return { ...echo, syncedAt: echoFramesSyncedAt, format: FRAME_FORMAT };
      }
      const wanted = String(args.character ?? "").trim();
      if (!wanted) throw new AgentError("missing_argument", "Pass --character or --echo.");
      const entry = (allCharactersList as Plain[]).find(
        (character) =>
          character.key.toLowerCase() === wanted.toLowerCase() ||
          getCharacterRosterDisplayName(character.key).toLowerCase() === wanted.toLowerCase(),
      );
      if (!entry) throw new AgentError("unknown_character", `No character "${wanted}".`);
      const data = (await getCharByName(entry.key)) as Plain;
      return { character: entry.key, ...characterFrames(data), format: FRAME_FORMAT };
    },
  },
];

type OptimizerDamage = "Normal" | "Average" | "Crit";

// ---------------------------------------------------------------- optimizer run

interface RunInput {
  echoes: Plain[];
  context: Plain;
  topN: number;
  mainEchoKeys: string[];
  minStats: Plain[];
  echoSetPassiveBuffs: Plain;
  mainEchoStats: Plain;
  target: string;
  damageType: string;
  rotationData: Plain | null;
  loadoutFormat: string;
  maxCombinations: number;
  timeLimitMs: number;
}

/**
 * The generator worker's loop (generateLoadouts, normalized + deduplicated)
 * feeding the app's own processor worker, merged into a global top-N like
 * runOptimizerWorkers. Single process; batches of 5,000.
 */
async function runOptimizer(runtime: AgentRuntime, input: RunInput) {
  const processor = runtime.createProcessor();
  let pending: ((message: Plain) => void) | null = null;
  processor.onMessage((message) => pending?.(message));
  const request = (message: Plain) =>
    new Promise<Plain>((resolve) => {
      pending = resolve;
      processor.send(message);
    });

  const ready = await request({
    type: "init",
    data: {
      context: createSerializableContext(input.context),
      minStats: input.minStats.map((entry) => ({ ...entry })),
      echoSetPassiveBuffs: JSON.parse(JSON.stringify(input.echoSetPassiveBuffs)),
      mainEchoStats: JSON.parse(JSON.stringify(input.mainEchoStats)),
      target: input.target,
      damageType: input.damageType,
      rotationData: input.rotationData ? JSON.parse(JSON.stringify(input.rotationData)) : null,
      topN: input.topN,
    },
  });
  if (ready.type !== "ready") throw new AgentError("optimizer_failed", `Optimizer didn't start: ${ready.error ?? ready.type}`);

  const heap: Plain[] = [];
  const seen = new Set<number>();
  const merge = (results: Plain[]) => {
    for (const result of results ?? []) {
      if (!Array.isArray(result?.loadout) || !result.loadout.length) continue;
      const hash = getOptimizerLoadoutHash(result.loadout);
      if (seen.has(hash)) continue;
      seen.add(hash);
      heap.push({ ...result, targetValue: Number(result.targetValue) });
    }
    heap.sort((a, b) => b.targetValue - a.targetValue);
    heap.length = Math.min(heap.length, input.topN);
  };

  const started = runtime.now();
  const generatedSeen = new Set<number>();
  let batch: Plain[] = [];
  let checked = 0;
  let batchId = 0;
  let stoppedBy: string | null = null;
  const flush = async () => {
    if (!batch.length) return;
    const response = await request({ type: "process", data: { batch, batchId: batchId++ } });
    if (response.type === "error") throw new AgentError("optimizer_failed", response.error ?? "Processor error");
    checked += response.processed ?? batch.length;
    merge(response.results);
    batch = [];
  };

  const serialized = serializeEchoes(input.echoes);
  for (const loadout of generateLoadouts(
    filterEchoesForOptimizer(serialized) as Plain[],
    input.mainEchoKeys,
    0,
    [],
    0,
    new Set(),
    new Set(),
    normalizeLoadoutFormat(input.loadoutFormat),
    undefined,
    0,
    1,
  ) as Iterable<Plain[]>) {
    const normalized = normalizeOptimizerLoadout(loadout);
    const hash = getOptimizerLoadoutHash(normalized);
    if (generatedSeen.has(hash)) continue;
    generatedSeen.add(hash);
    batch.push(normalized.slice());
    if (batch.length >= 5000) {
      await flush();
      if (checked >= input.maxCombinations) {
        stoppedBy = "max-combinations";
        break;
      }
      if (runtime.now() - started >= input.timeLimitMs) {
        stoppedBy = "time-limit";
        break;
      }
    }
  }
  if (!stoppedBy) await flush();
  processor.send({ type: "stop" });
  return { results: heap, checked, stoppedBy };
}

// ---------------------------------------------------------------- entry

export function listCommandNames(): string[] {
  return commands.map((command) => command.name);
}

export function getCommand(name: string): CommandDef | undefined {
  return commands.find((command) => command.name === name);
}

/** Runs a command; always resolves to `{ ok: true, result }` or `{ ok: false, error }`. */
export async function runAgentCommand(name: string, args: Plain, runtime: AgentRuntime): Promise<Plain> {
  const command = getCommand(name);
  if (!command) {
    return {
      ok: false,
      error: { code: "unknown_command", message: `Unknown command "${name}".`, hint: `Commands: ${listCommandNames().join(", ")}. Run \`describe\` for details.` },
    };
  }
  const missing = command.args.filter((arg) => arg.required && (args[arg.name] == null || args[arg.name] === ""));
  if (missing.length) {
    return {
      ok: false,
      error: {
        code: "missing_argument",
        message: `Missing argument: ${missing.map((arg) => arg.name).join(", ")}.`,
        hint: `Run \`${name} --help\`.`,
      },
    };
  }
  try {
    return { ok: true, command: name, result: await command.run(args, runtime) };
  } catch (error) {
    if (error instanceof AgentError) {
      return { ok: false, error: { code: error.code, message: error.message, hint: error.hint ?? null } };
    }
    return { ok: false, error: { code: "internal_error", message: error instanceof Error ? error.message : String(error) } };
  }
}
