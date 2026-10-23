/**
 * Tacet Forge: tooltips with `html: true` build markup from numbers that come
 * from user data (stats from echoes, weapon levels…). A crafted backup could
 * put markup in those fields, so tooltip HTML goes through this allowlist:
 * known formatting tags, `class` only, everything else becomes text.
 */
const ALLOWED_TAGS = new Set([
  "B", "BR", "CODE", "DIV", "EM", "I", "LI", "OL", "P", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "UL",
]);

function clean(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? "")];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const element = node as Element;
  const children = [...element.childNodes].flatMap((child) => clean(child, doc));
  if (!ALLOWED_TAGS.has(element.tagName)) return children; // drop the tag, keep its text
  const copy = doc.createElement(element.tagName.toLowerCase());
  const className = element.getAttribute("class");
  if (className) copy.setAttribute("class", className);
  copy.append(...children);
  return [copy];
}

export function sanitizeHtml(html: unknown): string {
  if (html == null) return "";
  const text = String(html);
  if (!/[<&]/.test(text)) return text;
  // <template> content is inert: nothing loads or runs while parsing.
  const template = document.createElement("template");
  template.innerHTML = text;
  const out = document.createElement("div");
  out.append(...[...template.content.childNodes].flatMap((child) => clean(child, document)));
  return out.innerHTML;
}

/** v-tooltip binding value with its HTML content sanitized (strings and `{ content, html: true }`). */
export function sanitizeTooltipValue<T>(value: T): T {
  if (value && typeof value === "object" && (value as { html?: unknown }).html) {
    const content = (value as { content?: unknown }).content;
    if (typeof content === "string") return { ...value, content: sanitizeHtml(content) };
  }
  return value;
}
