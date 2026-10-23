/**
 * Tacet Forge: startup safety net. If the saved data can't be read, or the app
 * crashes while loading it, show a plain recovery screen (download the raw
 * data, restore the copy from before the last backup import, or reset)
 * instead of a blank page. Built with plain DOM so it works even when the Vue
 * app can't start. Checks only what would stop the app loading, so working
 * profiles are never caught by it.
 */
import { DATA_VERSION_KEY } from "../migrations";
import { FORK_DATA_VERSION_KEY } from "../migrations/fork";
import { UNDO_IMPORT_KEY } from "./settingsBackup";
import { isPlainObject } from "./backupValidation";

const DATA_KEYS = { character: "Characters", inventory: "Inventory", teamRotations: "Teams" } as const;

/** A user-facing description of what's wrong with the saved data, or null when it loads. */
export function findStoredDataProblem(): string | null {
  for (const [key, label] of Object.entries(DATA_KEYS)) {
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return null; // storage blocked: the app copes with that itself
    }
    if (!raw) continue;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return `${label} data is damaged (not valid JSON).`;
    }
    if (value == null) continue;
    if (!isPlainObject(value)) return `${label} data has the wrong format.`;
    const shapeOk =
      key === "character"
        ? value.characters == null || isPlainObject(value.characters)
        : key === "inventory"
          ? (value.echoes == null || Array.isArray(value.echoes)) &&
            (value.equipped == null || isPlainObject(value.equipped))
          : value.teams == null || Array.isArray(value.teams);
    if (!shapeOk) return `${label} data has the wrong format.`;
  }
  return null;
}

function rawDataBackup(): string {
  const data: Record<string, string | null> = {};
  for (const key of [...Object.keys(DATA_KEYS), DATA_VERSION_KEY, FORK_DATA_VERSION_KEY, UNDO_IMPORT_KEY]) {
    data[key] = localStorage.getItem(key);
  }
  return JSON.stringify({ savedAt: new Date().toISOString(), localStorage: data }, null, 2);
}

function download(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function restoreBeforeImport(): boolean {
  try {
    const backup = JSON.parse(localStorage.getItem(UNDO_IMPORT_KEY) ?? "null")?.backup;
    if (!backup?.data) return false;
    for (const key of Object.keys(DATA_KEYS)) {
      const value = backup.data[key];
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    if (backup.meta?.version) localStorage.setItem(DATA_VERSION_KEY, String(backup.meta.version));
    localStorage.removeItem(UNDO_IMPORT_KEY);
    return true;
  } catch {
    return false;
  }
}

function resetData() {
  for (const key of [...Object.keys(DATA_KEYS), DATA_VERSION_KEY, FORK_DATA_VERSION_KEY]) {
    localStorage.removeItem(key);
  }
}

function button(label: string, className: string, onClick: () => void) {
  const element = Object.assign(document.createElement("button"), { type: "button", textContent: label, className });
  element.addEventListener("click", onClick);
  return element;
}

export function renderRecoveryScreen(reason: string, root: HTMLElement | null = document.getElementById("app")) {
  if (!root) return;
  const box = document.createElement("main");
  box.className = "max-w-xl mx-auto my-16 p-6 rounded-xl bg-base-200 text-base-content flex flex-col gap-4";
  box.setAttribute("role", "alert");
  box.dataset.testRecoveryScreen = "";

  const title = Object.assign(document.createElement("h1"), {
    className: "text-xl font-semibold",
    textContent: "Tacet Forge couldn't load your saved data",
  });
  const detail = Object.assign(document.createElement("p"), { className: "text-sm opacity-80", textContent: reason });
  const help = Object.assign(document.createElement("p"), {
    className: "text-sm",
    textContent:
      "Download your saved data first, so nothing is lost. Then restore the data from before your last backup import (if there is one) or reset to start fresh.",
  });

  const actions = document.createElement("div");
  actions.className = "flex flex-wrap gap-2";
  actions.append(
    button("Download saved data", "btn btn-sm btn-primary", () => download(rawDataBackup(), "tacet-forge-saved-data.json")),
  );
  if (localStorage.getItem(UNDO_IMPORT_KEY)) {
    actions.append(
      button("Restore data from before the last import", "btn btn-sm btn-warning", () => {
        if (restoreBeforeImport()) location.reload();
      }),
    );
  }
  actions.append(
    button("Reset data", "btn btn-sm btn-error btn-outline", () => {
      if (window.confirm("Delete your saved characters, inventory and teams? Download them first if you may need them.")) {
        resetData();
        location.reload();
      }
    }),
  );

  box.append(title, detail, help, actions);
  root.replaceChildren(box);
}
