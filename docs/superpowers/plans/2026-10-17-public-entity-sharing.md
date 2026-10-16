# Public OC and post sharing — implementation plan

## Scope

Deliver Issue #28A without changing draft publication semantics:

- canonical public routes `/:handle/oc/:profileId` and `/:handle/post/:postId`;
- resolve only from the server-returned published v2 projection;
- open the matching Instagram window on desktop and mobile, or create an in-memory viewer when a published profile has no configured Instagram window;
- initialize the Instagram session at the requested profile or post;
- replace fake share success with awaited native share / clipboard operations and a selectable URL fallback;
- preserve generic not-found responses for absent or unpublished entities.

## Safety boundaries

- Drafts are never accepted as route or share sources.
- Route parameters are entity IDs, never external URLs.
- The temporary viewer is render-only and is never persisted.
- Clipboard rejection never reports success.
- #28B edge metadata and #28C export/import remain separate milestones.

## Focused verification

- unit tests for canonical URL construction and share fallback outcomes;
- Playwright desktop/mobile deep-link reload and generic 404;
- Playwright clipboard rejection exposes a selectable URL;
- shared/web typecheck and only the directly affected unit suites.
