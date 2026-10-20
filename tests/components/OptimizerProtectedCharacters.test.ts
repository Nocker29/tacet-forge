import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import "@testing-library/jest-dom";
import OptimizerProtectedCharacters from "../../src/components/OptimizerProtectedCharacters.vue";
import { useInventoryStore } from "../../src/stores/inventory";

function state(selector: string) {
  return document
    .querySelector(`[data-test-optimizer-protected-character="${selector}"]`)
    ?.getAttribute("data-test-optimizer-protected-state");
}

describe("OptimizerProtectedCharacters", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    document.body.innerHTML = "";
  });

  function setup() {
    const inventory = useInventoryStore();
    inventory.hardSetState({
      echoes: [{ echoId: "e1" }, { echoId: "e2" }, { echoId: "e3" }, { echoId: "e4" }],
      equipped: { e1: { Jinhsi: 0 }, e2: { Changli: 0 }, e3: { Carlotta: 0 } },
    });
    render(OptimizerProtectedCharacters, { props: { character: "Carlotta" } });
    return inventory;
  }

  it("shows everyone but the optimized character, protected by default, with a summary", () => {
    setup();
    expect(state("Jinhsi")).toBe("protected");
    expect(state("Changli")).toBe("protected");
    expect(state("Carlotta")).toBeUndefined();
    const summary = document.querySelector("[data-test-optimizer-protected-summary]")!.textContent!;
    expect(summary.replace(/\s+/g, " ")).toContain("2 of 4 echoes available, 2 excluded");
  });

  it("toggles a character to donor and persists it", async () => {
    const inventory = setup();
    await fireEvent.click(screen.getByLabelText(/^Jinhsi: protected/));
    expect(state("Jinhsi")).toBe("donor");
    expect(inventory.optimizerProtection).toEqual({ donors: ["Jinhsi"] });
    expect(screen.getByLabelText(/^Jinhsi: donor/)).toHaveAttribute("aria-pressed", "false");
  });

  it("supports unlock all, protect all and invert", async () => {
    setup();
    await fireEvent.click(screen.getByRole("button", { name: "Unlock all" }));
    expect([state("Jinhsi"), state("Changli")]).toEqual(["donor", "donor"]);
    await fireEvent.click(screen.getByRole("button", { name: "Protect all" }));
    expect([state("Jinhsi"), state("Changli")]).toEqual(["protected", "protected"]);
    await fireEvent.click(screen.getByLabelText(/^Changli: protected/));
    await fireEvent.click(screen.getByRole("button", { name: "Invert" }));
    expect([state("Jinhsi"), state("Changli")]).toEqual(["donor", "protected"]);
  });

  it("explains when nobody else holds echoes", () => {
    useInventoryStore().hardSetState({ echoes: [{ echoId: "e1" }], equipped: {} });
    render(OptimizerProtectedCharacters, { props: { character: "Carlotta" } });
    expect(document.querySelector("[data-test-optimizer-protected-empty]")).not.toBeNull();
  });
});
