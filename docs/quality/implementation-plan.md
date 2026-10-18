# #75 fixed baseline and bounded icon-loading change

Goal: measure the pinned R1/R2/R3 integration candidate, then remove only a demonstrated unnecessary payload. Author: Codex. Base: 386c209dd8cb47bae96a749a7751cc7189032183. Other lines own API/security, Moodboard, previews, mobile shell, Music, Instagram, shared schema, CSS, i18n and CI. Exclude M1 #77 and the pending review fixes.

User has authorized direct execution, branch push and a Draft PR. Execute inline; no additional implementers. #55 comment update was rejected by automatic approval review because explicit commenting authorization names #75/#76. Scope registered in #75 instead; no bypass.

- [x] Read issues, inspect remote/worktrees and preserve all dirty work.
- [x] Build production baseline in isolated worktree with locked dependencies.
- [x] Measure editor/public empty, normal, heavy fixtures at 320/390/1280, plus native sample card/ig/oc. Three cold/warm pairs each, no external network, no request interception that disables cache.
- [x] Confirm the Windows manifest appears in the entry bundle before changing runtime.
- [x] If confirmed, change only IconPicker.tsx to dynamically import the manifest for an installed pack, reuse current loading/error/retry copy and preserve selection/upload behavior.
- [x] Add production request-boundary tests and exercise installed-pack selection, failure/retry and missing-pack fallback; run existing icon-picker E2E.
- [x] Run identical after matrix. Report exact bytes, requests, timing spread, decoded dimensions, long tasks and lifecycle limitations. Do not claim field INP or React commits from browser-only metrics.
- [ ] Once candidate is complete, run one appropriate full gate (lint/typecheck/unit/build/audits/E2E); preserve failures and no retries/skip changes. Pin validation SHA.
- [ ] Push only this branch and create Draft PR against integration/retro-preview-r1-r3, Refs #75. No merge/deploy/closing issues.

Design choice: delay only the optional Windows icon catalog rather than split all routes or refactor the picker. The former is a smaller independent payload boundary, retains synchronous stable ID resolution, and avoids occupied files. A clean report is acceptable if the measured cost is immaterial. No API or security-policy mutation.
