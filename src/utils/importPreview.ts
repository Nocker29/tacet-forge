/**
 * Tacet Forge: what a backup import would change, shown before "Import &
 * overwrite" replaces the data (src/composables/useBackupImport.ts).
 * Compares the current stores' state with a prepareImport() result. Pure.
 */
type Plain = Record<string, any>;

export interface ImportSummary {
  characters: { added: string[]; removed: string[]; changed: string[]; total: number };
  builds: {
    added: Array<{ character: string; name: string }>;
    removed: Array<{ character: string; name: string }>;
    changed: Array<{ character: string; name: string }>;
  };
  echoes: { before: number; after: number; added: number; removed: number; changed: number };
  teams: { before: number; after: number };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function buildsOf(record: Plain | undefined): Map<string, Plain> {
  const list = Array.isArray(record?.builds) ? (record!.builds as Plain[]) : [];
  return new Map(list.filter((build) => build?.id != null).map((build) => [String(build.id), build]));
}

const buildName = (build: Plain) => String(build.name ?? "Unnamed build");
const withoutIdentity = ({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest }: Plain) => rest;

export function summarizeImport(
  current: { character?: Plain; inventory?: Plain; teamRotations?: Plain },
  incoming: { character?: unknown; inventory?: unknown; teamRotations?: unknown },
): ImportSummary {
  const before = (current.character?.characters ?? {}) as Record<string, Plain>;
  const after = ((incoming.character as Plain | undefined)?.characters ?? {}) as Record<string, Plain>;

  const characters: ImportSummary["characters"] = { added: [], removed: [], changed: [], total: Object.keys(after).length };
  const builds: ImportSummary["builds"] = { added: [], removed: [], changed: [] };
  for (const key of Object.keys(after)) {
    if (!(key in before)) characters.added.push(key);
    else if (!same(before[key], after[key])) characters.changed.push(key);
  }
  for (const key of Object.keys(before)) if (!(key in after)) characters.removed.push(key);

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    // Builds of added/removed characters are covered by the character line.
    if (!(key in before) || !(key in after)) continue;
    const oldBuilds = buildsOf(before[key]);
    const newBuilds = buildsOf(after[key]);
    const unmatchedOld = new Map([...oldBuilds].filter(([id]) => !newBuilds.has(id)));
    for (const [id, build] of newBuilds) {
      let old = oldBuilds.get(id);
      if (!old) {
        // The same build saved on two devices (e.g. the auto-created
        // "Default build") has different ids: match those by name.
        const byName = [...unmatchedOld].find(([, candidate]) => buildName(candidate) === buildName(build));
        if (byName) {
          unmatchedOld.delete(byName[0]);
          old = byName[1];
          if (!same(withoutIdentity(old), withoutIdentity(build))) builds.changed.push({ character: key, name: buildName(build) });
          continue;
        }
      }
      if (!old) builds.added.push({ character: key, name: buildName(build) });
      else if (!same(old, build)) builds.changed.push({ character: key, name: buildName(build) });
    }
    for (const build of unmatchedOld.values()) builds.removed.push({ character: key, name: buildName(build) });
  }

  const oldEchoes = new Map(((current.inventory?.echoes ?? []) as Plain[]).map((echo) => [echo.echoId, echo]));
  const newEchoes = ((incoming.inventory as Plain | undefined)?.echoes ?? []) as Plain[];
  const echoes = { before: oldEchoes.size, after: newEchoes.length, added: 0, removed: 0, changed: 0 };
  const seen = new Set<string>();
  for (const echo of newEchoes) {
    seen.add(echo.echoId);
    const old = oldEchoes.get(echo.echoId);
    if (!old) echoes.added++;
    else if (!same(old, echo)) echoes.changed++;
  }
  for (const id of oldEchoes.keys()) if (!seen.has(id)) echoes.removed++;

  return {
    characters,
    builds,
    echoes,
    teams: {
      before: (current.teamRotations?.teams ?? []).length,
      after: (((incoming.teamRotations as Plain | undefined)?.teams ?? []) as unknown[]).length,
    },
  };
}

const LIST_LIMIT = 6;
function list(names: string[]): string {
  const shown = names.slice(0, LIST_LIMIT).join(", ");
  return names.length > LIST_LIMIT ? `${shown} and ${names.length - LIST_LIMIT} more` : shown;
}
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const buildList = (entries: Array<{ character: string; name: string }>) =>
  list(entries.map((entry) => `${entry.character}: ${entry.name}`));

/** One line per kind of change, for the confirm dialog's list. */
export function describeImportSummary(summary: ImportSummary): string[] {
  const { characters, builds, echoes, teams } = summary;
  const lines: string[] = [];
  if (!characters.total) lines.push("The backup has no characters.");
  if (characters.added.length) lines.push(`New characters: ${list(characters.added)}`);
  if (characters.removed.length) lines.push(`Characters removed: ${list(characters.removed)}`);
  if (characters.changed.length) lines.push(`Characters changed: ${list(characters.changed)}`);
  if (builds.added.length) lines.push(`New builds: ${buildList(builds.added)}`);
  if (builds.changed.length) lines.push(`Builds changed: ${buildList(builds.changed)}`);
  if (builds.removed.length) lines.push(`Builds removed: ${buildList(builds.removed)}`);
  if (!lines.length) lines.push(`Characters and builds: no changes (${count(characters.total, "character", "characters")})`);
  const echoParts = [
    echoes.added && `${echoes.added} new`,
    echoes.removed && `${echoes.removed} removed`,
    echoes.changed && `${echoes.changed} changed`,
  ].filter(Boolean);
  lines.push(
    echoParts.length
      ? `Echoes: ${echoParts.join(", ")} (${echoes.before} → ${echoes.after})`
      : `Echoes: no changes (${count(echoes.after, "echo", "echoes")})`,
  );
  if (teams.before !== teams.after) lines.push(`Teams: ${teams.before} → ${teams.after}`);
  return lines;
}
