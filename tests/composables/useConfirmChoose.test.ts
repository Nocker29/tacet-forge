import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/vue";
import ConfirmDialog from "../../src/components/ConfirmDialog.vue";
import { useConfirm } from "../../src/composables/useConfirm";

describe("useConfirm choose", () => {
  it("resolves with the clicked choice, or null when cancelled", async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
    render(ConfirmDialog);
    const { choose, settle } = useConfirm();
    const choices = [
      { value: "import" as const, label: "Import anyway" },
      { value: "skip" as const, label: "Skip duplicates" },
    ];

    const picked = choose("2 duplicates", { choices });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fireEvent.click(document.querySelector('[data-test-confirm-choice="skip"]')!);
    expect(await picked).toBe("skip");

    const cancelled = choose("2 duplicates", { choices });
    settle(false);
    expect(await cancelled).toBeNull();
  });

  it("keeps confirm() boolean", async () => {
    const { confirm, settle } = useConfirm();
    const answer = confirm("Sure?");
    settle(true);
    expect(await answer).toBe(true);
  });
});
