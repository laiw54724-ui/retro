# F11: distinguish content editing from window settings

Independent branch based on main `f11ad8d5cb869d47849834cdd8a692a5059d8021`. PR #130 is frozen; no cherry-pick is required for this slice. The parent will combine the already-owned accessible sheet wrapper separately.

## Scope

- Rename the bottom settings entry and its sheet title to Window settings; rename the content titlebar action to Edit content / Done in all four maintained editor locales.
- Put a return-to-current-content action at the top of settings. Close only the sheet and focus the existing titlebar action without scrolling. Preserve openId, selectedId, inlineEdit and the mounted content editor.
- Keep the existing Done callback unchanged. The IG owner confirms that settings transitions should preserve the mounted editor and that its separate draft work supports same-tab editor re-entry; no IG draft infrastructure belongs here.
- When no app is open, show an explicit open-window hint; retain the existing selection hint when nothing is selected. Remove the old bottom-only instruction.
- Runtime ownership: MobileScreen.tsx, editor locale files, and a scoped 44px return-control CSS rule. Existing browser selector updates are mechanical. No header/history/status, theme/image editing, Paint, modal implementation, schema, flags or release changes.

## Verification

Exercise shared entry names across the 12 registry window types. On 320/390/430 phones verify that returning from settings preserves content edit mode, unfinished URL draft, selection, mounted DOM and scroll without writes. Verify read-only content mode and no-selection behavior, plus neighboring phone shell/picker and representative content checks. Full suite/build and combined #130/IG integration remain with the parent.

## Results

- Baseline regression failed as expected: the content action still had the ambiguous old name.
- **25 distinct Chromium checks passed**: the focused group passed 24/24 in 34.2s; a separate English 320px toolbar check passed 1/1 in 3.8s. One worker, no retries, isolated port 5223 with `CI=1` (no server reuse).
- The new checks cover all 12 registry types, view-mode retention, settings return at 320/390/430, mounted Gallery and IG editors, unfinished URL/Handle drafts, selected/open window identity, exact content scroll, no API saves, no-open/no-selection hints, touch targets and English label fit. Neighboring checks cover phone shell, picker, document, IG validation and window appearance/chrome settings.
- **14 locale checks passed** (`resources`, `translationQuality`, `hardcodedText`); web typecheck and diff check passed. Reviewed the 320px settings screenshot.
- Browser API writes are mocked. Safari, physical-device keyboards and combined #130/IG behavior are not claimed as tested here. No full suite/build or release operations ran.

Focused browser command:

```sh
CI=1 PLAYWRIGHT_PORT=5223 pnpm exec playwright test \
  tests/e2e/mobile-content-settings.spec.ts tests/e2e/mobile-shell.spec.ts \
  tests/e2e/icon-picker.spec.ts tests/e2e/document-ux.spec.ts tests/e2e/ig-validation.spec.ts \
  tests/e2e/appearance.spec.ts tests/e2e/window-chrome-editor.spec.ts \
  --grep 'content and window settings|settings return|settings without|settings with no|edit/finish control|mobile 320px: dialog|long document content.*320|clear and retype.*390|mobile window appearance|mobile chrome edits' \
  --workers=1 --retries=0 --reporter=list --output=test-results/f11-final
```

## Integration notes

No commits from #130 or the IG branch are included. MobileScreen's settings-body insertion is adjacent to #130's wrapper replacement: keep the new return action as the first settings child inside that ModalDialog, and keep both the new titlebar ref and #130 focus behavior. Preserve the existing Done onClick unchanged. New #130/IG tests added after this base need the same mobile selector renames (`視窗設定`, `編輯內容`, `完成`); existing main selectors are already migrated here. The IG owner has been informed. EditorPage and the header/history/status CSS rule are untouched.
