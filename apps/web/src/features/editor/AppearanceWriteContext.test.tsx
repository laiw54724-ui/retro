import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppearanceWriteProvider, useAppearanceP2Writer } from "./AppearanceWriteContext";

vi.mock("../../lib/appearanceP2Writer", () => ({ APPEARANCE_P2_WRITER_ENABLED: true }));
function Consumer() { return <span>{useAppearanceP2Writer() ? "visible" : "hidden"}</span>; }
describe("per-load appearance control context", () => {
  const load = { siteId: "site-a", apiOrigin: "https://api.example", writeCompatibility: { appearanceP2: 1 } };
  it("defaults closed and does not share capability between provider trees", () => {
    expect(renderToStaticMarkup(<Consumer />)).toContain("hidden");
    expect(renderToStaticMarkup(<AppearanceWriteProvider siteId="site-a" apiOrigin="https://api.example" load={load} blocked={false}><Consumer /></AppearanceWriteProvider>)).toContain("visible");
    expect(renderToStaticMarkup(<AppearanceWriteProvider siteId="site-b" apiOrigin="https://api.example" load={load} blocked={false}><Consumer /></AppearanceWriteProvider>)).toContain("hidden");
    expect(renderToStaticMarkup(<AppearanceWriteProvider siteId="site-a" apiOrigin="https://api.example" load={load} blocked><Consumer /></AppearanceWriteProvider>)).toContain("hidden");
  });
});
