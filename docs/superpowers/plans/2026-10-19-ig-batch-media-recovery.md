# Canonical IG batch media recovery

Dependency: #121 at `d7e4ff69f0db049e20706abfdea580e14f1f3e07`. Separate worktree and branch `codex/ig-batch-media-recovery`; #121 remains frozen.

Design: reuse UploadTaskQueue, insertInSelectionOrder and observeEditorMedia. Capture original site/profile/window/entity plus stable media IDs, then apply only to the latest canonical target. Ordinary edits and OC selection preserve ownership; reassignment/removal/history/access changes invalidate. Tasks hold local files only until completion/cancel/dismiss.

1. Add canonicalMedia adapter and scoped hook for post media and highlight frames; reserve capacity across outstanding batches and report omitted files explicitly. Retries insert among surviving selected siblings without replacing their metadata or replaying successes.
2. Reserve a draft post immediately for new uploads. Place task status/retry/cancel beside each target, including collapsed editors. Keep empty cancelled drafts editable/deletable. Enable multi-file highlight selection with existing 50-frame limit.
3. Extend shared UploadTaskList with an optional per-item Cancel callback; callers without it retain current behavior. Add four-locale labels/hints. No legacy-only, global upload transport, schema, feature-gate or unrelated editor changes.
4. Focused deferred-promise units and Chromium fixtures: partial success/retry order, same-file repeat, cancellation that releases the worker, late response discard, current text/alt/source preservation, deletion/reassignment, OC switch, history and permission loss; narrow layout and reload.
5. Record results and limits; Draft PR targets `codex/image-editor-recovery` and documents exact dependency. No merge, deployment, staging bypass or full-suite/build repetition.
