# Recovery integration increment 04

**Base checkpoint:** Draft #125 at2335e2704c68adba819fe53ecca3c2a16dcf9246, tree d42c2d48f828f1089ac4eda189f98011c83007f4. Its build was already running when the next clearances arrived, so it was completed and retained unchanged.

**Increment sources:** #123a018ba9ed73436bc05155d300ce5908aaa7f1155 (main base), #1247670b6b2b7345bfa9023e7f2bfe0d5aa52745a42 (exact #121 base), #1261dfb73b2ab08bfe39ed954b2e0913c8c80096087 (main base). Each independently cleared by parent, exact source CI successful, merged cleanly by ancestry. No source branch amended or runtime conflict resolution.

- [x] Finish/freeze #125 with6focused Chromium,2production routes, one combined Web build and exact-head CI39297468072 success.
- [x] Assemble #123/#124 in a separate worktree. Eight selected boundary/cross-feature Chromium cases passed in37.1s,0failed/skips/retries; no build repeated.
- [x] Add #126 after that run completed. Strengthen the existing #123320px retarget/preview regression to require actual trigger focus after Back and Escape, while preserving the mounted author source and zero visitor saves.
- [x] Verify affected phone/focus/image/Paint boundaries (8passed,0failed/skips/retries), then prepare a Draft superset integration PR and run one local production build plus exact-head routine CI for this material increment. Keep #125 untouched. No source full-suite repetition or broad unrelated gate.

**Limits:** source unit/browser counts overlap and remain per-source receipts, not summed. Local mock tests do not establish staging/private storage/native-device acceptance. No main merge/deploy, API/schema/SQL/dependency/workflow/flag/production change or existing403stop workaround. Parent owns release decision and source PR cleanup.

Final build/CI results are recorded on the Draft PR and private receipt after committing the source; this plan is not edited after exact-head validation.
