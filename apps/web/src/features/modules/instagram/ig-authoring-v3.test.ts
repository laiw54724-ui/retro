import { afterEach, describe, expect, it } from "vitest";
import { createStarterDocument, migrateSiteDocumentV2, projectV2ToLegacyDocument } from "@retrodesk/shared";
import { useEditorStore } from "../../editor/store";
import { createIgDraftSession } from "./igDraftSession";

const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach((dispose) => dispose()));
function setup() {
  const result = migrateSiteDocumentV2(createStarterDocument("Desk", "classic98", "instagram"), { siteId: "site-a" });
  if (!result.ok || result.version !== 2) throw new Error("fixture");
  const projection = projectV2ToLegacyDocument(result.document);
  if (!projection.ok) throw new Error("fixture");
  const store = useEditorStore.getState();
  store.setSite("site-a", "a", projection.document, 1, null, null, "owner");
  store.setVersionedDocument(result.document);
  const session = createIgDraftSession(useEditorStore); cleanups.push(session.dispose);
  const draft = { base: "retro", text: "", error: "required" as const };
  session.controls.set("image-source", { base: "", text: "https:", error: "invalid" });
  session.drafts.set('["site-a","ig","profile-a"]:handle', draft);
  return { store, session, draft, document: projection.document };
}
describe("entity pending input", () => {
  it("labels only the owning post or highlight and clears on history travel", () => {
    const { store, session } = setup();
    session.drafts.clear(); session.controls.clear();
    const scope = '["site-a","ig","profile-a"]';
    session.controls.set(`${scope}:post-media-urls`, { one: "https:", two: "" });
    session.controls.set(`${scope}:two:media:source`, { base: "old", text: "invalid", error: "invalid" });
    session.drafts.set(`${scope}:three:other-likes`, { base: "12", text: "-1", error: "count" });
    expect(session.hasPendingEntity(scope, "one", "post-media-urls")).toBe(true);
    expect(session.hasPendingEntity(scope, "two", "post-media-urls")).toBe(true);
    expect(session.hasPendingEntity(scope, "three", "post-media-urls")).toBe(true);
    expect(session.hasPendingEntity(scope, "four", "post-media-urls")).toBe(false);
    expect(session.hasPendingEntity(`${scope}:highlights`, "one", "frame-urls")).toBe(false);
    expect(session.hasPendingEntity('["site-a","ig","profile-b"]', "one", "post-media-urls")).toBe(false);
    store.setSiteName("Changed"); store.undo();
    expect(session.hasPendingEntity(scope, "one", "post-media-urls")).toBe(false);
  });
});

// Replacement exercises the real editor store, canonical operations and shared queue.
import { createPost, patchPostMedia, type SiteDocumentV2Input } from '@retrodesk/shared';
import { UploadTaskQueue } from '../../media/uploadTasks';
import { observeEditorMedia } from '../../media/windowMediaSession';
import { enqueueIgPostReplacement } from './useIgMedia';

function replacementSetup() {
  const { store } = setup();
  const document = useEditorStore.getState().versionedDocument!;
  const profileId = document.entities.profiles[0].id;
  const created = createPost(document, { id: 'target', authorProfileId: profileId,
    media: Array.from({ length: 10 }, (_, index) => ({ id: `m-${index}`, src: `https://example.com/${index}.png`, srcUrl: '', alt: 'Original' })) }, { siteId: 'site-a' });
  if (!created.ok) throw new Error('fixture post');
  const replace = (doc: SiteDocumentV2Input) => {
    const projection = projectV2ToLegacyDocument(doc);
    if (!projection.ok) throw new Error('projection');
    store.replaceDocument(projection.document, undefined, doc);
  };
  replace(created.document);
  const queue = new UploadTaskQueue();
  const stop = observeEditorMedia(queue, useEditorStore, 'site-a');
  cleanups.push(() => { stop(); queue.invalidate('finished'); });
  const target = { siteId: 'site-a', profileId, windowId: document.windows.find(w => w.type === 'instagram')!.id, entityId: 'target', kind: 'post' as const };
  const post = () => useEditorStore.getState().versionedDocument!.entities.posts.find(p => p.id === 'target')!;
  const editSource = (src: string) => {
    const result = patchPostMedia(useEditorStore.getState().versionedDocument!, 'target', 'm-0', { src }, { siteId: 'site-a' });
    if (!result.ok) throw new Error('patch'); replace(result.document);
  };
  let finish!: (value: string) => void;
  const upload = new Promise<string>(resolve => { finish = resolve; });
  const enqueue = () => enqueueIgPostReplacement(queue, target, 'm-0', new File(['x'], 'replace.png', { type: 'image/png' }), () => upload);
  return { store, queue, target, post, editSource, finish: (src: string) => finish(src), enqueue };
}

describe('canonical post replacement', () => {
  it('works at the ten-image limit, keeps the image ID and does not add an eleventh image', async () => {
    const s = replacementSetup();
    s.enqueue();
    expect(s.post().media![0].src).toBe('https://example.com/0.png');
    s.finish('https://example.com/replacement.png'); await s.queue.whenIdle();
    expect(s.post().media).toHaveLength(10);
    expect(s.post().media![0]).toMatchObject({ id: 'm-0', src: 'https://example.com/replacement.png', alt: 'Original' });
  });
  it.each(['site', 'access', 'undo', 'source-restored'] as const)('rejects delayed completion after %s', async action => {
    const s = replacementSetup(); s.enqueue();
    if (action === 'site') useEditorStore.setState({ siteId: 'site-b' });
    if (action === 'access') useEditorStore.setState({ accessRole: 'viewer' });
    if (action === 'undo') { s.store.setSiteName('Changed'); s.store.undo(); }
    if (action === 'source-restored') { s.editSource('https://example.com/changed.png'); s.editSource('https://example.com/0.png'); }
    s.finish('https://example.com/stale.png'); await s.queue.whenIdle();
    expect(s.post().media![0].src).toBe('https://example.com/0.png');
    expect(s.queue.getSnapshot()[0]).toMatchObject({ status: 'failed', retryable: false });
  });
});

it('discarding a deleted child preserves sibling drafts; deleting the entity also clears pending additions', () => {
  const { session } = setup(); session.drafts.clear(); session.controls.clear();
  const scope = '["site-a","ig","profile-a"]';
  session.controls.set(`${scope}:one:m1:source`, { base: '', text: 'https:', error: 'invalid' });
  session.controls.set(`${scope}:one:m2:source`, { base: '', text: 'https:', error: 'invalid' });
  session.controls.set(`${scope}:post-media-urls`, { one: 'https:', two: 'https:' });
  session.discardEntity(scope, 'one', 'post-media-urls', 'm1');
  expect(session.controls.has(`${scope}:one:m1:source`)).toBe(false);
  expect(session.hasPendingEntity(scope, 'one', 'post-media-urls')).toBe(true);
  session.discardEntity(scope, 'one', 'post-media-urls');
  expect(session.hasPendingEntity(scope, 'one', 'post-media-urls')).toBe(false);
  expect(session.hasPendingEntity(scope, 'two', 'post-media-urls')).toBe(true);
});
