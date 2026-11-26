/**
 * Tacet Forge agent tool: team rotations, saved rotations and frame data.
 * Wraps the app's own team-rotation engine (calcTeamRotationDamage, which
 * also computes the frame-data timing) and the readings the Teams page shows
 * (rotationDpsReadings, headlineDps, calcFrameTimeline, buildTimelineStrip).
 * Nothing here recomputes damage or timing itself.
 */
import {
  calcTeamRotationDamage,
  calcFrameTimeline,
  convertRotationActionsForSlot,
  headlineDps,
  rotationDpsReadings,
  type SourceRotationAction,
  type TeamRotationAction,
  type TeamRotationInput,
} from "../calculator/teamRotation";
import { rotationLength, framesToSeconds, type RotationTiming, type TimedAction } from "../calculator/rotationTiming";
import { buildTimelineStrip } from "../calculator/rotationTimelineStrip";
import { echoFrames } from "../echoes/frames";
import type { AttackFrames } from "../calculator/frameData";
import { mainEchoesData } from "../echoes/index";
import type { TeamEnemyConfig } from "../calculator/buildCharacterContext";

type Plain = Record<string, any>;

/** Action `type` → the block of a character's data holding those attacks. */
export const ACTION_TYPE_BLOCKS: Record<string, string> = {
  basic: "basicAttacks",
  skill: "skillAttacks",
  forteCircuit: "forteCircuitAttacks",
  liberation: "liberationAttacks",
  intro: "introAttacks",
  outro: "outroAttacks",
  tuneBreak: "tuneBreakAttacks",
};

/** A preset's actions: presets come either as `{ actions }` or `{ data: { actions } }`. */
export function presetActions(preset: Plain): SourceRotationAction[] {
  return (preset?.actions ?? preset?.data?.actions ?? []) as SourceRotationAction[];
}

export function presetEcho(preset: Plain): string | null {
  return preset?.echo ?? preset?.data?.echo ?? null;
}

/**
 * Team actions from per-slot sources (a character's saved rotation or a
 * preset), appended slot after slot like the Teams page's "import rotation"
 * in append mode. Echo actions keep their own main echo, falling back to the
 * source rotation's.
 */
export function actionsFromSources(sources: Array<{ slot: 0 | 1 | 2; actions: SourceRotationAction[]; echo: string | null }>) {
  const actions: TeamRotationAction[] = [];
  for (const source of sources) {
    const withEcho = source.actions.map((action) =>
      action.type === "echoAttacks" ? { ...action, mainEcho: action.mainEcho ?? source.echo } : action,
    );
    actions.push(...convertRotationActionsForSlot(withEcho, source.slot, actions.length + 1));
  }
  return actions;
}

/** Inline actions as given by an agent: fill ids and order, keep the rest. */
export function normalizeInlineActions(raw: unknown): TeamRotationAction[] {
  if (!Array.isArray(raw)) throw new Error("Actions must be a JSON list.");
  return raw.map((entry, index) => {
    const action = (entry ?? {}) as Plain;
    const slot = Number(action.slot ?? 0);
    if (![0, 1, 2].includes(slot)) throw new Error(`Action #${index + 1}: slot must be 0, 1 or 2.`);
    if (!action.key && action.type !== "wait") throw new Error(`Action #${index + 1}: missing key.`);
    if (!action.type) throw new Error(`Action #${index + 1}: missing type.`);
    return {
      ...action,
      id: String(action.id ?? `a${index + 1}`),
      slot: slot as 0 | 1 | 2,
      order: Number(action.order ?? index + 1),
      key: String(action.key ?? ""),
      type: String(action.type),
      count: action.count == null ? 1 : Number(action.count),
    } as TeamRotationAction;
  });
}

const round = (value: unknown, digits = 0) =>
  typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

function frozen(timed: TimedAction) {
  return timed.realFrames - timed.gameFrames;
}

/** Runs the app's team-rotation calculation and shapes it for agents. */
export async function runTeamRotation(
  team: TeamRotationInput,
  characters: Record<string, Plain>,
  enemyConfig: TeamEnemyConfig,
  inventoryEchoes: Plain[],
) {
  const result = await calcTeamRotationDamage(team, characters, enemyConfig, inventoryEchoes);
  const timing: RotationTiming | null = result.timing;
  const length = timing ? rotationLength(timing) : null;
  const readings = rotationDpsReadings(result.total, team.duration, length);
  const headline = headlineDps(readings);

  const repeatsById = new Map<string, TimedAction[]>();
  for (const timed of timing?.actions ?? []) {
    if (timed.id == null) continue;
    repeatsById.set(timed.id, [...(repeatsById.get(timed.id) ?? []), timed]);
  }
  const actionsById = new Map(team.actions.map((action) => [action.id, action]));

  const actions = result.actionResults.map((entry) => {
    const id = entry.attack?.id as string;
    const action = actionsById.get(id);
    const damage = (entry.attack?.damage ?? {}) as Plain;
    const repeats = repeatsById.get(id) ?? [];
    return {
      order: entry.order,
      slot: entry.slot,
      character: entry.characterId,
      key: action?.key ?? entry.attack?.key ?? null,
      type: action?.type ?? null,
      label: entry.attack?.label ?? null,
      count: action?.count ?? 1,
      normal: round(damage.totalDamage ?? damage.healAmount ?? damage.shieldAmount),
      average: round(damage.avgDamage ?? damage.healAmount ?? damage.shieldAmount),
      crit: round(damage.critDamage ?? damage.healAmount ?? damage.shieldAmount),
      kind: entry.attack?.type === "Healing" ? "healing" : entry.attack?.type === "Shield" ? "shield" : "damage",
      timing: timing
        ? {
            startFrame: repeats[0]?.start ?? null,
            gameFrames: repeats.reduce((sum, timed) => sum + timed.gameFrames, 0),
            realFrames: repeats.reduce((sum, timed) => sum + timed.realFrames, 0),
            timeStopFrames: repeats.reduce((sum, timed) => sum + frozen(timed), 0),
            hitFrames: repeats.flatMap((timed) => timed.hits.map((hit) => hit.frame)),
            missingFrameData: repeats.length === 0 || repeats.some((timed) => timed.missing),
          }
        : null,
    };
  });

  const totalAvg = result.total.avgDamage ?? 0;
  const perCharacter = Object.entries(result.perCharacter).map(([character, entry]) => ({
    character,
    normal: round(entry.damageAggregation.normalDamage),
    average: round(entry.damageAggregation.avgDamage),
    crit: round(entry.damageAggregation.critDamage),
    healing: round(entry.damageAggregation.healing),
    shield: round(entry.damageAggregation.shield),
    shareOfAverage: totalAvg ? round(((entry.damageAggregation.avgDamage ?? 0) / totalAvg) * 100, 1) : null,
  }));

  let timeline: Plain | null = null;
  if (timing) {
    const strip = buildTimelineStrip(
      timing,
      result.actionResults.map((entry) => {
        const id = entry.attack?.id as string;
        const action = actionsById.get(id) as Plain | undefined;
        const damage = (entry.attack?.damage ?? {}) as Plain;
        return {
          id,
          value: damage.avgDamage ?? damage.totalDamage ?? damage.healAmount ?? damage.shieldAmount ?? 0,
          label: entry.attack?.label,
          type: action?.type,
          isDamage: entry.attack?.type !== "Healing" && entry.attack?.type !== "Shield",
          slot: action ? Number(action.slot) : undefined,
          end: action?.end,
        };
      }),
    );
    timeline = {
      gameFrames: timing.gameFrames,
      realFrames: timing.realFrames,
      gameSeconds: round(framesToSeconds(timing.gameFrames), 2),
      realSeconds: round(framesToSeconds(timing.realFrames), 2),
      timeStopFrames: timing.realFrames - timing.gameFrames,
      actionsWithoutFrameData: timing.missing.length,
      blocks: strip.blocks.map((block) => ({
        label: block.label,
        slot: block.slot,
        kind: block.kind,
        startFrame: block.startFrame,
        fieldFrames: block.frames,
        landingFrame: block.landingFrame,
        averageDamage: round(block.value),
        missingFrameData: block.missing,
      })),
      landings: calcFrameTimeline(result.actionResults, timing).map((point) => ({
        seconds: round(point.time, 2),
        character: point.characterId,
        label: point.label,
        average: round(point.avgDamage),
      })),
    };
  }

  return {
    total: {
      normal: round(result.total.normalDamage),
      average: round(result.total.avgDamage),
      crit: round(result.total.critDamage),
      healing: round(result.total.healing),
      shield: round(result.total.shield),
    },
    dps: readings.map((reading) => ({
      source: reading.source,
      seconds: round(reading.seconds, 2),
      normal: round(reading.dps.normal),
      average: round(reading.dps.avg),
      crit: round(reading.dps.crit),
      actionsWithoutFrameData: reading.missing,
    })),
    headlineDps: headline ? { source: headline.source, average: round(headline.dps.avg) } : null,
    perCharacter,
    actions,
    timeline,
  };
}

/** A character's attacks by action type, with frame data where wuwalab has it. */
export function characterFrames(data: Plain) {
  const frames = (data?.frames?.attacks ?? {}) as Record<string, AttackFrames>;
  const attacks: Plain[] = [];
  for (const [type, block] of Object.entries(ACTION_TYPE_BLOCKS)) {
    for (const attack of (data?.[block]?.attacks ?? []) as Plain[]) {
      attacks.push({ type, key: attack.key, label: attack.label ?? attack.key, frames: frames[attack.key] ?? null });
    }
  }
  return { syncedAt: data?.frames?.syncedAt ?? null, attacks };
}

/** A main echo's attacks (action type `echoAttacks`) with frame data. */
export function echoAttackFrames(echoKey: string) {
  const echo = (mainEchoesData as Plain)[echoKey];
  if (!echo) return null;
  return {
    echo: echoKey,
    name: echo.name ?? echoKey,
    attacks: ((echo.actions ?? []) as Plain[]).map((action) => ({
      type: "echoAttacks",
      key: action.key,
      label: action.label ?? action.key,
      frames: echoFrames[echoKey]?.[action.key] ?? null,
    })),
  };
}

export const FRAME_FORMAT =
  "Frames are game frames at 60 fps. total: length when played out; cancel: earliest cancel; noSwap: earliest swap-out; timeStop: world freeze [start, end]; motionStop: character locked [start, end]; cooldown; onCast: {energy, concerto} gained (negative = spent); hits: [frame, commitFrame, energy, concerto] per hit (a hit whose commitFrame is at or before a cancel still lands; energy/concerto are raw game values, x100 of the UI); offField: takes no field time; shared: part of an ability another attack also uses.";
