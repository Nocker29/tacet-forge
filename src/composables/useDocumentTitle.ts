import { onBeforeUnmount, watchEffect, type MaybeRefOrGetter, toValue } from "vue";

const BASE_META_DESCRIPTION_SELECTOR = 'meta[name="description"]';

// The site-wide title and description from index.html, which pages without
// their own (the calculator, inventory) go back to.
const baseTitle = typeof document === "undefined" ? "" : document.title;
const baseDescription =
  typeof document === "undefined"
    ? null
    : document.querySelector(BASE_META_DESCRIPTION_SELECTOR)?.getAttribute("content") ?? null;

function setDescription(content: string) {
  let meta = document.querySelector(BASE_META_DESCRIPTION_SELECTOR);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

/**
 * Sets document.title and the page's meta description for as long as the
 * calling component is mounted, then puts back the site-wide ones from
 * index.html. If the next page has already set its own, it's left alone.
 *
 * This is the first place in the app that manages per-route document
 * metadata (grep confirms zero prior `document.title` usage) - see
 * docs/adr/0024-info-page-nested-routes-redesign.md.
 */
/**
 * Tacet Forge: upstream's page titles end in "— Wuthering Waves Calculator &
 * Optimizer" (its site name); this fork shows its own name there instead, for
 * every page, including ones added upstream later.
 */
export function brandTitle(title: string): string {
  if (title.startsWith("Tacet Forge")) return title; // the site-wide title already names the fork
  return title.replace(/\s+—\s+Wuthering Waves Calculator & Optimizer$/, " — Tacet Forge");
}

export function useDocumentTitle(
  title: MaybeRefOrGetter<string>,
  description?: MaybeRefOrGetter<string>,
) {
  let setTitle: string | null = null;
  let setDescriptionValue: string | null = null;

  watchEffect(() => {
    setTitle = brandTitle(toValue(title));
    document.title = setTitle;

    const descriptionValue = description ? toValue(description) : undefined;
    if (!descriptionValue) return;
    setDescriptionValue = descriptionValue;
    setDescription(descriptionValue);
  });

  onBeforeUnmount(() => {
    if (document.title === setTitle) document.title = baseTitle;
    const meta = document.querySelector(BASE_META_DESCRIPTION_SELECTOR);
    if (
      baseDescription !== null &&
      setDescriptionValue !== null &&
      meta?.getAttribute("content") === setDescriptionValue
    ) {
      setDescription(baseDescription);
    }
  });
}
