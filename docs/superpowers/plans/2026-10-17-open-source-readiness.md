# Open-source readiness implementation plan

**Goal:** Complete every repository-controlled part of Issue #27 without inventing rights the repository owner or third-party asset owners have not granted.

## Work

1. Add a sanitized secret scanner covering tracked files and reachable Git blobs; run it in CI and record the result.
2. Add contributor, conduct, self-hosting, license-scope, security/takedown, Issue, and PR guidance.
3. Provide one `verify:contributor` pre-merge gate while retaining focused tests during implementation.
4. Update architecture and setup docs for multi-desktop collaboration, current apps, all migrations, frozen lockfiles, and the hosted/self-hosted boundary.
5. Keep the two unresolved Windows icon collections out of Git and default
   builds; allow an explicitly acknowledged local install while making the
   strict release gate reject any build that contains it.

## Owner decision (resolved 2026-10-17)

The authorized repository owner selected MIT for original Retro source and
selected user-installed optional packaging for Windows icons. The license and
packaging implementation must preserve the third-party and user-content
boundaries described in the Issue specification.
