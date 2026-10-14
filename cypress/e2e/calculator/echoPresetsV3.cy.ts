// v3 echo preset entry points (issue #619): the Presets split button, the
// empty-build panel, and the presets modal's default tab. Classic keeps the
// old header and is covered by calculator/echoes.cy.ts.

function visitV3() {
  cy.visit("/", {
    onBeforeLoad(win) {
      win.localStorage.setItem("settings", JSON.stringify({ config: {}, labs: {} }));
    },
  });
}

function openChangliEchoesTab() {
  visitV3();
  cy.selectWorkspaceCharacter("Changli");
  cy.get("[data-test-workspace-buffs-enable-all]").should("be.visible");
  cy.get('[data-test-calculator-nav="echoes"]').click();
}

describe("Echo presets (v3)", () => {
  it("offers theorycrafter builds from an empty build and applies one", () => {
    openChangliEchoesTab();

    cy.get("[data-test-echoes-empty-state]").should("be.visible");
    cy.get("[data-test-echoes-empty-saved-presets]").should("not.exist");
    cy.get("[data-test-echoes-empty-community]").should("contain.text", "theorycrafter").click();

    cy.get("#modal-echoes-presets").should("have.attr", "open");
    cy.get('[data-test-echo-presets-tab="community"]').should("be.checked");
    cy.get("[data-test-echo-preset-apply]").first().click();

    cy.get("#modal-echoes-presets").should("not.have.attr", "open");
    cy.get("[data-test-echoes-empty-state]").should("not.exist");
  });

  it("opens the modal on theorycrafter builds when nothing is saved", () => {
    openChangliEchoesTab();

    cy.get("[data-test-echoes-presets-open]").click();
    cy.get('[data-test-echo-presets-tab="community"]').should("be.checked");
    cy.get('[data-test-echo-presets-tab="mine"]').click({ force: true });
    cy.get("[data-test-echo-presets-mine-empty]").should("be.visible");
  });

  it("lists theorycrafter builds and save in the presets menu", () => {
    openChangliEchoesTab();

    cy.get('[data-test="calculator-echoes-presets-menu"]').click();
    cy.get("[data-test-echoes-presets-save]").should("be.visible");
    cy.get("[data-test-echoes-presets-community]").click();
    cy.get('[data-test-echo-presets-tab="community"]').should("be.checked");
  });
});
