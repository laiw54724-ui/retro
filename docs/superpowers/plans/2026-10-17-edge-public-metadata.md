# Edge public metadata implementation plan

**Goal:** Make site, OC, and post share URLs return accurate metadata without executing browser JavaScript.

## Architecture

1. Store an author-controlled `seo.indexing` flag in the canonical v2 document; default existing/migrated sites to indexing enabled and label noindex as non-private.
2. Derive metadata in `@retrodesk/shared` from the same published projection used by publishing. Draft/missing entities return a generic not-found result.
3. Expose a no-store API metadata endpoint with a published-version cache key and no owner/draft fields.
4. Add a Cloudflare Pages advanced-mode worker to load runtime API configuration, fetch metadata, escape all authored text, inject title/description/canonical/OG/Twitter/robots into the static Vite HTML, and serve a real generic 404 for unpublished targets.
5. Generate the worker and public runtime config after the Vite build; scan the result as a build artifact.

## Verification

- Shared projection/metadata and Unicode-safe output tests.
- API success/generic-404/no-store/ETag tests.
- Pages route parsing, escaping, first-response HTML, fallback, and runtime handler-signature tests.
- Web typecheck/build plus generated artifact and secret audit.
