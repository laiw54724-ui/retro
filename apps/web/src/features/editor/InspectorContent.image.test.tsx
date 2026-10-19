import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { makeWindow } from "@retrodesk/shared";
import { i18n } from "../../i18n";
import { InspectorContent } from "./InspectorContent";

describe("reader-only image Inspector adapter", () => {
  it("renders a selected image explicitly instead of falling through to Instagram authoring", async () => {
    await i18n.changeLanguage("en");
    const window = makeWindow("image"), update = vi.fn(); window.title = "Portrait.png";
    const html = renderToStaticMarkup(createElement(InspectorContent, { window, allWindows: [window], siteId: "image-site", update, onMessage: vi.fn() }));
    expect(html).toContain('data-testid="image-reader-inspector"');
    expect(html).toContain("Portrait.png"); expect(html).toContain("Image content is read-only in this editor.");
    expect(html).not.toContain("<input"); expect(html).not.toContain("<button"); expect(html).not.toContain("Followers");
    expect(update).not.toHaveBeenCalled();
  });
});
