# Open-source readiness implementation plan

**Goal:** Complete every repository-controlled part of Issue #27 without inventing rights the repository owner or third-party asset owners have not granted.

## Work

1. Add a sanitized secret scanner covering tracked files and reachable Git blobs; run it in CI and record the result.
2. Add contributor, conduct, self-hosting, license-scope, security/takedown, Issue, and PR guidance.
3. Provide one `verify:contributor` pre-merge gate while retaining focused tests during implementation.
4. Update architecture and setup docs for multi-desktop collaboration, current apps, all migrations, frozen lockfiles, and the hosted/self-hosted boundary.
5. Keep the strict asset redistribution gate blocked for the two unresolved Windows icon collections.

## Deliberate blocker

Only an authorized repository rights holder may choose and grant the root source-code license. This change records that absence honestly instead of adding an assumed MIT license. Issue #27 cannot be closed as fully open-source-ready until that decision and the icon redistribution/removal decision are complete.
