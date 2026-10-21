import { render, screen, fireEvent, waitFor } from "@testing-library/vue";
import { createRouter, createMemoryHistory } from "vue-router";
import { createTestingPinia } from "@pinia/testing";
import { it, describe, expect, beforeEach, afterEach, vi } from "vitest";
import "@testing-library/jest-dom";
import CharactersView from "../../src/pages/CharactersView.vue";
import { useCharacterStore } from "../../src/stores/character";

const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("../../src/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: confirmMock }) }));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div>calculator</div>" } },
      { path: "/characters", component: CharactersView },
      { path: "/:any(.*)", component: { template: "<div />" } },
    ],
  });
}

async function renderView(characters: Record<string, unknown>) {
  const router = makeRouter();
  await router.push("/characters");
  await router.isReady();
  const pinia = createTestingPinia({
    stubActions: false,
    initialState: {
      character: { characters, activeCharacter: "", favoriteCharacters: [] },
      inventory: { echoes: [], equipped: {}, echoPresets: [], equippedPresets: {} },
      settings: { config: {}, labs: {} },
    },
  });
  const utils = render(CharactersView, { global: { plugins: [router, pinia] } });
  return { ...utils, router };
}

beforeEach(() => {
  const el = document.createElement("div");
  el.id = "navbar-container";
  document.body.appendChild(el);
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CharactersView", () => {
  it("shows an empty state when no character has been set up", async () => {
    await renderView({});
    expect(document.querySelector("[data-test-characters-empty]")).not.toBeNull();
  });

  it("lists saved characters with level, sequence and weapon state", async () => {
    await renderView({
      Jinhsi: {
        characterLevel: "80",
        resonanceChains: { SequenceNode3SomeNode: { isEnabled: true } },
      },
      Danjin: { characterLevel: "90", buildStatus: "wont-build" },
    });
    const cards = document.querySelectorAll("[data-test-character-overview-card]");
    expect([...cards].map((c) => c.getAttribute("data-test-character-overview-card"))).toEqual([
      "Danjin",
      "Jinhsi",
    ]);
    const jinhsi = document.querySelector('[data-test-character-overview-card="Jinhsi"]')!;
    expect(jinhsi.textContent).toContain("Lv. 80");
    expect(jinhsi.textContent).toContain("S3");
    expect(jinhsi.getAttribute("aria-label")).toBe("View Jinhsi's build");
    await waitFor(() => expect(jinhsi.textContent).toContain("No weapon"));
    await waitFor(() =>
      expect(jinhsi.querySelector("[data-test-character-overview-stats]")!.textContent).toContain("ATK"),
    );
    expect(screen.getByText(/2 of 2/)).toBeInTheDocument();
  });

  it("filters by search and Won't build, with a no-matches state", async () => {
    await renderView({ Jinhsi: {}, Danjin: { buildStatus: "wont-build" } });
    await fireEvent.update(screen.getByLabelText("Search characters"), "zzz");
    expect(document.querySelector("[data-test-characters-no-matches]")).not.toBeNull();
    await fireEvent.update(screen.getByLabelText("Search characters"), "");
    await fireEvent.click(screen.getByLabelText("Hide characters marked Won't build"));
    const keys = [...document.querySelectorAll("[data-test-character-overview-card]")].map((c) =>
      c.getAttribute("data-test-character-overview-card"),
    );
    expect(keys).toEqual(["Jinhsi"]);
  });

  it("clearing filters also turns off Won't build hiding, so an empty result can be undone", async () => {
    await renderView({ Danjin: { buildStatus: "wont-build" } });
    await fireEvent.click(screen.getByLabelText("Hide characters marked Won't build"));
    expect(document.querySelector("[data-test-characters-no-matches]")).not.toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(document.querySelector('[data-test-character-overview-card="Danjin"]')).not.toBeNull();
  });

  it("opens the details and sends the character to the optimizer", async () => {
    const { router } = await renderView({ Jinhsi: {} });
    await fireEvent.click(document.querySelector('[data-test-character-overview-card="Jinhsi"]')!);
    await waitFor(() => expect(document.querySelector("[data-test-character-details]")).not.toBeNull());
    expect(document.body.textContent).toContain("Empty slot 5");
    await fireEvent.click(document.querySelector("[data-test-character-details-open-optimizer]")!);
    await waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/?screen=optimizer"));
    expect(useCharacterStore().activeCharacter).toBe("Jinhsi");
  });

  it("removes a character after confirming, and keeps it when cancelled", async () => {
    await renderView({ Jinhsi: {}, Danjin: {} });
    const openAndRemove = async () => {
      await fireEvent.click(document.querySelector('[data-test-character-overview-card="Jinhsi"]')!);
      await waitFor(() => expect(document.querySelector("[data-test-character-details]")).not.toBeNull());
      await fireEvent.click(document.querySelector("[data-test-character-details-delete]")!);
    };

    confirmMock.mockResolvedValueOnce(false);
    await openAndRemove();
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(useCharacterStore().characters).toHaveProperty("Jinhsi");

    confirmMock.mockResolvedValueOnce(true);
    await openAndRemove();
    await waitFor(() =>
      expect(document.querySelector('[data-test-character-overview-card="Jinhsi"]')).toBeNull(),
    );
    expect(useCharacterStore().characters).not.toHaveProperty("Jinhsi");
    expect(document.querySelector('[data-test-character-overview-card="Danjin"]')).not.toBeNull();
  });
});
