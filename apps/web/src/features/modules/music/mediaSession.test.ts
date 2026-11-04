import { describe, expect, it, vi } from "vitest";
import { createEmbedSession } from "./mediaSession";

describe("embed session", () => {
  it("stops native audio when an embed starts and keeps a single embed", () => {
    const stopNative = vi.fn();
    const session = createEmbedSession(stopNative);
    session.activate("w1", "t1", "i1");
    expect(stopNative).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toEqual({ windowId: "w1", trackId: "t1", instanceId: "i1" });
    session.activate("w2", "t9", "i2");
    expect(session.getSnapshot()).toEqual({ windowId: "w2", trackId: "t9", instanceId: "i2" });
  });

  it("only disposes the matching embed when ids are given", () => {
    const session = createEmbedSession(() => undefined);
    session.activate("w1", "t1", "i1");
    session.dispose("w2", "t1");
    session.dispose("w1", "other");
    session.dispose("w1", "t1", "someone-else");
    expect(session.getSnapshot().windowId).toBe("w1");
    session.dispose("w1", "t1", "i1");
    expect(session.getSnapshot()).toEqual({ windowId: null, trackId: null, instanceId: null });
  });

  it("disposes any embed when called without ids and notifies subscribers once per change", () => {
    const session = createEmbedSession(() => undefined);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.activate("w1", "t1", "i1");
    session.dispose();
    session.dispose();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    session.activate("w1", "t1", "i1");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps a second mounted copy of the same player (hidden phone tree) from also becoming active", () => {
    const session = createEmbedSession(() => undefined);
    session.activate("w1", "t1", "visible");
    const snapshot = session.getSnapshot();
    const copyIsActive = (instanceId: string) => snapshot.windowId === "w1" && snapshot.trackId === "t1" && snapshot.instanceId === instanceId;
    expect(copyIsActive("visible")).toBe(true);
    expect(copyIsActive("hidden")).toBe(false);
    // the hidden copy unmounting must not take the visible player down
    session.dispose("w1", "t1", "hidden");
    expect(session.getSnapshot().instanceId).toBe("visible");
  });
});
