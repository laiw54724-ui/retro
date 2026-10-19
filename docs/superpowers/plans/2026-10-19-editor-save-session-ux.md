# Editor save-session UX implementation plan

> Execute inline in the authorized isolated worktree; no additional worker or full integration gate is needed for this slice.

**Goal:** Prevent silent exit loss and stale save responses crossing editor sessions; retain save-error retry after a notice closes.

**Base:** `92d8e0294e99dbdf0a99ac183ca04cd78004f4ec`.

**Architecture:** Keep the existing strict validation, autosave debounce, optimistic version, conflict and upgrade handling. Capture a live editor-session token for each save and ignore success/error side effects after that session unmounts or changes site. Use React Router's supported navigation blocker for SPA links and Back, plus native beforeunload for reload/tab close. A small dialog offers Stay or Leave anyway; sent requests may still finish, and unapplied theme previews are never saved automatically.

**Ownership:** `EditorPage.tsx` autosave/exit/retry areas; new `features/editor/editorSession.tsx`; `main.tsx` data-router wiring; focused `tests/e2e/editor-save-session.spec.ts`; new `editor.saveSession` keys in four editor locale files. Image/theme writer confirmed on this task that the save notice is unowned and requested an optional read of its future `themePreview` state. Its publish guards, preview notice, store fields, hosts, module leaves and shared media controls remain untouched. No shared schema, API/security settings or dependency changes.

- [x] Add synthetic canonical fixtures with two server versions and explicitly held transport responses. Reproduce exit loss and cross-site version contamination before implementation; retain failing output.
- [x] Add focused checks for 1280/390 immediate exits, native Back/reload, explicit discard, delayed success/failure and same-site remount, normal save, in-flight newer edits, persistent retry and real version conflicts.
- [x] Implement session-scoped save completions and guarded SPA/native exits. Preserve pending server writes rather than claiming Leave rolls them back. Guard explicit sign-out before session removal.
- [x] Move Retry into persistent header chrome, leave descriptive notice behavior intact, and clear only an obsolete save-failure message after recovery.
- [x] Run the focused browser file, web types, and changed-locale resource checks. Build once for the finished slice and exercise the existing production deferred-route recovery checks because the router root changes.
- [ ] Record exact commands/results and source identities, push the requested branch, open a Draft PR, and preserve the worktree. The integrator owns the aggregate gate; no merge or deploy.

**Acceptance constraints:** Late responses must not touch a different or remounted session's version, status, notices, conflicts or redirects. Normal in-flight edits must continue to queue a subsequent save. Incomplete content continues to pause writes. Unapplied preview state is only read as unsaved work. Leaving is explicit; native beforeunload provides browser-controlled wording. A closed error notice must not remove the recovery action. Existing public/auth route behavior must remain usable.

Limits: uncommitted per-field buffers (including IG blur/Enter drafts) are not detected or persisted. Existing current-session 403/404 access-loss redirects bypass author confirmation; stale responses cannot redirect the next session. The root remains one catch-all data-router wrapper around the unchanged App routes.
