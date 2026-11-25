/**
 * Tacet Forge agent tool: the `optimizerContext` Calculator.vue's
 * handleOptimize builds from its live refs, built here from stored data via
 * buildCharacterCalculationContext (the stored-build pipeline upstream keeps
 * in step with Calculator.vue). Field for field the same object, so the
 * optimizer workers see the same input.
 */
import {
  buildCharacterCalculationContext,
  resolveTeamEnemyConfig,
  type CharacterCalculationContext,
} from "../calculator/buildCharacterContext";
import { buildOptimizerRotationData } from "../calculator/rotationData";
import { resolveActiveStance } from "../calculator/stances";

type Plain = Record<string, any>;

/** Calculator.vue's `rotationsList` entries (handleUpdatedRotations). */
function toRotationsList(rotations: Plain[] | undefined) {
  return (rotations ?? []).map((rotation) => ({
    id: rotation.id,
    name: rotation.name,
    description: rotation.description,
    duration: rotation.duration ?? null,
    mainEcho: rotation.echo ?? null,
    mainEchoRank: rotation.echoRank ?? null,
    actions: rotation.actions,
  }));
}

export interface AgentOptimizerContext {
  context: Plain;
  calc: CharacterCalculationContext;
  /** Pre-processed rotation for a `Rotation:<id>` target, else null. */
  rotationData: Plain | null;
}

export async function buildAgentOptimizerContext(
  characterId: string,
  characters: Record<string, Plain>,
  inventoryEchoes: Plain[],
  target: string,
): Promise<AgentOptimizerContext> {
  const record = characters[characterId] ?? {};
  const enemy = resolveTeamEnemyConfig(record);
  const calc = await buildCharacterCalculationContext(characterId, characters, enemy, inventoryEchoes);
  const basic = calc.chosenChar?.basic ?? {};
  const weaponKey = record.weapon ?? null;

  const context = {
    chosenChar: calc.chosenChar,
    character: characterId,
    characterLevel: calc.characterLevel,
    talentData: { ...calc.talentData },
    baseHp: calc.baseHp,
    baseAtk: calc.baseAtk,
    baseDef: calc.baseDef,
    weaponData: {
      attack: calc.weaponData?.attack ?? 0,
      modifier: calc.weaponData?.modifier ?? null,
      modifierValue: calc.weaponData?.modifierValue ?? 0,
      weaponPassiveStats: calc.weaponData?.weaponPassiveStats ?? {},
      weaponPassiveDefs: calc.definitions?.weaponPassives ?? [],
      refinement: (weaponKey && record.weapons?.[weaponKey]?.refinement) ?? "1",
    },
    charBuffsData: calc.charBuffsData,
    charResonanceChainsData: calc.charResonanceChainsData,
    teamBuffsData: calc.teamBuffsData,
    customBuffs: calc.customBuffs,
    echoSetPassivesConfig: record.echoSetPassives ?? {},
    echoStats: calc.echoStats,
    enemyLevel: enemy.enemyLevel,
    enemyResist: enemy.enemyResist,
    enemyType: enemy.enemyType,
    isSpectroFrazzleEnabled: basic.spectroFrazzle ?? false,
    spectroFrazzleStacks: enemy.spectroFrazzleStacks,
    isAeroErosionEnabled: basic.aeroErosion ?? false,
    aeroErosionStacks: enemy.aeroErosionStacks,
    havocBaneStacks: enemy.havocBaneStacks,
    isFusionBurstEnabled: basic.fusionBurst ?? false,
    fusionBurstStacks: enemy.fusionBurstStacks,
    isElectroFlareEnabled: basic.electroFlare ?? false,
    electroFlareStacks: enemy.electroFlareStacks,
    electroRageStacks: enemy.electroRageStacks,
    isGlacioChafeEnabled: basic.glacioChafe ?? false,
    glacioChafeStacks: enemy.glacioChafeStacks,
    strainStacks: enemy.strainStacks,
    mainEcho: calc.mainEcho,
    mainEchoRank: calc.mainEchoRank,
    rotationsList: toRotationsList(record.rotations),
    Glacio: calc.finalStats.glacio,
    Fusion: calc.finalStats.fusion,
    Electro: calc.finalStats.electro,
    Aero: calc.finalStats.aero,
    Spectro: calc.finalStats.spectro,
    Havoc: calc.finalStats.havoc,
    characters,
    activeCharacterBuffs: record.buffs ?? {},
    activeCharacterResonanceChains: record.resonanceChains ?? {},
    // Calculator.vue's `activeStance` computed.
    activeStance: resolveActiveStance(basic.stances ?? [], record.activeStance, record.buffs),
  };

  let rotationData: Plain | null = null;
  const [targetType, rotationId] = target.split(":");
  if (targetType === "Rotation") {
    const rotation = (record.rotations ?? []).find((entry: Plain) => entry.id === rotationId);
    if (rotation) {
      rotationData = buildOptimizerRotationData({ ...rotation, id: rotationId }, calc.chosenChar, calc.characterLevel);
    }
  }
  return { context, calc, rotationData };
}
