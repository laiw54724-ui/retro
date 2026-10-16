# Public guestbook implementation plan

## Goal

Deliver Issue #25B as an explicitly enabled, moderated guestbook that is separate from site documents and OC comments. Anonymous visitors can submit plain text; only approved entries are public; only the site owner can moderate.

## Data and security boundary

- Add a `guestbook` window with bounded author configuration (`enabled`, intro text).
- Store entries and reports in dedicated Supabase tables, never inside draft or published JSON.
- Keep tables inaccessible to anonymous/authenticated clients; the Worker service role is the only data path.
- Validate the published document server-side before accepting a submission. A hidden form is not the security boundary.
- Store a keyed, irreversible abuse digest rather than a raw IP address. Use an idempotency UUID and an atomic Postgres function to reject duplicates and bursts.
- Public reads select only `approved` rows. Pending/rejected rows are unavailable through public list, direct-id, export, or page metadata paths.
- Owner endpoints require the existing owner-only `manage_members` permission. Collaborating editors/viewers cannot moderate.

## API

- `GET /public/sites/:username/guestbook`: approved entries only; no-store.
- `POST /public/sites/:username/guestbook`: bounded nickname/body/requestId; returns `pending`; disabled and rate-limit failures are explicit.
- `POST /public/sites/:username/guestbook/:entryId/reports`: report an approved entry with duplicate/rate protection.
- `GET /sites/:siteId/guestbook`: owner moderation queue.
- `PUT /sites/:siteId/guestbook/:entryId`: approve/reject.
- `DELETE /sites/:siteId/guestbook/:entryId`: delete.
- `POST /sites/:siteId/guestbook/:entryId/reports/resolve`: mark reports handled.

## UI

- Visitor view explains anonymous identity and moderation, preserves input after failures, and reports success as “sent for review”, never “published”.
- Owner inline editor enables/disables submissions and exposes the moderation queue with approve/reject/delete/report-resolution controls.
- All authored and visitor text renders as text nodes. No HTML or attachments.

## Verification

- Migration assertions for grants, RLS, status checks, idempotency and atomic frequency limits.
- Focused API tests for disabled submission, approved-only reads, replay/rate mapping and cross-site/role denial.
- Focused module tests/E2E for safe text rendering, retained retry input, pending confirmation, owner moderation and mobile layout.
- Defer the repository-wide suite and review until the final pre-deploy gate, per the requested batch workflow.
