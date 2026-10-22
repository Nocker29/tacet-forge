import { ref } from "vue";

export type ConfirmVariant = "primary" | "error" | "warning";

export interface ConfirmRequest {
  message: string;
  title?: string;
  items?: string[];
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmVariant;
  /** Set by `choose`: one button per choice instead of the confirm button. */
  choices?: ConfirmChoice[];
}

export interface ConfirmChoice<T extends string = string> {
  value: T;
  label: string;
  variant?: ConfirmVariant;
}

export interface ConfirmOptions {
  title?: string;
  items?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

export const confirmButtonClasses: Record<ConfirmVariant, string> = {
  primary: "btn btn-primary",
  error: "btn btn-error",
  warning: "btn btn-warning",
};

const confirmRequest = ref<ConfirmRequest | null>(null);
// `true`/`false` from the confirm/cancel buttons, a choice's value from `choose`.
let resolveFn: ((value: boolean | string) => void) | null = null;

export function useConfirm() {
  function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    return new Promise((resolve) => {
      if (resolveFn) {
        resolveFn(false);
      }

      resolveFn = (value) => resolve(value === true);
      confirmRequest.value = {
        message,
        title: options.title,
        items: options.items,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "primary",
      };
    });
  }

  /**
   * Asks the user to pick one of several actions. Resolves with the chosen
   * value, or null when the dialog is cancelled or dismissed.
   */
  function choose<T extends string>(
    message: string,
    options: Omit<ConfirmOptions, "confirmLabel" | "variant"> & { choices: ConfirmChoice<T>[] },
  ): Promise<T | null> {
    return new Promise((resolve) => {
      if (resolveFn) {
        resolveFn(false);
      }

      resolveFn = (value) => resolve(typeof value === "string" ? (value as T) : null);
      confirmRequest.value = {
        message,
        title: options.title,
        items: options.items,
        confirmLabel: "",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: "primary",
        choices: options.choices,
      };
    });
  }

  function settle(result: boolean | string) {
    const resolve = resolveFn;
    resolveFn = null;
    confirmRequest.value = null;
    resolve?.(result);
  }

  return { confirmRequest, confirm, choose, settle };
}
