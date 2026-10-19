# Editor save-session and exit recovery

Branch base: `92d8e0294e99dbdf0a99ac183ca04cd78004f4ec`. Verified runtime: `2adb08e1fba33884f0a87647064733ed250349c3`. Subsequent commits contain evidence only. No merge, deploy, full unrelated gate, or real-user data mutation was performed.

## Behavior

- A save captures its mounted editor session. After unmount/site change, its success or failure cannot update the current site's version, dirty/error state, notices, upgrade/conflict state, or redirect. Reopening the same site creates a distinct session. Ordinary newer edits within one session still queue another autosave using the acknowledged version.
- User SPA exits and browser Back show Stay / Leave anyway when canonical work is dirty, saving, or failed. Explicit sign-out asks before removing the session. Reload/tab close uses the browser's native beforeunload warning. Saved exits remain immediate.
- A theme writer's optional `themePreview` state is read as unapplied work. The guard never applies, persists, or publishes it. The standalone fixture injects this optional contract; combined real Apply/Cancel acceptance belongs to integration with #116.
- Retry lives in persistent header chrome, including phone, so closing the descriptive error notice cannot hide recovery. A successful retry clears only an obsolete save-failure notice. Real current-session version conflicts still pause saving; 426 recovery remains unchanged. Current-session 403/404 access loss retains its original redirect, while stale access-loss responses are ignored.

The router change is limited to one `createBrowserRouter` / `RouterProvider` catch-all wrapper around the existing `App` route table. The installed `useBlocker` requires data-router context; see the [supported navigation blocker](https://reactrouter.com/api/hooks/useBlocker). No route paths, loaders, actions, auth contracts, dependencies, schema or server validation change. This adds router runtime surface; it is a correctness fix, with no bundle-speedup or timing claim.

The same session check also protects receipt handling around the existing explicit asset conversion save/response. Asset conversion policy, calls, migration files and server behavior are unchanged; only local side effects from an ended editor are ignored.

## Focused evidence

Both new P1 checks failed on untouched main: no immediate-exit confirmation, and a late A receipt caused an unsolicited B save with A's version. [Before output](evidence/repro-before.txt) retains both failures. Early browser-harness expectations were corrected for preview's existing history marker, cancelled native reloads having no load event, and a truly anonymous context for auth checks; these are not product fixes or first-pass claims.

The final source passed:

- **23 targeted Chromium cases**: 17 save/router cases plus 6 existing asset/upgrade compatibility cases. Covers desktop/390px exit Stay, explicit leave/unmount, late A success/500/403/409/426 after B, same-site remount, normal in-flight newer edits, phone Retry after dismissal, real conflict pause, current 403/404 redirect, native Back/reload, preview Back/Forward, direct entry, unknown route, auth return query/hash, optional theme-preview guard, and sign-out cancellation. [Log](evidence/browser-final.txt)
- **2 production route checks**: unauthenticated redirect without fetching private editor code; failed editor chunk followed by translated retry/reload recovery. [Log](evidence/production-routes.txt)
- **13 locale/resource checks** for the five new keys under `editor.saveSession` in English, Traditional Chinese, Japanese and Korean. [Log](evidence/locales.txt)
- Web production build including TypeScript, plus diff whitespace check. [Build log](evidence/build.txt)

[Phone leave dialog](evidence/phone-leave-guard.png) and [persistent phone Retry](evidence/phone-persistent-retry.png) were visually inspected at 390×900. The dialogs/actions fit without horizontal clipping. These are emulated browser viewports, not native-device acceptance.

```sh
PLAYWRIGHT_PORT=5312 pnpm exec playwright test tests/e2e/editor-save-session.spec.ts tests/e2e/asset-migration.spec.ts tests/e2e/appearance-migration-upgrade.spec.ts --workers=1
pnpm --filter @retrodesk/web exec vitest run src/i18n/resources.test.ts src/i18n/translationQuality.test.ts
VITE_API_URL=http://127.0.0.1:5197 pnpm --filter @retrodesk/web build
pnpm exec playwright test --config tests/quality/playwright.config.ts tests/quality/editor-route-75.spec.ts
```

Run from the repository root with locked dependencies and existing Playwright browsers. Dev checks use synthetic intercepted API state; production checks use the existing loopback-only fixture server. [Identity and candidate asset hashes](evidence/identity.json) pin the receipt. The integrator owns combined acceptance and the aggregate gate.

## Boundaries

This is not a form persistence system. Module-local, uncommitted input buffers (including IG drafts that commit on blur/Enter) are neither universally detected nor retained on reload. Native warning wording is browser-controlled. Leave anyway does not promise to cancel or roll back a write already sent to the server; it may still finish. A same-site remount that read before an old write finished can legitimately encounter the server's optimistic conflict on its next edit.

No store/theme-preview fields, shared media controls, image/theme editor leaves or hosts, Instagram files, numeric fields or onboarding flow were edited. The image/theme author confirmed ownership boundaries before the Retry UI change; the leave-dialog portal is placed at the end of `EditorPage`, away from #116's post-header preview notice. #116/#117 remain separate source branches for integration. All worktrees are preserved.
