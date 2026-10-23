import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { render, fireEvent, waitFor } from "@testing-library/vue";
import SettingsBackupRestore from "../../src/components/SettingsBackupRestore.vue";
import SettingsDelete from "../../src/components/SettingsDelete.vue";
import { useConfirm } from "../../src/composables/useConfirm";
import { useInventoryStore } from "../../src/stores/inventory";
import { useCharacterStore } from "../../src/stores/character";

beforeEach(() => {
  setActivePinia(createPinia());
  document.body.innerHTML = "";
});

describe("Backup & Restore → Choose JSON file…", () => {
  it("loads the picked file into the echo import box", async () => {
    const { container } = render(SettingsBackupRestore);
    const input = container.querySelector<HTMLInputElement>("[data-test-import-echoes-file-input]")!;
    const file = new File(['[{"echo":"Jue"}]'], "echoes.json", { type: "application/json" });
    await fireEvent.change(input, { target: { files: [file] } });
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-test-import-raw-text-echoes]")!;
    await waitFor(() => expect(textarea.value).toBe('[{"echo":"Jue"}]'));
    expect(container.querySelector("[data-test-import-echoes-choose-file]")?.getAttribute("aria-label")).toBeTruthy();
  });

  it("leaves the box alone when the file isn't JSON", async () => {
    const { container } = render(SettingsBackupRestore);
    const input = container.querySelector<HTMLInputElement>("[data-test-import-echoes-file-input]")!;
    await fireEvent.change(input, { target: { files: [new File(["nope"], "bad.json")] } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.querySelector<HTMLTextAreaElement>("[data-test-import-raw-text-echoes]")!.value).toBe("");
  });
});

describe("Danger Zone → Delete all echoes", () => {
  it("warns about builds and presets, then deletes only echoes", async () => {
    useInventoryStore().hardSetState({ echoes: [{ echoId: "e1", echo: "Jue" }], equipped: { e1: { Jinhsi: 0 } } });
    useCharacterStore().hardSetState({
      characters: { Jinhsi: { weapon: "AgesOfHarvest", echoes: { 0: { echoId: "e1" } } } },
      activeCharacter: "Jinhsi",
    });
    const { container } = render(SettingsDelete, { props: { variant: "v3" } });
    await fireEvent.click(container.querySelector("[data-test-delete-all-echoes]")!);

    const { confirmRequest, settle } = useConfirm();
    expect(confirmRequest.value?.title).toBe("Delete all echoes");
    expect(confirmRequest.value?.items?.join(" ")).toContain("Echo slots in all character builds will be cleared");
    settle(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useInventoryStore().echoes).toEqual([]);
    expect(useCharacterStore().characters.Jinhsi.weapon).toBe("AgesOfHarvest");
    expect(useCharacterStore().characters.Jinhsi.echoes[0].echoId).toBeNull();
  });
});
