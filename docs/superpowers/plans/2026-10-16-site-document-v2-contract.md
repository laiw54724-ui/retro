# SiteDocument v2 Contract Foundation Implementation Plan

**Goal:** Add a strict, diagnosable v1/v2 document pipeline and same-site entity references without changing the current editor's v1 write format yet.

**Architecture:** Preserve `SiteDocumentSchema`, `SiteDocument`, and all current v1 runtime behavior. Add a separate v2 schema whose Instagram windows reference site-level profile/post entities. A pure migration receives the owning `siteId`, deterministically maps every legacy Instagram window to one profile plus its posts, and never mutates the input. Parsing returns explicit `ok`, `invalid`, or `unsupported_version` results; unknown future versions and invalid documents are never cast into writable data. The web registry integration is a following milestone after this shared contract deploys.

**Tech stack:** TypeScript, Zod, Vitest, pnpm workspace.

---

## Scope and compatibility

- Existing editor, API create/save schemas, public renderer, autosave, undo/redo and published v1 documents remain unchanged in this milestone.
- No database migration and no automatic write-back occur.
- v2 is additive and exported for the following server-read/client-cutover milestone.
- `siteId` is required for migration and resolution because cross-site references cannot be inferred safely from document JSON.
- Stable migrated IDs derive from existing window/post IDs. Re-running migration returns byte-equivalent data and never appends duplicates.

### Task 1: Add failing version, migration and reference tests

**Files:**
- Create: `packages/shared/test/site-versioning.test.ts`

- [ ] Add fixtures covering all five legacy window types in one v1 document. Give every window and Instagram post explicit stable IDs before migration.
- [ ] Test `parseSiteDocument` returns `ok` for valid v1 and v2, `unsupported_version` for schema version 99, and `invalid` with path/message diagnostics for malformed v1/v2.
- [ ] Test `migrateSiteDocumentV2(raw, { siteId: "site-a" })`:
  - returns a valid v2 document;
  - preserves site name, theme, layouts, appearance, mobile order and every non-Instagram module byte-for-byte;
  - turns each Instagram window into an entry reference and places its profile/posts in site-level entities;
  - preserves profile, highlight, carousel, comment and image data through the typed entity representation;
  - produces unique IDs even when two Instagram windows contain the same legacy post ID;
  - is deterministic from the same input and idempotent when run on its own v2 output;
  - does not mutate the v1 input.
- [ ] Test `resolveEntityRef` resolves window/profile/post references for the current site, rejects `site-b` references with `cross_site`, and reports `missing` for an absent ID.
- [ ] Test `collectEntityReferrers` reports affected Instagram windows and posts before a profile deletion.
- [ ] Run `pnpm --filter @retrodesk/shared test:unit -- site-versioning`; confirm failure because the contract does not exist.

### Task 2: Implement the additive v2 contract

**Files:**
- Create: `packages/shared/src/site-versioning.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/site-versioning.test.ts`

- [ ] Export `EntityKindSchema` (`window`, `profile`, `post`) and strict `EntityRefSchema` with non-empty bounded `siteId` and `id`.
- [ ] Export strict `ProfileEntityV2Schema` and `PostEntityV2Schema`. Reuse exported v1 field schemas where practical; otherwise model every current Instagram profile, highlight, post, carousel and comment field explicitly so migration is lossless. Each entity has a stable ID and `visibility: "published" | "draft"`; posts carry `authorProfileId`.
- [ ] Export `DesktopWindowV2Schema`. Document/gallery/links/about retain their current typed content. Instagram content is exactly `{ skin, profileRef }`; it must not retain a second writable profile/post copy.
- [ ] Export strict `SiteDocumentV2Schema` with `schemaVersion: 2`, existing site/theme/mobile fields, v2 windows, and `entities: { profiles, posts }`. Enforce the existing array limits and reasonable entity limits.
- [ ] Export `VersionedSiteDocumentSchema`, `SiteDocumentV2`, `DesktopWindowV2`, `ProfileEntityV2`, `PostEntityV2`, and `EntityRef`.
- [ ] Implement `parseSiteDocument(raw)` as a discriminated result:
  - `ok` includes parsed version and document;
  - `invalid` includes raw input plus normalized Zod diagnostics;
  - `unsupported_version` includes raw input and numeric version;
  - non-object/missing/non-integer versions are `invalid`.
- [ ] Implement pure `migrateSiteDocumentV2(raw, { siteId })` returning the same result family. Valid v2 input is returned unchanged. For v1, map profiles to `profile:<windowId>` and posts to `post:<windowId>:<legacyPostId>` with deterministic collision suffixes based on occurrence order. Preserve all legacy values, assign published visibility, and replace only Instagram window content with its same-site profile reference.
- [ ] Add semantic validation after Zod parsing: duplicate entity/window IDs, missing author profile, missing window profile target, and same-document cross-site refs return `invalid` diagnostics rather than writable data.
- [ ] Implement `resolveEntityRef(document, ref, currentSiteId)` returning `{ok:true,value}` or `{ok:false,reason:"cross_site"|"missing"}` without throwing.
- [ ] Implement `collectEntityReferrers(document, target, currentSiteId)` returning typed referrers for Instagram window entry refs and post author refs.
- [ ] Export the new module from `packages/shared/src/index.ts`; do not change current `SiteDocument` aliases or `normalizeDocument` in this milestone.
- [ ] Run focused unit tests, then `pnpm --filter @retrodesk/shared typecheck`, `pnpm typecheck`, `pnpm test:unit`, `pnpm build`, and `git diff --check`.
- [ ] Commit only the plan-related shared source/test/export files with `feat: add versioned site document contract`.

### Task 3: Review, deploy and record evidence

- [ ] Run spec review against every scope/compatibility item, followed by code-quality review covering schema strictness, migration losslessness, deterministic collisions, mutation safety and denial-of-service limits.
- [ ] Re-run full `pnpm test:e2e` after reviews even though the runtime remains v1.
- [ ] Push the branch and deploy the web staging project. Because this milestone changes the shared package only, do not redeploy the API Worker unless API source or bindings changed.
- [ ] Verify staging homepage and a published/public route still return successfully.
- [ ] Comment on Issue #18 with commits, test counts, compatibility statement and staging deployment. Keep #18 open for registry integration and 18B publishing/media security.
- [ ] Append observed evidence to `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`; do not record symbolic counts or unverified success.
