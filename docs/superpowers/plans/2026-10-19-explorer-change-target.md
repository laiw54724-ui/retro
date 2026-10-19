# Explorer change-target slice

Base: fresh main `8e2e54241ecca4c79cb5d6190e7b4b0beb804075`. Independent of #120, which stays frozen. Current #29/#50 and open PRs inspected before edits.

## Goal and design

Authors can redirect an existing, healthy Explorer shortcut to a window, OC or post using the existing target picker and serialized EntityRef. Currently the action exists only for a missing target. Expose Change target for healthy shortcuts, keep Repair target for missing shortcuts, and share their existing update path. Seed the picker with the existing kind/ID and show its pending selection even when search filters the selected row away. Preserve shortcut ID, label, icon, location, order and visibility. Cancel/Escape and applying the same kind/site/ID make no author update; changing the target makes one update and one undo step. Visitor navigation remains on the existing resolver.

This fits current schema and requires no rollout. New action schemas, destination carriers outside Explorer/Links, music, sequences, Dialog, Paint and image editing remain excluded. Expanding actions to document/gallery/about/IG requires the reader-preservation/projection/write gates documented in the existing navigation plan and is not part of this slice.

## Files and checks

- `features/modules/explorer/index.tsx`: healthy-target entry, modal copy/current target, no-op guard.
- `features/modules/explorer/ExplorerDialogs.tsx`: pass optional initial target to shared picker.
- `features/navigation/LinkTargetPicker.tsx` and its CSS module: display pending target summary throughout search, in reserved space so first selection cannot move a double-click target. Existing staged Apply/Cancel contract unchanged.
- Four `i18n/locales/*/modules.json` files: scoped change-target and selection copy.
- `tests/e2e/explorer.spec.ts`: current target, filtered summary, Escape/Cancel/no-op zero writes, real retarget preserving fields, undo/redo/reload, window/profile/post targets, phone layout, existing visitor resolver.

Only the shared picker and locale blocks are shared integration risks. No overlap with #120 implementation files. Final browser verification uses isolated local port 5218, one worker, `CI=1` to disable server reuse, and `--retries=0`. Run affected Explorer/navigation units, locale resource/quality checks, focused browser cases and web TypeScript; no full suite or build.

## Execution

- [x] Inspect missing healthy-target control: the pre-change toolbar only rendered target editing when `selectedStatus.status === "missing"`.
- [x] Add the bounded author flow and four-language text.
- [x] Verify author state preservation and existing viewer behavior with focused checks.
- [x] Record actual results and limits. Commit and Draft PR are the delivery steps.

## Actual verification and corrections

- **27 unit tests passed** across Explorer model, existing navigation resolver, locale resource parity and translation quality.
- **Seven distinct focused Chromium cases passed**: three new cases for healthy retargeting, no-result selection and 320px OC-to-post retarget/visitor preview; existing create/double-click/reload, public projection, desktop visitor opening and 320px Links picker Cancel/Apply. The final corrected run passed all four affected cases; the other three existing cases passed in the preceding run.
- New author regression proves original selection, hidden-by-search summary, Cancel/Escape focus restoration, no-op zero saves and disabled Undo, one save for a changed target, preserved ID/label/icon/location/order/draft visibility, undo/redo and reload.
- New 320px case changes the existing profile shortcut to an exact post through keyboard selection, checks saved stable kind/ID, opens that post using the existing visitor resolver, returns to the source, and makes zero additional preview saves. Picker screenshot inspected at `test-results/retarget-corrected/explorer-320px-author-redi-6e4f0-itor-preview-without-writes-chromium/retarget-picker-320.png`.
- Web TypeScript and whitespace checks passed. Only focused tests were run; no full build/suite.
- Initial port 5198 was already serving another worker's checkout. Those results were discarded; that server was not modified or stopped. Final runs explicitly launched this worktree on 5218 with server reuse disabled.
- Verified tests caught two product details now fixed: Cancel/Escape needed explicit focus restoration to the target-editing button; dynamically inserting a selection summary moved the list between double-clicks. The summary now reserves fixed space.
- Test-only corrections: use canonical v2 fixtures to exclude the normal legacy migration save from zero-write assertions; author canvases render windows regardless of visitor `defaultOpen`, so persistence/selection assertions replace a false closed-window expectation.

```sh
pnpm --filter @retrodesk/web exec vitest run src/features/modules/explorer/explorerModel.test.ts src/features/navigation/resolveLinkDestination.test.ts src/i18n/resources.test.ts src/i18n/translationQuality.test.ts
CI=1 PLAYWRIGHT_PORT=5218 pnpm exec playwright test tests/e2e/explorer.spec.ts tests/e2e/link-targets.spec.ts --grep 'healthy shortcut target editing|target search with no results|320px author redirects|author creates, names|saved result renders|desktop visitor: shortcuts|320px shared Links picker' --workers=1 --retries=0 --reporter=list --output=test-results/retarget-final
CI=1 PLAYWRIGHT_PORT=5218 pnpm exec playwright test tests/e2e/explorer.spec.ts --grep 'healthy shortcut target editing|target search with no results|author creates, names|320px author redirects' --workers=1 --retries=0 --reporter=list --output=test-results/retarget-corrected
pnpm --filter @retrodesk/web typecheck
```

## Remaining limits / parent follow-up

- Malformed persisted Explorer references can be rejected before opening the editor (`Missing shortcut window`). The existing missing-target repair entry remains, but this slice does not change document admission/migration rules or claim an end-to-end repair test for malformed stored documents.
- Separate observed visitor issue: after entering preview from an already-mounted mobile Explorer editor, post Back returns to the correct Explorer but can leave focus off the preview trigger. `restoreNavigationFocus` in `features/navigation/useVisitorNavigation.ts` searches all matching document keys and can select the hidden editor duplicate. This slice restores the **author picker** focus only; the existing session helper is unchanged and the preview test asserts route return/zero writes, not focus restoration. Parent may reserve that helper for a separate fix.
- No #120 dependency, schema/reader/writer gates, music, sequences, Dialog, Paint, image editing, feature activation, deployment, merge or main push. Native device and combined integration acceptance remain pending. Staging 403 remains a stop condition.
