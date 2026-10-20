import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import "@testing-library/jest-dom";
import OptimizerSetFilterControls from "../../src/components/OptimizerSetFilterControls.vue";
import OptimizerWorkspaceSetup from "../../src/components/optimizerWorkspace/OptimizerWorkspaceSetup.vue";
import { useCharacterStore } from "../../src/stores/character";
import { echoSetLabelMap } from "../../src/echoes/stats";

describe("OptimizerSetFilterControls", () => {
  it("shows the counter and disables the action that would do nothing", async () => {
    const { emitted, rerender } = render(OptimizerSetFilterControls, {
      props: { selectedCount: 0, totalCount: 30 },
    });
    expect(screen.getByText(/0\/30 sets — pick at least one/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(emitted()["select-all"]).toHaveLength(1);

    await rerender({ selectedCount: 30, totalCount: 30 });
    expect(screen.getByText("30/30 sets")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select all" })).toBeDisabled();
    await fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(emitted().clear).toHaveLength(1);
  });
});

describe("OptimizerWorkspaceSetup set filter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  it("select all / clear update the saved echo-set filter and the set buttons", async () => {
    const characters = useCharacterStore();
    characters.setCharacterData("Jinhsi", { optimizer: { echoSets: [] } });
    render(OptimizerWorkspaceSetup, { props: { character: "Jinhsi" } });
    const total = Object.keys(echoSetLabelMap).length;

    await fireEvent.click(await screen.findByRole("button", { name: "Select all" }));
    await waitFor(() => expect(characters.characters.Jinhsi.optimizer.echoSets).toHaveLength(total));
    expect(screen.getByText(`${total}/${total} sets`)).toBeInTheDocument();
    const firstSet = document.querySelector("[data-test-optimizer-workspace-echo-set]")!;
    expect(firstSet).toHaveAttribute("aria-pressed", "true");
    expect(firstSet.getAttribute("aria-label")).toBeTruthy();

    await fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(characters.characters.Jinhsi.optimizer.echoSets).toEqual([]));
    expect(firstSet).toHaveAttribute("aria-pressed", "false");
  });

  it("persists removals for a character that had no optimizer config yet", async () => {
    const characters = useCharacterStore();
    characters.setCharacterData("Jinhsi", { characterLevel: "90" });
    render(OptimizerWorkspaceSetup, { props: { character: "Jinhsi" } });
    await fireEvent.click(await screen.findByRole("button", { name: "Select all" }));
    await fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(characters.characters.Jinhsi.optimizer.echoSets).toEqual([]));
    const [firstKey] = Object.keys(echoSetLabelMap);
    await fireEvent.click(document.querySelector(`[data-test-optimizer-workspace-echo-set="${firstKey}"]`)!);
    await fireEvent.click(document.querySelector(`[data-test-optimizer-workspace-echo-set="${firstKey}"]`)!);
    await waitFor(() => expect(characters.characters.Jinhsi.optimizer.echoSets).toEqual([]));
  });
});
