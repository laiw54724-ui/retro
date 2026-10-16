# Windows Icon Source and Win98 OC Visual Foundation Implementation Plan

> **For implementation:** Execute this plan task-by-task in the current branch. Mark each checkbox only after its command or assertion passes; stop on unexpected source counts, license metadata, or regressions.

**Goal:** Make the user-selected trapd00r/WinClassic icon collection the source for new icon choices without breaking saved legacy PNG URLs, document its non-MIT status, and correct Win98 OC avatars/highlights to remain circular.

**Architecture:** Keep the existing built-in SVG icons and legacy `/win98-icons/*.png` renderer for backward compatibility. Add a reproducible importer that consumes a checkout of trapd00r/win95-winxp_icons at commit `728a866ad59a54fd4082dbe000e1e62e50bd90e9`, copies only browser-displayable `.ico/.png` files to a new `/windows-icons/` namespace, generates the searchable manifest and a per-file SHA-256 provenance inventory, then switch new picker choices to that manifest. WinClassic is a secondary historical lookup source, not an automated download source. The visual fix is scoped to Instagram content shapes, leaving Win98 window chrome square.

**Tech Stack:** Node.js standard library, React 19, TypeScript, CSS, Playwright, pnpm, GitHub source metadata.

---

## Scope boundaries

This plan implements the first independent P0 slice of #26A and #27A. It does not add SiteDocument v2, multi-OC profiles, publishing projection, audio, Moodboard, Explorer, project-wide MIT licensing, or delete the current 1,757 legacy PNG files. Those remain separate implementation plans because each changes an independent data/security boundary.

The upstream repository has 1,201 blobs at the pinned commit: 1,191 ICO, 2 PNG, 3 ANI, 4 ICL and 1 README. This plan imports ICO/PNG only. ANI/ICL remain listed in the audit report as unsupported; they are not silently converted or omitted from provenance.

## File structure

- Create `scripts/import-windows-icons.mjs`: validate the exact upstream commit, copy supported files, generate deterministic manifests and support `--check`.
- Create `apps/web/src/lib/windowsIconManifest.ts`: generated UI manifest for the selected upstream collection.
- Create `docs/assets/windows-icons.provenance.json`: generated collection metadata, imported file hashes and unsupported-file inventory.
- Create `docs/THIRD_PARTY_ASSETS.md`: human-readable license boundary for the icon collection and Cubic 11.
- Modify `apps/web/src/lib/icons.ts`: accept both new ICO/PNG paths and legacy PNG paths.
- Modify `apps/web/src/features/modules/links/IconPicker.tsx`: use the new collection for curated/search results and show source attribution.
- Modify `apps/web/src/styles/ig.css`: keep content avatars/highlights circular in the Win98 skin.
- Modify `package.json`: expose reproducible import/audit commands.
- Modify `tests/e2e/instagram.spec.ts`: verify the content shapes stay circular in Win98.
- Modify `tests/e2e/editor-media.spec.ts`: verify picker source/search and an ICO selection survive save/render.
- Modify `README.md`: link the third-party asset notice and explain that Retro's future code license does not relicense Microsoft icons.

### Task 1: Add a deterministic upstream importer and provenance inventory

**Files:**
- Create: `scripts/import-windows-icons.mjs`
- Create (generated): `apps/web/src/lib/windowsIconManifest.ts`
- Create (generated): `docs/assets/windows-icons.provenance.json`
- Modify: `package.json`

- [ ] **Step 1: Write the importer contract before running it**

Create `scripts/import-windows-icons.mjs` with this complete implementation:

```js
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const EXPECTED_COMMIT = "728a866ad59a54fd4082dbe000e1e62e50bd90e9";
const PRIMARY_URL = "https://github.com/trapd00r/win95-winxp_icons";
const SECONDARY_URL = "https://winclassic.github.io/resources";
const repoRoot = process.cwd();
const publicDir = path.join(repoRoot, "apps/web/public/windows-icons");
const tsFile = path.join(repoRoot, "apps/web/src/lib/windowsIconManifest.ts");
const provenanceFile = path.join(repoRoot, "docs/assets/windows-icons.provenance.json");
const sourceArg = process.argv.find((arg) => arg.startsWith("--source="));
const checkOnly = process.argv.includes("--check");

if (!sourceArg) {
  console.error("Usage: node scripts/import-windows-icons.mjs --source=/absolute/path/to/win95-winxp_icons [--check]");
  process.exit(2);
}

const sourceDir = path.resolve(sourceArg.slice("--source=".length));

async function walk(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute, base));
    if (entry.isFile()) files.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return files;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function slug(relativePath) {
  return relativePath
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function label(relativePath) {
  return relativePath
    .replace(/\.[^.]+$/, "")
    .replace(/^icons\//, "")
    .replace(/[-_]+/g, " ");
}

const actualCommit = execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], {
  encoding: "utf8"
}).trim();

if (actualCommit !== EXPECTED_COMMIT) {
  console.error(`Expected upstream commit ${EXPECTED_COMMIT}, received ${actualCommit}`);
  process.exit(1);
}

const sourceFiles = await walk(sourceDir);
const supported = sourceFiles.filter((file) => /\.(ico|png)$/i.test(file));
const unsupported = sourceFiles.filter((file) => /\.(ani|icl)$/i.test(file));
const records = [];
const seenKeys = new Set();

for (const relativePath of supported) {
  const bytes = await readFile(path.join(sourceDir, relativePath));
  const extension = path.extname(relativePath).toLowerCase();
  const baseKey = slug(relativePath);
  let key = baseKey;
  let suffix = 2;
  while (seenKeys.has(key)) key = `${baseKey}-${suffix++}`;
  seenKeys.add(key);
  const outputName = `${key}${extension}`;
  records.push({
    key,
    label: label(relativePath),
    path: `/windows-icons/${outputName}`,
    upstreamPath: relativePath,
    sha256: sha256(bytes),
    bytes: bytes.length
  });
}

records.sort((a, b) => a.key.localeCompare(b.key));
const curated = records
  .filter((record) => /(^| )(computer|desktop|folder|document|camera|image|music|network|mail|user)( |$)/i.test(record.label))
  .slice(0, 48)
  .map((record) => record.key);

const ts = `// Generated by scripts/import-windows-icons.mjs. Do not edit manually.
export type WindowsIconRecord = { key: string; label: string; path: string; upstreamPath: string };
export const WINDOWS_ICON_SOURCE = ${JSON.stringify({ url: PRIMARY_URL, commit: EXPECTED_COMMIT }, null, 2)} as const;
export const WINDOWS_ICON_RECORDS: WindowsIconRecord[] = ${JSON.stringify(records.map(({ sha256: _hash, bytes: _bytes, ...record }) => record), null, 2)};
export const CURATED_WINDOWS_ICON_KEYS = new Set(${JSON.stringify(curated, null, 2)});
`;

const provenance = JSON.stringify({
  schemaVersion: 1,
  generatedFrom: { url: PRIMARY_URL, commit: EXPECTED_COMMIT, license: "NOASSERTION" },
  secondaryReference: { url: SECONDARY_URL, purpose: "historical lookup and dating" },
  rights: "Windows and application icons remain property of their respective owners and are not licensed under Retro's code license.",
  supportedExtensions: [".ico", ".png"],
  unsupported: unsupported.map((upstreamPath) => ({ upstreamPath, reason: "Browser picker does not import ANI or ICL files" })),
  files: records.map(({ key, path: publicPath, upstreamPath, sha256, bytes }) => ({ key, publicPath, upstreamPath, sha256, bytes }))
}, null, 2) + "\n";

if (checkOnly) {
  const existingTs = await readFile(tsFile, "utf8");
  const existingProvenance = await readFile(provenanceFile, "utf8");
  if (existingTs !== ts || existingProvenance !== provenance) {
    console.error("Generated Windows icon manifests are stale. Run pnpm icons:import -- --source=/path/to/win95-winxp_icons");
    process.exit(1);
  }
  for (const record of records) {
    const output = path.join(repoRoot, "apps/web/public", record.path.replace(/^\//, ""));
    const bytes = await readFile(output);
    if (sha256(bytes) !== record.sha256) {
      console.error(`Hash mismatch: ${record.path}`);
      process.exit(1);
    }
  }
  console.log(`Verified ${records.length} Windows icons from ${EXPECTED_COMMIT}`);
  process.exit(0);
}

await rm(publicDir, { recursive: true, force: true });
await mkdir(publicDir, { recursive: true });
await mkdir(path.dirname(provenanceFile), { recursive: true });

for (const record of records) {
  const source = path.join(sourceDir, record.upstreamPath);
  const target = path.join(repoRoot, "apps/web/public", record.path.replace(/^\//, ""));
  await cp(source, target);
  const info = await stat(target);
  if (!info.isFile()) throw new Error(`Import failed: ${record.upstreamPath}`);
}

await writeFile(tsFile, ts);
await writeFile(provenanceFile, provenance);
console.log(`Imported ${records.length} Windows icons; recorded ${unsupported.length} unsupported files`);
```

This script deliberately requires a real Git checkout and exact commit. It does not accept an arbitrary directory that merely has similar filenames, and it works for ordinary clones as well as Git worktrees.

- [ ] **Step 2: Add package scripts**

Add these entries to the root `package.json` scripts:

```json
"icons:import": "node scripts/import-windows-icons.mjs",
"icons:audit": "node scripts/import-windows-icons.mjs --check"
```

The caller still supplies the explicit source path:

```bash
pnpm icons:import -- --source=/absolute/path/to/win95-winxp_icons
pnpm icons:audit -- --source=/absolute/path/to/win95-winxp_icons
```

- [ ] **Step 3: Obtain and pin the upstream checkout**

Run:

```bash
git clone https://github.com/trapd00r/win95-winxp_icons.git /private/tmp/retro-win95-winxp-icons
git -C /private/tmp/retro-win95-winxp-icons checkout --detach 728a866ad59a54fd4082dbe000e1e62e50bd90e9
git -C /private/tmp/retro-win95-winxp-icons rev-parse HEAD
```

Expected final output:

```text
728a866ad59a54fd4082dbe000e1e62e50bd90e9
```

- [ ] **Step 4: Generate the browser assets and manifests**

Run:

```bash
pnpm icons:import -- --source=/private/tmp/retro-win95-winxp-icons
pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons
```

Expected: import reports 1,193 ICO/PNG records and audit verifies the same count. The exact count is asserted from the pinned upstream tree; if it differs, stop and inspect instead of updating the plan silently.

- [ ] **Step 5: Verify deterministic output**

Run the import and audit twice:

```bash
pnpm icons:import -- --source=/private/tmp/retro-win95-winxp-icons
pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons
pnpm icons:import -- --source=/private/tmp/retro-win95-winxp-icons
pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons
```

Expected: both audits verify exactly 1,193 files with no stale-manifest or hash error. This proves the second import regenerated the same manifest and byte-for-byte public assets from the pinned checkout.

- [ ] **Step 6: Commit the importer and generated inventory**

```bash
git add package.json scripts/import-windows-icons.mjs apps/web/src/lib/windowsIconManifest.ts apps/web/public/windows-icons docs/assets/windows-icons.provenance.json
git commit -m "feat: import pinned Windows icon collection"
```

### Task 2: Switch new icon choices while preserving legacy saved URLs

**Files:**
- Modify: `apps/web/src/lib/icons.ts`
- Modify: `apps/web/src/features/modules/links/IconPicker.tsx`
- Modify: `apps/web/src/features/site/MobileScreen.tsx`
- Test: `tests/e2e/editor-media.spec.ts`

- [ ] **Step 1: Add a failing E2E test for source, search and save**

Append this test to `tests/e2e/editor-media.spec.ts`, using the existing authenticated editor fixture in that file:

```ts
test("new Windows collection is searchable and legacy PNG icons still render", async ({ page }) => {
  await openEditor(page);
  await page.getByRole("button", { name: "連結視窗" }).click();
  const win = page.locator(".editor-window").filter({ hasText: "連結" });
  await win.getByRole("button", { name: /圖示/ }).first().click();

  await expect(win.getByText("來源：trapd00r/win95-winxp_icons")).toBeVisible();
  const search = win.getByRole("searchbox", { name: "搜尋 Windows 圖示" });
  await search.fill("computer");
  const result = win.getByRole("button", { name: /Windows 圖示.*computer/i }).first();
  await expect(result).toBeVisible();
  await result.click();

  await expect.poll(() => page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>(".module-links .w98-icon img");
    return img?.getAttribute("src") ?? "";
  })).toMatch(/^\/windows-icons\/.*\.ico$/);

  await page.reload();
  await expect(page.locator(".module-links .w98-icon img").first()).toHaveAttribute("src", /^\/windows-icons\/.*\.ico$/);

  await page.evaluate(() => {
    const image = document.createElement("img");
    image.id = "legacy-icon-probe";
    image.src = "/win98-icons/computer_2_cool-4.png";
    document.body.append(image);
  });
  await expect(page.locator("#legacy-icon-probe")).toHaveJSProperty("complete", true);
  await expect(page.locator("#legacy-icon-probe")).toHaveJSProperty("naturalWidth", 48);
});
```

If the file's helper is not named `openEditor`, import or reuse its existing helper verbatim rather than defining a second authentication flow.

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
pnpm test:e2e tests/e2e/editor-media.spec.ts --grep "new Windows collection"
```

Expected: failure because the picker has no new source label and still reads `WIN98_ICON_RECORDS`.

- [ ] **Step 3: Extend the safe local icon path contract**

In `apps/web/src/lib/icons.ts`, replace `isImageIcon` with:

```ts
export function isImageIcon(value: string): boolean {
  return /^https:\/\//i.test(value)
    || /^http:\/\/localhost[:/]/i.test(value)
    || /^\/win98-icons\/[A-Za-z0-9._-]+\.png$/i.test(value)
    || /^\/windows-icons\/[A-Za-z0-9._-]+\.(?:ico|png)$/i.test(value);
}
```

This preserves every already-saved `/win98-icons/*.png` value.

- [ ] **Step 4: Replace the picker manifest and labels**

In `IconPicker.tsx`, replace the old generated-manifest import with:

```ts
import {
  CURATED_WINDOWS_ICON_KEYS,
  WINDOWS_ICON_RECORDS,
  WINDOWS_ICON_SOURCE
} from "../../../lib/windowsIconManifest";
```

Replace the `win98` memo with:

```ts
const windowsIcons = useMemo(() => {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool = terms.length
    ? WINDOWS_ICON_RECORDS
    : WINDOWS_ICON_RECORDS.filter((record) => CURATED_WINDOWS_ICON_KEYS.has(record.key));
  return pool
    .filter((record) => terms.every((term) =>
      `${record.key} ${record.label} ${record.upstreamPath}`.toLowerCase().includes(term)
    ))
    .slice(0, 100);
}, [search]);
```

Replace the Win98 heading/search/results block with:

```tsx
<strong className="icon-picker-h">{search.trim() ? "Windows 搜尋結果" : "Windows 精選"}</strong>
<label className="icon-search">
  <span className="visually-hidden">搜尋 Windows 圖示</span>
  <input
    className="w98-input"
    type="search"
    value={search}
    placeholder={`搜尋 ${WINDOWS_ICON_RECORDS.length.toLocaleString()} 個 Windows 圖示`}
    aria-label="搜尋 Windows 圖示"
    onChange={(event) => setSearch(event.target.value)}
  />
</label>
<span className="w98-hint">
  來源：trapd00r/win95-winxp_icons（Windows 95–XP）；圖示權利屬各原權利人。
</span>
{windowsIcons.length ? (
  <div className="icon-grid win98-icon-grid">
    {windowsIcons.map((record) => cell(
      record.key,
      record.path,
      `Windows 圖示 ${record.label}`
    ))}
  </div>
) : <span className="w98-hint">找不到相符的 Windows 圖示。</span>}
{search.trim() && windowsIcons.length === 100
  ? <span className="w98-hint">顯示前 100 筆結果，請輸入更多關鍵字縮小範圍。</span>
  : null}
```

Remove `WINDOWS_ICON_SOURCE` from the import if TypeScript reports it unused; the visible source text is intentionally human-readable and does not need to interpolate the URL.

- [ ] **Step 5: Make the mobile window icon editor use the same picker**

Import `IconPicker` from `../modules/links/IconPicker`, remove `BUILTIN_ICON_KEYS`, and thread `siteId` and `upload` into `MobileEdit` from `MobileScreen`. Replace this exact call:

```tsx
{selected ? (
  <MobileEdit
    window={selected}
    count={ordered.length}
    siteId={siteId}
    upload={upload}
  />
) : <span className="m-note">先點一下桌面上的圖示，選取要編輯的視窗。</span>}
```

Change the function signature from:

```tsx
function MobileEdit({ window, count }: { window: DesktopWindow; count: number }) {
```

to:

```tsx
function MobileEdit({ window, count, siteId, upload }: {
  window: DesktopWindow;
  count: number;
  siteId?: string;
  upload?: (file: File, kind?: "image" | "icon") => Promise<string | null>;
}) {
}
```

Inside that function, replace only this existing block:

```tsx
<span className="w98-hint">圖示</span>
<div className="m-icons-row">
  {BUILTIN_ICON_KEYS.map((key) => <button key={key} type="button" className={"w98-btn m-ic" + (window.icon === key ? " on" : "")} aria-label={`圖示 ${key}`} aria-pressed={window.icon === key} onClick={() => patch({ icon: key })}><Icon name={key} size={28} /></button>)}
</div>
```

with:

```tsx
<IconPicker
  siteId={siteId}
  value={window.icon}
  upload={upload}
  onChange={(icon) => patch({ icon })}
  size={28}
/>
```

Leave the existing title field, `defaultOpen` checkbox, ordering buttons, duplicate/delete buttons and help text byte-for-byte unchanged.

- [ ] **Step 6: Run focused and type tests**

Run:

```bash
pnpm --filter @retrodesk/web typecheck
pnpm test:e2e tests/e2e/editor-media.spec.ts --grep "new Windows collection"
```

Expected: typecheck passes and the focused E2E test passes.

- [ ] **Step 7: Commit the picker migration**

```bash
git add apps/web/src/lib/icons.ts apps/web/src/features/modules/links/IconPicker.tsx apps/web/src/features/site/MobileScreen.tsx tests/e2e/editor-media.spec.ts
git commit -m "feat: use sourced Windows icon picker"
```

### Task 3: Document the non-MIT asset boundary

**Files:**
- Create: `docs/THIRD_PARTY_ASSETS.md`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Test: `scripts/import-windows-icons.mjs`

- [ ] **Step 1: Create the asset notice**

Create `docs/THIRD_PARTY_ASSETS.md` with exactly these sections:

```md
# Third-party assets

Retro's source-code license does not relicense user content or third-party assets.

## Windows 95–XP icons

- Primary source: https://github.com/trapd00r/win95-winxp_icons
- Pinned source commit: 728a866ad59a54fd4082dbe000e1e62e50bd90e9
- Historical lookup: https://winclassic.github.io/resources
- Local inventory: docs/assets/windows-icons.provenance.json
- License status: NOASSERTION; the source repository does not declare a software or asset license.
- Rights notice: Windows and application icons remain property of their respective owners. They are not covered by Retro's source-code license.

The import script accepts only the pinned checkout and records the upstream path, output path, SHA-256 and byte size for every copied ICO/PNG file. ANI and ICL files are inventoried but not imported.

## Cubic 11

- Source: https://github.com/ACh-K/Cubic-11
- Local license: apps/web/public/fonts/OFL.txt
- License: SIL Open Font License 1.1
- Reserved names: Cubic and 俐方體

## User uploads

Images, icons, audio and other content uploaded by site owners remain their responsibility and are not relicensed by Retro.
```

- [ ] **Step 2: Link the notice from README**

Add an `Assets and licensing` subsection to the root README:

```md
## Assets and licensing

Retro's code, third-party fonts, Windows icon collections and user-uploaded works have separate rights. See [Third-party assets](docs/THIRD_PARTY_ASSETS.md) before redistributing a build or asset pack.
```

Do not add a root MIT `LICENSE` in this task; #27 requires the rights holder to confirm the code-license scope first.

- [ ] **Step 3: Record the runtime boundary in architecture docs**

Append to the asset/security section of `docs/ARCHITECTURE.md`:

```md
### Bundled icon collections

New Windows icon choices are generated from a pinned upstream checkout into `/windows-icons/`. Existing documents may still reference `/win98-icons/`; that namespace remains read-only for compatibility. The generated provenance JSON is build evidence, not a license grant.
```

- [ ] **Step 4: Extend the audit to verify the rights notice**

In `scripts/import-windows-icons.mjs`, inside the `checkOnly` branch, read `docs/THIRD_PARTY_ASSETS.md` and fail unless it contains the primary URL, exact commit and `NOASSERTION`:

```js
const notice = await readFile(path.join(repoRoot, "docs/THIRD_PARTY_ASSETS.md"), "utf8");
for (const required of [PRIMARY_URL, EXPECTED_COMMIT, "NOASSERTION"]) {
  if (!notice.includes(required)) {
    console.error(`Third-party asset notice is missing: ${required}`);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Run and commit documentation verification**

Run:

```bash
pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons
git diff --check
```

Expected: the audit passes and Git reports no whitespace errors.

Commit:

```bash
git add README.md docs/ARCHITECTURE.md docs/THIRD_PARTY_ASSETS.md scripts/import-windows-icons.mjs
git commit -m "docs: declare third-party asset boundaries"
```

### Task 4: Restore circular OC avatars and highlights in the Win98 skin

**Files:**
- Modify: `apps/web/src/styles/ig.css`
- Test: `tests/e2e/instagram.spec.ts`

- [ ] **Step 1: Add a failing shape regression test**

Append to `tests/e2e/instagram.spec.ts`:

```ts
test("Win98 keeps window chrome square and OC media circular", async ({ page }) => {
  const { win } = await openEditor(page);
  await win.getByRole("tab", { name: "▶ 預覽互動" }).click();

  await expect(win.locator(".ig-app")).toHaveClass(/ig-skin-win98/);
  await expect(win.locator(".ig-avatar").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".ig-avatar-ring").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".ig-hl-ring").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".ig-hl-in").first()).toHaveCSS("border-radius", "50%");
  await expect(win.locator(".retro-titlebar").first()).toHaveCSS("border-radius", "0px");
});
```

If `.retro-titlebar` is outside `win` in the existing fixture, use `page.locator(".editor-window").filter({ has: win }).locator(".retro-titlebar")`; do not weaken the assertion by deleting it.

- [ ] **Step 2: Confirm the test fails for content shapes**

Run:

```bash
pnpm test:e2e tests/e2e/instagram.spec.ts --grep "OC media circular"
```

Expected: at least `.ig-avatar` or `.ig-hl-ring` reports `0px` instead of `50%`.

- [ ] **Step 3: Scope the Win98 square rule to chrome, not content**

Replace this rule in `apps/web/src/styles/ig.css`:

```css
.ig-skin-win98 .ig-avatar, .ig-skin-win98 .ig-avatar-ring, .ig-skin-win98 .ig-hl-ring, .ig-skin-win98 .ig-hl-in { border-radius: 0; }
```

with:

```css
/* Win98 chrome remains square; people and story covers remain recognisable circles. */
.ig-skin-win98 .ig-avatar,
.ig-skin-win98 .ig-avatar-ring,
.ig-skin-win98 .ig-hl-ring,
.ig-skin-win98 .ig-hl-in {
  border-radius: 50%;
}
```

Do not change `.w98-window`, `.retro-titlebar`, title-bar buttons or taskbar radii.

- [ ] **Step 4: Run the shape and scroll regressions**

Run:

```bash
pnpm test:e2e tests/e2e/instagram.spec.ts --grep "OC media circular|scroll"
pnpm test:e2e tests/e2e/responsive.spec.ts
```

Expected: circular-shape, nested scroll and responsive tests pass.

- [ ] **Step 5: Commit the visual fix**

```bash
git add apps/web/src/styles/ig.css tests/e2e/instagram.spec.ts
git commit -m "fix: keep Win98 OC media circular"
```

### Task 5: Full verification and issue evidence

**Files:**
- Modify: `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`
- Modify externally after all checks: GitHub issues #26 and #27

- [ ] **Step 1: Run all repository checks**

Run:

```bash
pnpm --frozen-lockfile install
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm build
pnpm icons:audit -- --source=/private/tmp/retro-win95-winxp-icons
git diff --check
```

Expected: every command exits 0. Record the actual unit/E2E test counts and build artifact result; do not copy counts from older runs.

- [ ] **Step 2: Inspect the output at required widths**

Start the existing preview server and verify:

```text
Desktop inner window widths: 360, 480, 720 px
Mobile viewport widths: 320, 375, 390, 430 px
Zoom: 200%
Checks: icon search, selected ICO rendering, legacy PNG rendering, circular avatar/highlight, vertical IG scroll, taskbar/start/time unchanged
```

Store screenshots only as test artifacts; do not commit user OC images or downloaded reference screenshots.

- [ ] **Step 3: Update verification evidence**

Append a section titled `P0 Windows icon and Win98 OC visual implementation` to `docs/superpowers/specs/2026-10-16-oc-platform/verification.md`. Record the four actual implementation commit hashes from Tasks 1–4, the pinned upstream commit, imported and unsupported counts, legacy/new path results, circular-media result, and the observed typecheck, unit, E2E and build results. Record numeric test counts from command output; do not reuse older counts or write symbolic fields.

- [ ] **Step 4: Run the plan self-review checks**

Run:

```bash
rg -n 'TODO|TBD|PLACEHOLDER|replace with' docs/superpowers/specs/2026-10-16-oc-platform/verification.md
git diff --check
git status --short
```

Expected: `rg` returns no matches. Git status contains only intended implementation files plus the user's existing untracked zip/directories, which must remain untouched.

- [ ] **Step 5: Commit verification evidence**

```bash
git add docs/superpowers/specs/2026-10-16-oc-platform/verification.md
git commit -m "test: record Windows icon and Win98 visual verification"
```

- [ ] **Step 6: Update GitHub issues without closing them prematurely**

Add a comment to #26 with the circular-media tests and responsive evidence. Add a comment to #27 with the pinned upstream commit, provenance manifest, file counts and rights boundary. Leave both issues open because #26B themes and #27B full open-source readiness remain unfinished.

## Self-review result

- Spec coverage: covers #26A's immediate roundness regression and #27A's selected icon source, provenance, legacy compatibility and non-MIT boundary.
- Deliberately deferred: title/color work already exists and only receives regression coverage here; full tokens, presets, code license, secret scanning and contributor docs remain later slices.
- Type consistency: new manifest exports `WINDOWS_ICON_RECORDS`, `CURATED_WINDOWS_ICON_KEYS` and `WINDOWS_ICON_SOURCE`; consumers use those exact names.
- Destructive-scope check: importer removes only the explicit generated directory `apps/web/public/windows-icons`. It does not remove `apps/web/public/win98-icons`, user-supplied directories or zip files.
- Evidence check: Task 5 requires observed hashes and test counts and rejects symbolic evidence fields before commit.
