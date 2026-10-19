# IG editing task flow

Audit-directed implementation, based on main f11ad8d (includes #121/#124). Worktree: retro-ig-editor-flow; branch: codex/ig-editor-flow.

The audit and parent authorized five task categories with a compact, honest entry-character header; list/detail editing for posts; a highlights/collections switch; and safe unfinished-field retention on Done editing. No new role model, visitor redesign, shell-dialog changes, tutorial system, Paint work, deployment or flag activation.

Implementation:

1. Keep the existing five sections and persisted entry-character behavior. Move add/search/duplicate character management into one details entry.
2. Replace the post creation toolbar with one New post action. Keep search on the list, collapse filters, and open one entity editor with Back. Put date/location and fictional interactions below primary text/images in collapsed details.
3. Keep both highlight/collection sections mounted behind an explicit two-way switch. Keep visited entity bodies mounted; scope selection, searches, pending additions and scroll/focus by existing identities.
4. Retain text/numeric/link/source drafts and custom-field row identity in memory through Done editing. Clear on document reload, site/access changes and history travel; never store local draft metadata in saved documents. Reuse existing image URL validation with an optional controlled draft prop, limited to canonical IG callers.
5. Give phone reorder/delete and category actions at least 44px targets, item-specific names and non-overlapping rows. Keep Clear filters visible with active filters.
6. Validate desktop and 320/390/430px tasks, draft cancellation/IME/re-entry, canonical media ownership/retry/cancel/late completion, and existing authoring contracts. Keep changes in a Draft PR for parent integration.
