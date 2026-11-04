import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageWriteProvider, useImageWriter } from "./ImageWriteContext";

vi.mock("../../lib/imageWindowCreation", () => ({ IMAGE_WINDOW_CREATION_ENABLED: true }));
function Consumer() { return <span>{useImageWriter() ? "author" : "reader"}</span>; }
describe("site/API scoped image authoring", () => {
  const load = { siteId: "a", apiOrigin: "https://api.example", writeCompatibility: { imageWindow: 1 } };
  it("defaults closed without leaking capability between trees", () => {
    expect(renderToStaticMarkup(<Consumer />)).toContain("reader");
    expect(renderToStaticMarkup(<ImageWriteProvider siteId="a" apiOrigin={load.apiOrigin} load={load} blocked={false}><Consumer /></ImageWriteProvider>)).toContain("author");
  });
  it.each([
    ["b", load.apiOrigin, load, false], ["a", "https://other.example", load, false],
    ["a", load.apiOrigin, null, false], ["a", load.apiOrigin, { ...load, writeCompatibility: { appearanceP2: 1 } }, false],
    ["a", load.apiOrigin, load, true]
  ])("fails closed for a mismatched load or upgrade pause", (siteId, apiOrigin, current, blocked) => {
    expect(renderToStaticMarkup(<ImageWriteProvider siteId={siteId} apiOrigin={apiOrigin} load={current} blocked={blocked}><Consumer /></ImageWriteProvider>)).toContain("reader");
  });
});
