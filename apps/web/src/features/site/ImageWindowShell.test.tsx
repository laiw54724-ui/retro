import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { makeWindow, THEME_PRESETS } from "@retrodesk/shared";
import { ImageWindowShell } from "./ImageWindowShell";

describe("image host shell", () => {
  it("removes the actual outer chrome for none, retains child data and mobile navigation", () => {
    const window = makeWindow("image"); if (window.type !== "image") throw new Error("fixture");
    window.content.frameMode = "none"; window.content.interactionMode = "decorative";
    const html = renderToStaticMarkup(<ImageWindowShell window={window} title="Art" theme={THEME_PRESETS.classic98} presentation="mobile" titleBarLeading={<button>Back</button>}><img src="https://example.test/a.png" alt="" /></ImageWindowShell>);
    expect(html).toContain('data-image-shell="none"'); expect(html).not.toContain("retro-titlebar");
    expect(html).toContain("Back</button>"); expect(html).toContain('inert=""'); expect(html).toContain('aria-hidden="true"');
  });
  it("keeps existing framed content images in the existing chrome", () => {
    const window = makeWindow("image");
    const html = renderToStaticMarkup(<ImageWindowShell window={window} title="Art" theme={THEME_PRESETS.classic98}><span>Content</span></ImageWindowShell>);
    expect(html).toContain("retro-titlebar"); expect(html).not.toContain('data-image-shell="none"');
  });
});
