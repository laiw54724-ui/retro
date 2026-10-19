# Default-off Image staging rollout implementation plan

**Goal:** Prepare the basic none/simple Image writer for an explicitly approved staging build, without activating it or changing production/schema/API permissions.

**Architecture:** Checked-in disabled release JSON, an exact canonical staging Web/API pair, Vite staging build mode, and a runtime origin check join the existing site/API compatibility gate. Normal production builds always compile a disabled staging release. Build artifacts carry a small public rollout receipt; production deployment verification rejects staging artifacts. Test-enabled configuration exists only in disposable local fixtures.

**Base:** Frozen #128 `976c217d76eb792e9f1bb270a664af7f65f00f32`. Separate worktree/branch `codex/image-staging-rollout-51`. No workflow, API, schema, permission, credentials or deployed setting changes.

## Design decisions

- Release config is strict JSON `{enabled:false,webOrigin:"https://retrodesk-staging.pages.dev",apiOrigin:"https://retrodesk-api-staging.beibeiz.workers.dev"}`. Enabled must be boolean and targets must equal the reviewed allowlist. File override is an explicit local/release input; missing/invalid files fail builds.
- Only `command=build`, `mode=staging`, enabled release config and an exact matching build API origin can emit enabled release metadata. An ordinary writer env flag never enables a production/staging release by itself.
- Runtime additionally requires production staging mode, the emitted release metadata, and exact current Web/API origins. Development's existing opt-in remains independent. Preview deployment URLs, localhost, production origins, missing location and spoofed origins fail closed.
- Existing `ImageWriteProvider` still requires current site/API advertisement and no 426 pause; server raw stored/incoming guards and CAS remain unchanged. The marker is not authorization.
- Config stays false in the committed PR. Parent later supplied trusted user approval at 18:06:08 UTC for staging-only basic availability after compatibility/privacy acceptance. Those live gates remain pending; this preparation task performs no merge, flag activation or deployment.

## Tasks

- [x] Add strict build resolver and disabled release config; unit-check malformed config, exact targets, normal production exclusion and enabled staging API matching.
- [x] Define build metadata in Vite, emit artifact receipt and add explicit `build:staging` command. Default build stays production/off.
- [x] Extend the Image creation gate with a small pure origin predicate and build constant. Verify local opt-in, production off, allowed staging and forbidden origins. Keep all compatibility/permission gates unchanged.
- [x] Add in-memory Vite build tests of the actual gate module for production ordinary flag, production enabled config, staging disabled config, staging approved config, wrong API/config failures. No network or deployed origins are contacted.
- [x] Verify artifact receipts locally before existing staging/production package deploy commands; production rejects staging mode/enabled artifacts. No deployment workflow changes.
- [x] Run focused build/gate/context/old-client tests plus one full production build and one default-off staging build; inspect emitted receipts. Review independently and fix bounded findings.
- [x] Write exact approved disposable-site/session canaries, 403 stop and future activation procedure; open dependent Draft PR, monitor exact-head routine CI, keep #128 frozen.

## Self-review

The allowlist is source-controlled and not derived from a hostname substring or arbitrary environment URL. Enabled test configurations are temporary and never deployed. A future activation requires a separate approved release configuration; passing local tests does not grant authority or establish deployed compatibility/native acceptance. Full #51 presets/actions/animation remain out of scope.
