import { describe, expect, it, vi } from "vitest";
import { createEmbedSession } from "./mediaSession";

describe("embed session", () => {
  it("stops native audio when an embed starts and keeps a single embed", () => {
    const stopNative = vi.fn();
    const session = createEmbedSession(stopNative);
    session.activate("w1", "t1");
    expect(stopNative).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toEqual({ windowId: "w1", trackId: "t1" });
    session.activate("w2", "t9");
    expect(session.getSnapshot()).toEqual({ windowId: "w2", trackId: "t9" });
  });

  it("only disposes the matching embed when ids are given", () => {
    const session = createEmbedSession(() => undefined);
    session.activate("w1", "t1");
    session.dispose("w2", "t1");
    session.dispose("w1", "other");
    expect(session.getSnapshot().windowId).toBe("w1");
    session.dispose("w1", "t1");
    expect(session.getSnapshot()).toEqual({ windowId: null, trackId: null });
  });

  it("disposes any embed when called without ids and notifies subscribers once per change", () => {
    const session = createEmbedSession(() => undefined);
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    session.activate("w1", "t1");
    session.dispose();
    session.dispose();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    session.activate("w1", "t1");
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
