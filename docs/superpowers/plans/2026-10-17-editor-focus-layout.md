# Editor Focus Layout Implementation Plan

> **For Codex:** Implement this plan sequentially in the current isolated worktree. Keep focused checks local to each task, then run the full contributor gate once before deployment.

**Goal:** Make the desktop editor's add-module catalog reliably scroll without overlapping content, and dim the desktop behind the actively selected window so editing remains visually focused.

**Architecture:** Keep the left tab strip fixed and make its existing tab panel the sole scroll container. Add a non-interactive desktop scrim at a reserved z-index and temporarily lift only the selected, visible window above it; selection data and persisted window z-order remain unchanged.

**Tech Stack:** React 19, TypeScript, CSS, Playwright, pnpm workspace.

---

### Task 1: Lock the left catalog behavior with an E2E regression

**Files:**
- Modify: `tests/e2e/editor-layout.spec.ts`

**Step 1: Write the failing test**

Add a test that opens the editor, inspects every `.add-card` rectangle for non-overlap, verifies `.panel-scroll` has vertical overflow, scrolls it to the end, and confirms the `即將推出` section is reachable.

```ts
test("left module catalog scrolls without overlapping cards", async ({ page }) => {
  await openEditor(page);
  const panel = page.locator("#editor-left-panel .panel-scroll");
  const cards = panel.locator(".add-card");

  const rectangles = await cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    }),
  );
  expect(rectangles.every((rect, index) => index === 0 || rect.top >= rectangles[index - 1]!.bottom)).toBe(true);
  await expect.poll(() => panel.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(panel.getByText("即將推出")).toBeVisible();
});
```

**Step 2: Run the focused test and confirm the regression is represented**

Run: `pnpm test:e2e -- tests/e2e/editor-layout.spec.ts -g "left module catalog"`

Expected: the current implementation fails at least one geometry or reachability assertion at the constrained editor size used by the test. If the baseline passes, strengthen the test with a narrow/high-font rendering fixture that reproduces the supplied screenshot before changing CSS.

**Step 3: Commit the test with the implementation in Task 2**

Do not commit a red test independently.

### Task 2: Make the left catalog the only vertical scroll region

**Files:**
- Modify: `apps/web/src/styles/w98.css`
- Test: `tests/e2e/editor-layout.spec.ts`

**Step 1: Harden the scroll container and card layout**

Update `.panel-scroll` to preserve its flex shrink boundary, contain horizontal overflow and scroll chaining, and reserve scrollbar space. Make `.add-card` content-sized and non-shrinking. Give `.add-card-text` a real shrink boundary and allow both labels and descriptions to wrap safely.

```css
.panel-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.add-card {
  flex: 0 0 auto;
  min-height: 0;
  align-items: flex-start;
}

.add-card-text {
  flex: 1 1 auto;
  min-width: 0;
}

.add-card-text strong,
.add-card-text span {
  display: block;
  white-space: normal;
  overflow-wrap: anywhere;
}
```

**Step 2: Run the focused regression**

Run: `pnpm test:e2e -- tests/e2e/editor-layout.spec.ts -g "left module catalog"`

Expected: PASS.

**Step 3: Commit**

```bash
git add apps/web/src/styles/w98.css tests/e2e/editor-layout.spec.ts
git commit -m "fix: make editor module catalog scroll reliably"
```

### Task 3: Lock selected-window focus behavior with an E2E regression

**Files:**
- Modify: `tests/e2e/editor-layout.spec.ts`

**Step 1: Write the failing test**

Add a test that confirms the scrim exists after the initially selected window opens, its z-index is above an unselected window and below the selected window, clicking another window moves focus without persisting z-order, clicking empty wallpaper removes the scrim, and layout mode never shows it.

```ts
test("selected window gets a non-blocking desktop focus scrim", async ({ page }) => {
  await openEditor(page);
  const about = page.getByRole("dialog", { name: "About.exe" }).locator("xpath=ancestor::div[contains(@class,'canvas-window')]");
  const scrim = page.locator(".selection-scrim");

  await expect(scrim).toBeVisible();
  await expect(about).toHaveClass(/selected/);
  expect(Number(await about.evaluate((element) => getComputedStyle(element).zIndex)))
    .toBeGreaterThan(Number(await scrim.evaluate((element) => getComputedStyle(element).zIndex)));

  await page.locator(".icon-layer").click({ position: { x: 600, y: 440 } });
  await expect(scrim).toHaveCount(0);
  await page.getByRole("button", { name: "▦ 進入桌面排版模式" }).click();
  await expect(scrim).toHaveCount(0);
});
```

**Step 2: Run the focused test and confirm it fails**

Run: `pnpm test:e2e -- tests/e2e/editor-layout.spec.ts -g "focus scrim"`

Expected: FAIL because `.selection-scrim` does not yet exist.

### Task 4: Add the non-blocking focus scrim

**Files:**
- Modify: `apps/web/src/features/editor/DesktopCanvas.tsx`
- Modify: `apps/web/src/styles/w98.css`
- Test: `tests/e2e/editor-layout.spec.ts`

**Step 1: Compute whether focus treatment is active**

Create explicit z-index constants below the existing selection label, edit label, and taskbar values. Treat normal and maximized windows as visible; exclude minimized/closed windows and layout mode.

```ts
const FOCUS_SCRIM_Z = 90_000;
const FOCUS_WINDOW_Z = FOCUS_SCRIM_Z + 1;

const selectedView = selected ? view[selected.id] : null;
const focusSelected = Boolean(
  selected && !layoutMode && selectedView !== "min" && selectedView !== "closed",
);
```

**Step 2: Render the scrim and temporarily lift only the selected window**

Render one decorative, `aria-hidden` scrim within the desktop area. Set a selected window's render-only z-index to `FOCUS_WINDOW_Z`; do not update the document or call `bringFront` for this effect.

```tsx
{focusSelected ? <div aria-hidden="true" className="selection-scrim" /> : null}
```

**Step 3: Style the scrim for a 28% black focus layer**

```css
.selection-scrim {
  position: absolute;
  inset: 0 0 36px;
  z-index: 90000;
  pointer-events: none;
  background: rgb(0 0 0 / 28%);
}

@media (forced-colors: active) {
  .selection-scrim { display: none; }
}
```

**Step 4: Run the focused regressions**

Run: `pnpm test:e2e -- tests/e2e/editor-layout.spec.ts -g "left module catalog|focus scrim"`

Expected: PASS.

**Step 5: Commit**

```bash
git add apps/web/src/features/editor/DesktopCanvas.tsx apps/web/src/styles/w98.css tests/e2e/editor-layout.spec.ts
git commit -m "feat: focus the selected editor window"
```

### Task 5: UI quality review, full validation, and staging delivery

**Files:**
- Review: `apps/web/src/features/editor/DesktopCanvas.tsx`
- Review: `apps/web/src/styles/w98.css`
- Review: `tests/e2e/editor-layout.spec.ts`

**Step 1: Run the Impeccable detector exactly once**

Run:

```bash
node /Users/wen/.agents/skills/impeccable/scripts/detect.mjs --json \
  apps/web/src/features/editor/DesktopCanvas.tsx \
  apps/web/src/styles/w98.css \
  tests/e2e/editor-layout.spec.ts
```

Expected: no unresolved UI quality violations related to the changed surfaces.

**Step 2: Perform one bounded visual pass**

Check the desktop editor once at the supplied working viewport: left catalog scroll, last module reachability, selected-window contrast, window switching, background deselection, resizing/dragging, sidebar collapse, layout mode, and forced-colors fallback. Fix any confirmed issue and repeat only the affected check once.

**Step 3: Run the full pre-delivery gate once**

Run: `pnpm verify:contributor`

Expected: lint, types, unit/integration tests, build, and repository checks all pass.

**Step 4: Review the final diff**

Run: `git diff origin/main...HEAD --check` and inspect `git diff origin/main...HEAD` for accidental changes, persisted z-order changes, or broad CSS regressions.

**Step 5: Push, open a PR, merge after checks, and deploy staging**

Push `codex/editor-focus-layout`, create a PR linked to the approved editor usability work, wait for required checks, merge, then run the repository's staging deployment workflow. Confirm the deployed release in the real staging editor with the same bounded visual checklist.

**Step 6: Report evidence**

Report the merge commit, staging release URL/version, focused E2E result, full gate result, and the two visible behavior changes.
