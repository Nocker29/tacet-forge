import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeTooltipValue } from "../../src/utils/sanitizeHtml";

describe("sanitizeHtml", () => {
  it("keeps the formatting tooltips use", () => {
    const html = '<span class="Highlight">5</span> * (1 + <strong>10%</strong>)<br>';
    expect(sanitizeHtml(html)).toBe('<span class="Highlight">5</span> * (1 + <strong>10%</strong>)<br>');
  });

  it("drops scripts, event handlers, links and images but keeps their text", () => {
    const out = sanitizeHtml('50<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:x" onclick="y">hi</a><span onmouseover="z" style="x">s</span>');
    expect(out).toBe("50alert(2)hi<span>s</span>");
    expect(out).not.toMatch(/onerror|onclick|onmouseover|javascript:|<img|<script|<a/);
  });

  it("passes plain text through", () => {
    expect(sanitizeHtml("1,234")).toBe("1,234");
    expect(sanitizeHtml(null)).toBe("");
  });

  it("sanitizes only html tooltip objects", () => {
    expect(sanitizeTooltipValue({ content: "<img onerror=x>ok", html: true })).toEqual({ content: "ok", html: true });
    expect(sanitizeTooltipValue("<b>plain string tooltips render as text</b>")).toBe("<b>plain string tooltips render as text</b>");
  });
});
