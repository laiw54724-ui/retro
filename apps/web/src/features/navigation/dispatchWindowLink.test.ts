import { describe, expect, it, vi } from "vitest";
import { makeWindow } from "@retrodesk/shared";
import { dispatchWindowLink } from "./dispatchWindowLink";
import { dispatchUiActions } from "./dispatchUiActions";
import type { InternalDestination } from "./linkDestination";

describe("existing window button session adapter", () => {
  it("passes the source and stable target ID to the session channel", () => {
    const navigate = vi.fn().mockReturnValue({ ok: true }), openWindow = vi.fn();
    expect(dispatchWindowLink("target", { editing: false, siteId: "site", sourceId: "links", navigate, openWindow })).toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ kind: "window", siteId: "site", id: "target" }, "links");
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("resolves by ID after rename/reorder, never by duplicate titles, without changing content", () => {
    const first = { ...makeWindow("document"), id: "first", title: "Same title" };
    const target = { ...makeWindow("document"), id: "target", title: "Same title" };
    const windows = [target, first], before = structuredClone(windows), open = vi.fn();
    const navigate = (destination: InternalDestination) => dispatchUiActions({ kind: "openDestination", destination }, {
      editing: false, catalog: { siteId: "site", windows, profiles: [], profileIdsByWindow: {} }, open
    });
    expect(dispatchWindowLink("target", { editing: false, siteId: "site", sourceId: "links", navigate }).ok).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith({ kind: "window", window: target });
    expect(windows).toEqual(before);
  });

  it("propagates a missing/source-excluded target without opening a legacy fallback", () => {
    const open = vi.fn(), openWindow = vi.fn();
    const navigate = (destination: InternalDestination) => dispatchUiActions({ kind: "openDestination", destination }, {
      editing: false, catalog: { siteId: "site", windows: [], profiles: [], profileIdsByWindow: {} }, open
    });
    expect(dispatchWindowLink("missing", { editing: false, siteId: "site", sourceId: "links", navigate, openWindow })).toEqual({ ok: false, reason: "unavailable" });
    expect(open).not.toHaveBeenCalled(); expect(openWindow).not.toHaveBeenCalled();
  });

  it("fails closed when a scoped caller has no session channel", () => {
    const openWindow = vi.fn();
    expect(dispatchWindowLink("target", { editing: false, siteId: "site", sourceId: "links", openWindow }).ok).toBe(false);
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("is inert in author editing and for empty IDs", () => {
    const navigate = vi.fn(), openWindow = vi.fn();
    const context = { editing: true, sourceId: "links", siteId: "site", navigate, openWindow };
    expect(dispatchWindowLink("target", context).ok).toBe(false);
    expect(dispatchWindowLink("", { ...context, editing: false }).ok).toBe(false);
    expect(dispatchWindowLink(undefined, { ...context, editing: false }).ok).toBe(false);
    expect(navigate).not.toHaveBeenCalled(); expect(openWindow).not.toHaveBeenCalled();
  });

  it("preserves unscoped v1 source-local opening and older callers without a directory", () => {
    const openWindow = vi.fn(), navigate = vi.fn();
    const context = { editing: false, sourceId: "links", navigate, openWindow };
    expect(dispatchWindowLink("target", { ...context, windows: [{ id: "target" }] }).ok).toBe(true);
    expect(dispatchWindowLink("target", context).ok).toBe(true);
    expect(openWindow.mock.calls).toEqual([["target"], ["target"]]);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("rejects unavailable legacy targets/capabilities, including an explicitly empty directory", () => {
    const openWindow = vi.fn(), context = { editing: false, sourceId: "links", openWindow };
    for (const windows of [[], [{ id: "other" }]]) {
      expect(dispatchWindowLink("missing", { ...context, windows })).toEqual({ ok: false, reason: "unavailable" });
    }
    expect(dispatchWindowLink("target", { editing: false, sourceId: "links" }).ok).toBe(false);
    expect(openWindow).not.toHaveBeenCalled();
  });
});
