# Desktop Taskbar and Flow Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Start, the live clock, window tasks, and configured icons behave consistently in the editor, visitor preview, and published desktop.

**Architecture:** Add a focused shared `DesktopTaskbar` component that owns transient Start-menu and local-clock state while receiving window state callbacks from each host. Keep window management in the editor store and visitor runtime. Update `VisitorDesktop` to use the same configured icon rendering as the editor.

**Tech Stack:** React 19, TypeScript, CSS, Zustand, Playwright.

---

### Task 1: Lock the public desktop behavior with failing E2E coverage

**Files:**
- Modify: `tests/e2e/public.spec.ts`
- Modify: `tests/e2e/editor-windows.spec.ts`

- [ ] **Step 1: Add a public desktop Start-menu and clock test**

Add a test that loads the desktop fixture, confirms the clock matches `HH:mm` and does not contain `Demo Desk`, opens Start, selects the initially closed `Links.exe`, confirms its dialog opens, and confirms the menu closes.

```ts
test("desktop Start menu opens closed windows and the taskbar shows local time", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await mockPublicSite(page);
  await page.goto("/@demo");

  const clock = page.locator(".visitor-clock");
  await expect(clock).toHaveText(/^\d{2}:\d{2}$/);
  await expect(clock).not.toContainText("Demo Desk");

  await page.getByRole("button", { name: "開始" }).click();
  const menu = page.getByRole("menu", { name: "開始功能表" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Links.exe" }).click();
  await expect(page.getByRole("dialog", { name: "Links.exe" })).toBeVisible();
  await expect(menu).toBeHidden();
});
```

- [ ] **Step 2: Add configured-icon and editor clock assertions**

Verify the published `About.exe` icon contains the configured icon image, and verify the editor clock uses the same `HH:mm` contract.

```ts
await expect(page.locator(".visitor-icon").filter({ hasText: "About.exe" }).locator("img")).toBeVisible();
await expect(page.locator(".taskbar-clock")).toHaveText(/^\d{2}:\d{2}$/);
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run: `PLAYWRIGHT_PORT=5197 pnpm exec playwright test tests/e2e/public.spec.ts tests/e2e/editor-windows.spec.ts`

Expected: the public test fails because Start has no menu, the clock contains the site name, and public icons use a generic CSS file icon.

### Task 2: Build the shared desktop taskbar

**Files:**
- Create: `apps/web/src/features/site/DesktopTaskbar.tsx`
- Modify: `apps/web/src/features/editor/DesktopCanvas.tsx`
- Modify: `apps/web/src/features/site/VisitorDesktop.tsx`
- Modify: `apps/web/src/styles/w98.css`
- Modify: `apps/web/src/styles/global.css`

- [ ] **Step 1: Implement a minute-aligned local clock hook**

Create `useLocalClock` in `DesktopTaskbar.tsx`. Initialize with `new Date().toTimeString().slice(0, 5)`, schedule the next update for the next minute boundary, and clear the timeout on unmount.

```ts
function useLocalClock() {
  const [clock, setClock] = useState(() => formatClock());
  useEffect(() => {
    let timeout = 0;
    const schedule = () => {
      const delay = 60_000 - (Date.now() % 60_000) + 50;
      timeout = window.setTimeout(() => {
        setClock(formatClock());
        schedule();
      }, delay);
    };
    schedule();
    return () => window.clearTimeout(timeout);
  }, []);
  return clock;
}
```

- [ ] **Step 2: Implement `DesktopTaskbar`**

Define task entries as `{ window: DesktopWindow; visible: boolean; active: boolean }`. Render one Start menu listing all document windows, visible task buttons only, configured icons throughout, and a semantic clock. Close the menu after selection, on Escape, and on outside pointer-down.

```ts
export type DesktopTask = { window: DesktopWindow; visible: boolean; active: boolean };

export function DesktopTaskbar({ document, tasks, onOpen, onToggle, visitor = false }: Props) {
  const [startOpen, setStartOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const clock = useLocalClock();
  const tv = themeView(document.theme);

  useEffect(() => {
    if (!startOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setStartOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStartOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [startOpen]);

  return <div ref={rootRef} className={visitor ? "desktop-chrome visitor-chrome" : "desktop-chrome"}>
    <div className="taskbar2 visitor-taskbar">
      <button type="button" className="start-btn" aria-expanded={startOpen} aria-controls="desktop-start-menu" onClick={() => setStartOpen((open) => !open)}>開始</button>
      <div className="task-items">{tasks.filter((task) => task.visible).map((task) => <button type="button" key={task.window.id} onClick={() => onToggle(task.window.id)}>{task.window.title}</button>)}</div>
      <time className="clock taskbar-clock visitor-clock" dateTime={clock}>{clock}</time>
    </div>
  </div>;
}
```

Use `aria-expanded`, `aria-controls="desktop-start-menu"`, `role="menu"`, `aria-label="開始功能表"`, and `role="menuitem"`.

- [ ] **Step 3: Replace the editor's duplicated taskbar markup**

Remove `startOpen` and the render-time `clockText` from `DesktopCanvas`. Pass all editor windows to `DesktopTaskbar`, mapping store view states to `visible` and `active`, and keep existing `openWindow` and `toggleTask` callbacks.

```tsx
<DesktopTaskbar
  document={document}
  tasks={document.windows.map((window) => ({
    window,
    visible: view[window.id] !== "closed",
    active: selectedId === window.id && view[window.id] !== "min"
  }))}
  onOpen={openWindow}
  onToggle={(id) => {
    const window = document.windows.find((candidate) => candidate.id === id);
    if (window) toggleTask(window);
  }}
/>
```

- [ ] **Step 4: Replace the visitor's decorative taskbar and generic icons**

Resolve `themeView(document.theme)`, render each visitor icon with `Icon name={window.icon}`, and pass runtime state to `DesktopTaskbar` with `visitor` enabled.

```tsx
<span className="deskicon-tile" style={{ background: tv.tileBg, boxShadow: tv.tileShadow }}>
  <Icon name={window.icon} size={32} />
</span>
```

- [ ] **Step 5: Consolidate taskbar CSS**

Keep `.taskbar2`, `.start-menu`, `.start-btn`, `.task-items`, `.task-item`, and `.clock` as the shared Win98 primitives. Limit `.visitor-taskbar` to fixed positioning on the public page and absolute positioning inside preview. Remove obsolete generic visitor taskbar/button/clock styling.

- [ ] **Step 6: Run focused tests and verify they pass**

Run: `PLAYWRIGHT_PORT=5197 pnpm exec playwright test tests/e2e/public.spec.ts tests/e2e/editor-windows.spec.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Commit the implementation**

```bash
git add apps/web/src/features/site/DesktopTaskbar.tsx apps/web/src/features/editor/DesktopCanvas.tsx apps/web/src/features/site/VisitorDesktop.tsx apps/web/src/styles/w98.css apps/web/src/styles/global.css tests/e2e/public.spec.ts tests/e2e/editor-windows.spec.ts
git commit -m "fix: complete desktop taskbar interactions"
```

### Task 3: Verify the complete creator-to-visitor flow and deploy

**Files:**
- Modify: `apps/web/src/features/editor/VisitorPreview.tsx`

- [ ] **Step 1: Run static and unit validation**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`

Expected: every command exits successfully; unit totals remain at least 24 passing tests.

- [ ] **Step 2: Run the full browser suite**

Run: `PLAYWRIGHT_PORT=5197 pnpm test:e2e`

Expected: all existing tests plus the new taskbar coverage pass.

- [ ] **Step 3: Run the Impeccable detector once**

Run: `node /Users/wen/.agents/skills/impeccable/scripts/detect.mjs --json apps/web/src/features/site/DesktopTaskbar.tsx apps/web/src/features/editor/DesktopCanvas.tsx apps/web/src/features/site/VisitorDesktop.tsx apps/web/src/styles/w98.css apps/web/src/styles/global.css`

Expected: no unaddressed findings.

- [ ] **Step 4: Push and deploy staging**

Push the current branch, build the web application with the staging public environment values, and deploy `apps/web/dist` to the `retrodesk-staging` Pages project.

Expected: the canonical staging URL serves the new asset hashes.

- [ ] **Step 5: Perform one bounded live visual pass**

Open the staging editor preview and published route at desktop width. Verify Start opens, a closed window reopens from it, the chosen icon appears, the clock is current local time, and the wallpaper still covers without tiling. Fix all observed defects in one batch, then perform at most one confirmation pass.

- [ ] **Step 6: Report deployment evidence**

Report the canonical staging URL, deployment identifier, commit, full test counts, and the exact desktop-flow behaviors verified. State that production remains untouched.
