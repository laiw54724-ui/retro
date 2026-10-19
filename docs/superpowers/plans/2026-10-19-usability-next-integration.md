# Usability next integration candidate

Base main: `fa79436a3b8d7d1433e30b5abe4147c0868c4864`. Separate branch/worktree `integration/retro-usability-next-01` / `retro-usability-next-01`. All source branches/worktrees remain unchanged.

## Source matrix (merge ancestry retained)

| PR | Source head | Source routine CI | Independent review at preparation |
| --- | --- | --- | --- |
| #109 Paint import | cddbcceea12eec183cfa29a0028dac5efc895ed5 | 39252993592 success | ready |
| #110 music editing | a4c8cdb72a533419d1230d5ba67327b2ab062835 | 39253251407 success | ready |
| #111 deferred editor loading | 387be20b40a0eaaefccac0e4e999659f2bd3026a | 39253862230 success | ready with source measurement limits |
| #112 image authoring | c69000c450140bfe065f47b292117b504a203fba | 39254113917 failure | UI/security review in progress; security URL/upload race reported |

The four exact heads merged cleanly with no conflicts. Locale additions live in separate music and editor/module namespaces and were preserved. No source branch amendments or merges into main.

## Integration repairs before the full gate

- #112 source CI failed the existing localizedDefaults contract test (361 web tests passed / 1 failed; build/artifact checks skipped). Move the image mapping into `editor.defaults.image` and add four locale entries without relaxing assertions. Focused default/resource/translation checks: 22 passed.
- Security review identified an upload race while a newer URL is still local input (no blur/Enter). Reproduced with an existing nonempty URL: delayed replacement cleared the typed draft, while the untouched-input accepted case passed. Add optional `ImageUrlField.onEdit` and invalidate only the image source upload slot before editing local text. Preserve current source until the author commits the URL. Both delayed regressions explicitly wait for the app to consume the actual transport response before inspecting input/source. Focused delayed/committed URL checks: 3 passed; web typecheck and secret audit passed. The untouched-input control passed before the fix; the dirty-input regression reproduced the loss before the fix.

## Single final gate

The existing integration workflow remains the runner route; its push branch triggers are unchanged so preparation does not accidentally launch the full gate. Add dedicated Paint import (5 cases), opted-in image authoring (including the new race regression), image production writer-exclusion and deferred editor production-route checks. Keep existing lint, full contributor, ja/ko, Linux Chromium baselines, WebKit smoke, image W3a/W3b, identity and unchanged-source assertions.

Full-gate launch is held until the known image blockers are repaired and independent UI/security verdicts clear the applicable final repair. Production image/appearance writers stay hard-off. No baseline or assertion reduction. Routine CI is distinct from the full gate; original source CI failure remains a failure.

No deployment, main merge, native/live provider/storage acceptance, production writer enablement or new performance timing claim. Source #111's observed entry-JS reduction and mixed timings remain source-specific observations. No performance benchmark rerun is required for this integration; only the changed route's functional production regression is added.
