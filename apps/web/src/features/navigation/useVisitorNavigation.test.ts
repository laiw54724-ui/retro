import { describe, expect, it } from "vitest";
import { createStarterDocument, makeWindow } from "@retrodesk/shared";
import { createPreviewNavigation } from "../site/previewNavigation";
import { createVisitorSession, resetVisitorWindow } from "./useVisitorNavigation";

function fixture() {
  const source = createStarterDocument("Unchanged source"), session = createVisitorSession(), navigation = createPreviewNavigation();
  session.source = source;
  session.windows = [makeWindow("instagram")];
  session.nextRequest = 12;
  session.requests = { closing: { requestId: 11, profileId: "bei", postId: null }, other: { requestId: 12, profileId: "other-profile", postId: "post-other" } };
  session.explorer = { source: { folderId: "nested", query: "kept search" } };
  session.returns = [
    { windowId: "source", openedWindowId: "closing", focusKey: "source-trigger" },
    { windowId: "closing", openedWindowId: "nested-viewer", focusKey: "closing-trigger" },
    { windowId: "other-source", openedWindowId: "other", focusKey: "other-trigger" }
  ];
  navigation.visitor = session;
  navigation.openId = "closing";
  navigation.ig = {
    closing: { route: { screen: "profile", profileId: "bei", postId: null, collectionId: null, peopleKind: null }, history: [] },
    other: { route: { screen: "post", profileId: "other-profile", postId: "post-other", collectionId: null, peopleKind: null }, history: [] }
  };
  return { source, session, navigation };
}

describe("explicit visitor window close", () => {
  it("resets only the closed window's restoration/request/return state without changing source or other sessions", () => {
    const { source, session, navigation } = fixture(), before = structuredClone(source);
    const otherRoute = navigation.ig.other, otherRequest = session.requests.other, windows = session.windows, explorer = session.explorer;
    const retainedReturn = session.returns[2];
    resetVisitorWindow(session, "closing", navigation);
    expect(navigation.openId).toBeNull();
    expect(navigation.ig).not.toHaveProperty("closing");
    expect(session.requests).not.toHaveProperty("closing");
    expect(navigation.ig.other).toBe(otherRoute);
    expect(session.requests.other).toBe(otherRequest);
    expect(session.returns).toEqual([retainedReturn]);
    expect(session.returns[0]).toBe(retainedReturn);
    expect(session.source).toBe(source); expect(source).toEqual(before);
    expect(session.windows).toBe(windows); expect(session.explorer).toBe(explorer);
    expect(session.nextRequest).toBe(12);
  });
  it("keeps another active window and tolerates repeated closes", () => {
    const { session, navigation } = fixture(); navigation.openId = "other";
    const otherRoute = navigation.ig.other;
    resetVisitorWindow(session, "closing", navigation);
    resetVisitorWindow(session, "closing", navigation);
    expect(navigation.openId).toBe("other"); expect(navigation.ig.other).toBe(otherRoute);
    expect(session.returns).toHaveLength(1);
  });
  it("also clears a local shell request without requiring shared layout state", () => {
    const { source, session } = fixture();
    resetVisitorWindow(session, "closing");
    expect(session.requests).not.toHaveProperty("closing");
    expect(session.requests.other.profileId).toBe("other-profile");
    expect(session.source).toBe(source); expect(session.nextRequest).toBe(12);
  });
});
