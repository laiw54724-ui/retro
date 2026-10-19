import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow } from "@retrodesk/shared";
import { themeView } from "../../../lib/themeView";
import type { ModuleProps } from "../types";
import { GuestbookInlineEditor, GuestbookView } from "./index";
import { GuestbookPreviewProvider } from "./previewContext";

const theme = createStarterDocument("Preview", "classic98", "blank").theme;
const window = makeWindow("guestbook");
if (window.type !== "guestbook") throw new Error("Guestbook fixture mismatch");
window.content.enabled = true;
const props: ModuleProps<"guestbook"> = {
  window,
  ctx: { theme, tv: themeView(theme), editing: true, mobile: false, windows: [], siteId: "real-owner-site", siteHandle: "real-public-handle", onLink: () => {} },
  update: () => { throw new Error("Preview must not update the draft"); }
};

describe("explicit guestbook preview capability", () => {
  for (const Component of [GuestbookView, GuestbookInlineEditor]) {
    it(`isolates ${Component.name} even with real site and owner capabilities`, () => {
      const html = renderToStaticMarkup(createElement(GuestbookPreviewProvider, { children: createElement(Component, props) }));
      expect(html).toContain("guestbook-preview-notice");
      expect(html).toContain("模擬");
      expect(html).not.toContain("guestbook-moderation");
      expect(html).not.toContain("guestbook-settings");
      expect(html).not.toContain("real-owner-site");
      expect(html).not.toContain("real-public-handle");
    });
  }

  it("keeps real owner controls outside preview", () => {
    const html = renderToStaticMarkup(createElement(GuestbookInlineEditor, props));
    expect(html).toContain("guestbook-moderation");
    expect(html).toContain("guestbook-settings");
    expect(html).not.toContain("guestbook-preview-notice");
  });

  it("does not infer preview from a missing site handle", () => {
    const html = renderToStaticMarkup(createElement(GuestbookView, { ...props, ctx: { ...props.ctx, siteHandle: undefined } }));
    expect(html).toContain("發布網站後即可使用真實留言簿");
    expect(html).not.toContain("guestbook-preview-notice");
  });
});
