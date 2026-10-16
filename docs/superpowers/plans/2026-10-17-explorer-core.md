# #24A Explorer world-folder core

**Goal:** Add a safe, native folder/shortcut browser for organizing existing windows without copying or deleting their content.

**Contract:** A window stores at most 500 folders/shortcuts. Folders have nullable parents, explicit order and draft/published visibility. Shortcuts target a same-site window by stable reference. Validation rejects duplicate IDs, missing parents, cycles, depth over eight and invalid targets. Public projection removes draft folders/shortcuts and dangling targets.

**UX:** Native list, breadcrumb, back, search and explicit “move to” controls. Deleting a folder removes only its descendant folder records and shortcuts after confirmation; target windows and media remain untouched. Drag-and-drop and profile/post navigation are deferred until the window-target core is stable.

**Focused verification:** three levels, duplicate shortcuts, move/reload, cycle/depth/scope rejection, subtree delete/undo, public draft filtering and 320px navigation.
