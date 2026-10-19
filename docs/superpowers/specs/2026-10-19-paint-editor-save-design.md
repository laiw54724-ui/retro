# Paint editor utility and safe PNG save

Base: main8e2e54241ecca4c79cb5d6190e7b4b0beb804075. User authorized this bounded implementation alongside independent navigation/action and image-field lines.

## Design

Reuse PaintWorkspace as a lazy editor dialog. Save PNG creates a new private asset through the existing upload endpoint and one new Gallery window through the existing document transaction. It never overwrites the imported file, existing asset or existing image window. Export remains a local PNG download. Standalone paint schema/module and insertion as a new image window are deferred; no schema, API or feature flag changes.

The workspace owns engine history and async save serialization. A save snapshots the engine revision and marks only that revision saved; drawing during upload remains dirty. Failed upload keeps canvas/history for retry. Successful upload receipts are reused for a retry of the same revision if draft insertion fails. Mounted editor/site/permission/upgrade checks reject late completion. Normal draft autosave and conflict recovery own persistence after Gallery insertion; success copy distinguishes insertion into draft from publication.

An ephemeral local-work registry extends the existing leave guard for dirty/active Paint work. Close asks before discarding; native reload uses the existing supported guard. Nested leave dialogs receive keyboard interaction only at the topmost modal. Paint keyboard history must not bubble to editor document history. No visitor write channel or playground is added.

## Ownership

Paint files, additive local-work registry, EditorPage one toolbar entry, editorSession one local-work query, ModalDialog topmost keyboard guard, modules.paint locale namespace in four catalogs, focused unit/browser tests. No navigation/action contracts, image-field controls, registry, shared schemas, API, deployment or other worker worktrees.

## Acceptance

Open from desktop/320/390 editor, draw/import/undo/export. Save creates exactly one asset/new Gallery and saves/reloads it. Duplicate activation produces one upload. Failure preserves pixels and supports retry. New edits while saving remain unsaved. Late upload after site switch/unmount cannot mutate new session. Close/Back/Stay/discard/reload guard works, including nested modal focus. Ctrl/Cmd+Z affects canvas only. Production flags/debug hosts remain unchanged. Fixture verification does not claim native/live/provider acceptance.
