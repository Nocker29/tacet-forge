import { describe, it, expect, beforeEach } from "vitest";
import { findStoredDataProblem, renderRecoveryScreen } from "../../src/utils/safeMode";
import { UNDO_IMPORT_KEY } from "../../src/utils/settingsBackup";

describe("findStoredDataProblem", () => {
  beforeEach(() => localStorage.clear());

  it("accepts empty, cleared and normal profiles", () => {
    expect(findStoredDataProblem()).toBeNull();
    localStorage.setItem("character", "");
    localStorage.setItem("inventory", JSON.stringify({ echoes: [{ echoId: "a" }], equipped: {} }));
    localStorage.setItem("teamRotations", JSON.stringify({ teams: [] }));
    expect(findStoredDataProblem()).toBeNull();
  });

  it.each([
    ["character", "{broken", "Characters data is damaged"],
    ["inventory", JSON.stringify({ echoes: {} }), "Inventory data has the wrong format"],
    ["teamRotations", JSON.stringify([1]), "Teams data has the wrong format"],
  ])("reports damaged %s data", (key, value, message) => {
    localStorage.setItem(key, value);
    expect(findStoredDataProblem()).toContain(message);
  });
});

describe("renderRecoveryScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it("shows the reason as text and offers download and reset", () => {
    renderRecoveryScreen('bad <img src=x onerror="alert(1)">');
    const screen = document.querySelector("[data-test-recovery-screen]")!;
    expect(screen.querySelector("img")).toBeNull();
    expect(screen.textContent).toContain('bad <img src=x onerror="alert(1)">');
    const labels = [...screen.querySelectorAll("button")].map((b) => b.textContent);
    expect(labels).toEqual(["Download saved data", "Reset data"]);
  });

  it("offers restoring the pre-import data when it's kept", () => {
    localStorage.setItem(
      UNDO_IMPORT_KEY,
      JSON.stringify({ savedAt: 1, backup: { meta: { version: "9" }, data: { character: "{}" } } }),
    );
    renderRecoveryScreen("x");
    expect([...document.querySelectorAll("button")].map((b) => b.textContent)).toContain(
      "Restore data from before the last import",
    );
  });
});
