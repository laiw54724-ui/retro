# Editor Collapsible Sidebars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let desktop authors independently collapse and restore the left tool panel and right inspector while the canvas expands into the released space.

**Architecture:** `EditorPage` owns two persisted UI-only booleans and composes the shell. A focused `SidebarToggle` component renders the boundary affordance without coupling panel content to layout state. CSS modifier classes remove panel width while retaining a narrow restore rail; existing responsive breakpoints remain authoritative.

**Tech Stack:** React 19, TypeScript, CSS, Playwright

---

### Task 1: Lock the interaction with an acceptance test

**Files:**
- Modify: `tests/e2e/editor-layout.spec.ts`

- [ ] **Step 1: Write the failing test**

Add an acceptance test that measures `.editor-stage2`, clicks the left boundary control, verifies the left panel is hidden and the stage is wider, then collapses the right panel independently. Activate the left restore control with Enter, reload, and assert the restored left/open and right/closed preferences remain.

```ts
test("desktop sidebars collapse independently and remember their state", async ({ page }) => {
  await openEditor(page);
  const initialWidth = (await page.locator(".editor-stage2").boundingBox())!.width;
  await page.getByRole("button", { name: "收合左側工具欄" }).click();
  await expect(page.locator(".left-panel2")).toBeHidden();
  await expect.poll(async () => (await page.locator(".editor-stage2").boundingBox())!.width).toBeGreaterThan(initialWidth);
  await page.getByRole("button", { name: "收合右側屬性欄" }).click();
  await page.getByRole("button", { name: "展開左側工具欄" }).focus();
  await page.keyboard.press("Enter");
  await page.reload();
  await expect(page.locator(".left-panel2")).toBeVisible();
  await expect(page.locator(".right-panel2")).toBeHidden();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- tests/e2e/editor-layout.spec.ts --grep "sidebars collapse"`

Expected: FAIL because the labelled boundary controls do not exist.

### Task 2: Add persisted shell state and accessible controls

**Files:**
- Create: `apps/web/src/features/editor/SidebarToggle.tsx`
- Modify: `apps/web/src/pages/EditorPage.tsx`
- Modify: `apps/web/src/styles/w98.css`

- [ ] **Step 1: Add the focused boundary component**

Create a native button component with `side`, `expanded`, and `onToggle` props. It must provide action-specific Traditional Chinese `aria-label` text and `aria-expanded`, and render a CSS-drawn directional mark instead of an emoji glyph.

```tsx
export function SidebarToggle({ side, expanded, onToggle }: Props) {
  const panelName = side === "left" ? "左側工具欄" : "右側屬性欄";
  return (
    <button
      type="button"
      className={`sidebar-toggle sidebar-toggle-${side}`}
      aria-label={`${expanded ? "收合" : "展開"}${panelName}`}
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span className="sidebar-toggle-mark" aria-hidden="true" />
    </button>
  );
}
```

- [ ] **Step 2: Add safe persisted state in `EditorPage`**

Read `retrodesk:editor-sidebars` once with a lazy state initializer. Accept only boolean `leftExpanded` and `rightExpanded` values; catch storage and JSON failures and default both to `true`. Persist changes in an effect without touching editor document state.

- [ ] **Step 3: Compose panel, toggle, stage, toggle, panel**

Render the left and right panels conditionally while keeping one toggle per side in desktop markup. Add `collapsed` modifier classes to the toggle rails so the canvas flex item consumes the freed width. Keep the existing medium and mobile media-query rules authoritative.

- [ ] **Step 4: Style the controls in the Win98 system**

Use the existing raised/sunken variables, a 24px rail, visible `:focus-visible`, and CSS borders for the directional marks. Do not animate width, because the editor contains draggable windows whose pointer coordinates must remain stable.

- [ ] **Step 5: Run the focused acceptance test**

Run: `npm run test:e2e -- tests/e2e/editor-layout.spec.ts --grep "sidebars collapse"`

Expected: 1 passed.

### Task 3: Protect responsive behavior and finish regression checks

**Files:**
- Modify: `tests/e2e/responsive.spec.ts` only if an existing assertion needs an explicit sidebar-control expectation

- [ ] **Step 1: Run editor and responsive browser tests**

Run: `npm run test:e2e -- tests/e2e/editor-layout.spec.ts tests/e2e/responsive.spec.ts`

Expected: all tests pass; at 768–1023px the right panel remains absent, and below 768px desktop sidebar controls do not appear.

- [ ] **Step 2: Run static and unit verification**

Run: `node_modules/.bin/tsc -b && node_modules/.bin/vitest run`

Expected: typecheck succeeds and all web unit tests pass.

- [ ] **Step 3: Run the full browser suite and production build**

Run: `npm run test:e2e`

Expected: all Playwright tests pass.

Run: `node_modules/.bin/vite build`

Expected: production bundle succeeds with only the existing chunk-size and dependency annotation warnings.

- [ ] **Step 4: Commit the feature**

```bash
git add apps/web/src/features/editor/SidebarToggle.tsx apps/web/src/pages/EditorPage.tsx apps/web/src/styles/w98.css tests/e2e/editor-layout.spec.ts tests/e2e/responsive.spec.ts
git commit -m "feat: add collapsible editor sidebars"
```
