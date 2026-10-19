# Bounded appearance compatibility guard implementation

Exact base: #94 956d26d4237ce9cb5a774547b1a0bf548a30f0df. New branch codex/appearance-p2-compat-35; preserve #91/#94. Implements the accepted compatibility-guard design without enabling production authoring.

- [x] API helper detects raw property presence, partial legacy title objects, and exact transport marker 1. No persisted schema/version change.
- [x] Create guard checks raw incoming data; draft guard checks raw incoming OR stored draft_document from the same versioned read; retain conditional draft_version CAS. Auth/access still apply independently.
- [x] Both import endpoints reject missing/unsupported capability for all packages, including stripped legacy packages. Keep digest validation and input limits.
- [x] Authenticated GET site advertises writeCompatibility.appearanceP2=1 with private/no-store. Compatible client senders always send capability with controls off; GET uses no-store.
- [x] Scope UI capability to current site and API load through a React context; missing/unknown metadata hides controls. Keep DEV-only production exclusion.
- [x] On 426, pause autosave/publish/retry, retain unsaved canonical edits, offer canonical JSON download, check server fresh, then open a fresh editor tab without replacing this tab.
- [x] Focused tests: frozen legacy parser stripping/strict v2 rejection, current-version stripped save, incoming P2, first-write CAS race, deliberate reset, imports, auth/access, fresh advertisement, compatible senders, recovery retaining edits/no retries.
- [x] Approved focused Chromium execution: 15 passed, 1 intentional skip. API/web lint/types, focused unit tests, test parsing, production hard-off build and evidence are complete.
- [ ] Commit/push isolated branch and open its stacked Draft PR; report exact dependency and remaining deployed-canary gate. Integrator owns aggregate gate. No deployment, DB changes, migrations or credentials/settings changes.
