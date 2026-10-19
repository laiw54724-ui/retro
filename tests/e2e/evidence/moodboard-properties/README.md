# Moodboard #44 review evidence

Base: `386c209dd8cb47bae96a749a7751cc7189032183` (`integration/retro-preview-r1-r3`; [run 39145698313](https://github.com/laiw54724-ui/retro/actions/runs/39145698313) success). #77 M1 excluded. Before screenshots were captured on the base with ordinary clicks, confirming absent object list and numeric inputs. After screenshots use the same fixture and regular clicks (desktop) or touchscreen taps (320/390), with no force clicks. They show a previously covered note selected from the new list, moved to X160/Y120, resized to 320×210 and brought to front, then saved/reloaded. Images are review evidence, not asserted visual baselines.

| View | Before | After |
| --- | --- | --- |
| Desktop 1440×900 | [Before](before-1440.png) | [Object list and geometry](after-1440.png) |
| Phone 320×900 | [Before](before-320.png) | [Canvas and object list](after-320.png) |
| Phone 390×900 | [Before](before-390.png) | [Canvas and object list](after-390.png) |

Additional 320px evidence: [numeric properties](after-geometry-320.png), [reachable bottom actions](after-controls-320.png), [saved document on public page](public-320.png).

## Changes

- Front-to-back object list selects fully covered and locked objects, with native keyboard buttons, current selection, rank and lock indication.
- X/Y and localized W/H fields use stored pixel coordinates. Enter/blur commits; Escape/blank restores; finite values are bounded to canvas dimensions and minimum 24px size. Locked geometry/nudge/size controls are disabled.
- One-layer backward ordering now swaps the actual stable visual order, including tied ranks; bringing to front compacts ranks to avoid overflow.
- Existing text alignment schema is editable via existing translated actions.
- Scoped container query stacks a narrow window or phone, touch controls are at least 44px, canvas background permits vertical scrolling, and mobile editor/public canvas retains its stored aspect ratio.

No shared shell, preview, OC, Music, API, schema, CI, global CSS or centralized translation edits. Existing #40 canvas click/Enter/Space selection remains unchanged. All prose uses existing four-language keys; X/Y and px are standard coordinate/unit symbols. No translation handoff is needed.

## Validation

- `corepack pnpm --filter @retrodesk/web exec vitest run src/features/modules/moodboard/editing.test.ts src/features/editor/store.test.ts src/i18n/hardcodedText.test.ts` — **15 passed** (6 geometry/order, 8 editor history/store, 1 translation guard).
- `corepack pnpm --filter @retrodesk/web typecheck` — **passed**.
- `PLAYWRIGHT_PORT=5184 pnpm exec playwright test tests/e2e/moodboard-properties.spec.ts tests/e2e/moodboard.spec.ts --workers=1` — **8 passed**; new cases were then strengthened with numeric clamping and exact saved-object assertions.
- `PLAYWRIGHT_PORT=5184 pnpm exec playwright test tests/e2e/moodboard-properties.spec.ts tests/e2e/component-operations.spec.ts --grep Moodboard --workers=1` — **5 passed**, including the strengthened 3 cases and existing #40 Enter/Space selection at desktop/320.
- One additional 320 case passed after adding the geometry review screenshot. **10 distinct behavioral cases passed in total**; overlapping runs are not counted twice. The original 3 before-characterization cases are separate evidence, not feature pass counts.
- Existing regression covers Chinese content, pointer drag, undo, reload, real PNG, blocked cross-origin export, public 320 overflow and 100-object limit. New cases cover layer selection/order/duplicate/delete, precise geometry/cancel/blank/clamp, locking, desktop undo/redo, exact persisted content and public geometry/alignment at 1440/320/390.
- `git diff --check` — passed.

## Remaining boundaries

This is only the Moodboard subset of #44; it does not close #44 or #40. API calls use deterministic local fixtures; no live accounts or deployments are changed. Mobile checks emulate Chromium touch, not iOS/Android hardware. Desktop undo/redo is exercised; shared mobile history UI is outside scope. Native IME, screen-reader/device validation, real storage/publication, WebKit and the final integrated contributor gate remain with the integrator. No merge, main push, deployment, migration, secrets or permission changes.

## Independent review follow-up: numeric draft lost on canvas selection

Reproduced on initial UX commit `0cbf57d7115332e7546f1f2d21263af45d2c429f` using ordinary clicks: type X=230 without Enter, click another canvas object or blank canvas, then select the original note. Both returned X=80 (2 failures); the layer-list path and Enter/Escape/external Undo control cases passed (2 passes). Canvas pointerdown changed selection and unmounted the keyed fieldset before the browser's normal blur could commit the draft.

Fix: finish the focused geometry input's blur in the canvas pointer capture phase, before selection changes. Keep blur/Enter as commits and Escape/blank as cancellation. Initialize a drag's base from its first move snapshot, so a numeric commit immediately followed by dragging starts at the newly committed position. Numeric and drag changes remain separate atomic undo steps. No changes to GeometryInput's public contract, shared editor history, schema or translations.

Follow-up verification on the amended source:
- `PLAYWRIGHT_PORT=5184 pnpm exec playwright test tests/e2e/moodboard-properties.spec.ts --grep 'geometry commits on|geometry Enter|drag starts from' --workers=1 --timeout=10000` — **8 passed**: desktop click and 320 touch tap for object/blank/layer, Enter/Escape/external Undo with repeated Enter/no duplicate step, and numeric-edit-to-drag continuity with two separate undos. No force clicks or fixed sleeps.
- `corepack pnpm --filter @retrodesk/web exec vitest run src/features/modules/moodboard/editing.test.ts src/features/editor/store.test.ts` — **14 passed**; web typecheck and diff whitespace check passed.
- Initial UX screenshots/10-case results above remain evidence for the original UX commit. The follow-up intentionally reran only this affected small group, not the full contributor gate. A first drag test attempt clicked an offscreen coordinate; it was corrected to scroll the target into view using the normal locator API, with assertions unchanged.
