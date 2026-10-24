# Issue #76: database write boundary proposal

**Requires owner approval before applying security settings.** This is a code-only
proposal based on main `539ca50fb80fa9b5b8a43e25857910a5d97f5698`. No remote
database has been changed by this work. Merging this PR does not apply its SQL.

## Specific approval and consequence

Approve applying **only `0010_worker_write_boundary.sql`** to the explicitly
identified staging Supabase project, after a recoverable database backup and a
metadata receipt; then run the bounded staging acceptance below. Production
application is a separate approval for its specific project after staging passes.

The action revokes PUBLIC/anon/authenticated table and column privileges on
`sites`, `site_versions` and `site_assets`, grants authenticated SELECT back, removes
six legacy client-write RLS policies, preserves the existing read policies, and
reasserts service-only publication/asset-migration RPC execution. It explicitly
grants the current Worker's required operations. No table, column, row, document,
version, object key, RPC body, credential or role attribute is rewritten.

**Consequence:** even a site's owner can no longer write those tables directly
through the Supabase Data API/SDK, including draft writes. Owners and editors keep
their intended draft/asset edits through the Worker. Undocumented clients that
write directly must switch to the existing Worker endpoints. Keep the Data API
enabled: the Worker uses it with a service-role key. Do not put that key in a
browser or expand any login/token permissions to apply this proposal.

## Why this boundary

The previous bounded live review found authenticated UPDATE of publication fields
and INSERT of versions/assets still granted. That is a prior metadata observation,
not proof of the current live state. Re-run the receipt on the chosen project.

Source migrations 0001–0009 allow owner-scoped direct writes but do not apply the
Worker's document validation, public projection, storage staging, quota/type
checks or CAS publication protocol. The local suite applies these actual SQL
files unchanged and demonstrates owner snapshot/artifact-key/version/asset
forgery using synthetic rows. It never accesses live content or real accounts.

The current client and original security baseline both use the same Worker API
for mutations. Evidence paths:

| Layer | Existing contract retained |
| --- | --- |
| `apps/web/src/lib/api.ts` | `saveDraft`, `publish`, retry, import and upload/delete all call Worker HTTP endpoints with the Auth session token. |
| `apps/web/src/lib/supabase.ts` | Browser Supabase client manages Auth; no direct `.from()`/`.rpc()` writes exist in web source. |
| `apps/api/src/lib/supabase.ts` | Auth client verifies the user; a separate service client performs database operations. |
| `apps/api/src/lib/access.ts` | Owner: read/write/assets/publish/member management. Editor: read/write/assets. Viewer: read. |
| `apps/api/src/routes/sites.ts` | Validated draft save uses `draft_version` CAS; owner-only publish/retry uses the existing atomic RPC and projection/storage flow. |
| `apps/api/src/routes/{assets,transfer,collaboration,guestbook}.ts` | Upload inventory, migration, import and collaboration continue through validated Worker paths. |

No API or web runtime changes are part of this proposal. Appearance/P2 client
compatibility is a separate change; SQL does not parse or rewrite its fields.
Existing v1/v2 documents, publication payloads, draft/version counters, public
URLs and read endpoints stay intact. Supported old clients using those Worker
endpoints retain their transport contract; arbitrary direct-SDK clients do not.

## Minimum permissions and role behavior

| Principal/path | Sites | Versions | Assets | Trusted mutation RPCs |
| --- | --- | --- | --- | --- |
| anon / PUBLIC | None | None | None | No execution |
| authenticated owner, direct Data API | SELECT own sites | SELECT own versions | SELECT own assets | No execution |
| authenticated editor/viewer, direct Data API | SELECT shared sites | No added access | SELECT shared assets | No execution |
| unrelated authenticated user | No rows for the other site | No rows | No rows | No execution |
| Worker service role | SELECT/INSERT/UPDATE required | SELECT/INSERT required | SELECT/INSERT/UPDATE/DELETE required | Existing restricted RPC execution |

The migration does not revoke pre-existing service privileges beyond that minimum.
The existing service role must already have BYPASSRLS; it does not receive new role
attributes. RPCs taking an owner/actor ID trust the Worker to authenticate and
authorize that actor; clients cannot execute them. Collaboration and guestbook
mutation RPC definitions/ACLs stay as in 0006/0008/0009 and are regression checked.
Read-only `is_site_owner`/`can_read_site` helpers and membership policies remain.

Owner/editor/viewer are **application roles**, all mapped to PostgreSQL
`authenticated`; SQL does not grant an editor or owner a new direct write path.
After session verification the Worker enforces that owner/editor may save drafts
and write assets, only owner may publish/retry/manage members, and viewer only
reads. A service key compromise is outside the protection of client ACL/RLS.

Table REVOKE alone leaves independent column grants, so 0010 revokes those too.
Removing the obsolete write policies supplies a second barrier if someone later
mistakenly re-grants DML. The transaction aborts on disabled RLS, unknown write
policies, inherited write/RPC grants, inherited anonymous reads or missing existing
service BYPASSRLS; it does not fix drift by modifying other roles or unknown
policies. Investigate such an abort separately. Future migrations must keep this
contract; 0010 does not globally change default privileges.

## Local verification

The test package is isolated from application dependency manifests/lockfiles.
It pins PGlite 0.5.10, including real `citext` and `pgcrypto`, and creates an
in-memory PostgreSQL database. Only the Auth schema/roles/UID lookup are minimal
fixtures. All application migrations run unchanged. No database URL, real token,
local daemon or network connection is used by the tests.

```sh
npm ci --prefix tests/security/db-write-boundary --ignore-scripts --no-audit --no-fund
node --test tests/security/db-write-boundary/regression.test.mjs
```

To reproduce the old-schema failures locally (expected nonzero exit):

```sh
RETRO_DB_TEST_LEGACY=1 node --test tests/security/db-write-boundary/regression.test.mjs
```

Coverage includes every current core column's INSERT/UPDATE ACL, actual owner
forgery attempts, create/upsert/delete, all four authenticated identities and
anonymous, existing read isolation, restricted RPCs, service draft CAS and stale
conflicts, import/create, asset mutations, publication history/status updates,
actual private-asset migration RPC, row preservation, repeat application, PUBLIC
and column ACL drift, and atomic abort on unexpected deployment metadata.
RLS is also exercised independently after a deliberate **local-only** DML grant.

Recorded results for this proposal:

- Local SQL suite: **33 scenarios PASS**, no skip (Node includes the outer test
  and reports 34 passed). Seven atomic-abort scenarios cover unexpected write
  policy, disabled RLS, inherited table/column/RPC grants, inherited anonymous
  reads and missing existing service BYPASSRLS. Read-back SQL is executed too.
- Same security assertions against 0001–0009: **10 expected failing scenarios**,
  including all four concrete owner forgery attempts. The legacy mode is
  deliberately RED; the fixed suite above is GREEN.
- Existing API suite at the unchanged runtime: **29 files / 185 tests PASS**.
  API TypeScript typecheck, secret audit and `git diff --check`: PASS.
- Not run: full browser/contributor gate, real Supabase/PostgREST/JWT acceptance,
  remote migration/read-back, staging/production mutations or deployment.

This is PostgreSQL-WASM coverage, not a Supabase/PostgREST/JWT or deployed Worker
integration test. Auth claim mapping, HTTP errors, service-key routing, live grants
and real storage are not certified by local success. Existing focused API tests
use mocked database clients and supplement this suite; they do not prove RLS.

## Owner application and read-back

1. Confirm the exact project and database identity using the established owner
   session. Record the deployed Web SHA and Worker version, reviewed PR commit and
   SHA-256 of 0010. Verify 0001–0009 are present. Do not run a broad `db push` that
   could apply other authors' pending migrations.
2. Take a recoverable database backup/snapshot and a schema/ACL/policy backup
   through the existing secure operator process. Store them privately outside git;
   do not paste rows, credentials or connection strings into review output.
3. Run [the metadata-only read-back](db-write-boundary-76-readback.sql) on that
   project and save the receipt. Review custom policies or role memberships before
   proceeding. It reads catalogs and effective privileges, never customer rows.
4. **Only after the specific approval above**, execute this single reviewed SQL
   file in the established owner SQL session. For an already configured libpq
   service (the example service name must match the owner's verified target):

   ```sh
   psql 'service=retro_staging_owner' -X --set ON_ERROR_STOP=1 \
     --file supabase/migrations/0010_worker_write_boundary.sql
   psql 'service=retro_staging_owner' -X --set ON_ERROR_STOP=1 \
     --file docs/security/db-write-boundary-76-readback.sql
   ```

   This branch does not configure that service or create any credential. 0010 is
   transactional with 5s lock / 30s statement limits. On an error, ensure the owner
   session issues `ROLLBACK`; investigate and roll forward with reviewed SQL.
   Record application in the project's existing migration/deployment ledger.
5. Require both client grant arrays in the receipt to be empty, authenticated
   SELECT true, anonymous SELECT false, all three RLS flags true, policy commands
   only `r`, and existing service BYPASSRLS true. Require nine listed mutation RPC
   signatures, each anon/authenticated execute false and service execute true.
   Required service operations must match the table above. More existing service
   permissions are reported but not treated as client access.
6. With separately authorized disposable staging accounts/site/assets only,
   verify owner draft save→read-back→publish/retry, editor save/upload but denied
   publish/member management, viewer reads but denied save/upload/publish, unrelated
   user no access, anonymous no draft access, and public publication unchanged.
   Using those same synthetic JWT identities, direct core-table writes (including
   owner publication/asset/version writes and upsert) and trusted RPC calls must
   fail with permission errors, while existing authorized reads still work. Record
   actual outcomes against this deployment; do not claim source tests prove them.
7. Stop if the request is blocked by Cloudflare or another access control. Do not
   alter headers/proxies/security settings to obtain acceptance. Do not expand
   testing to real users or production data.
8. After reviewed staging receipts and acceptance, obtain separate approval to
   apply the same reviewed file to the identified production database with its own
   backup/receipts. This proposal alone does not approve that action or deployment.

## Recovery without reopening direct writes

If application aborts before COMMIT, PostgreSQL rolls the entire change back;
the prior vulnerable grants remain, so the security blocker remains too. Do not
treat an aborted transaction as successful hardening.

After a successful COMMIT, keep 0010 in place during an API/Web rollback. Supported
Worker-mediated clients remain compatible. If a required operation fails, pause
the affected flow, retain the backup and metadata receipts, diagnose the missing
service permission or runtime mismatch, and propose a narrow roll-forward fix.
Do not restore authenticated DML, restore the six legacy write policies, rerun
0001 over the hardened database, disable RLS/Data API, or broaden service keys.
Do not auto-restore an older full database backup over newer customer writes.
Disaster recovery from a private backup needs its own reviewed data-loss plan
and must reapply equivalent protections before traffic resumes.

## References

- [PostgreSQL REVOKE](https://www.postgresql.org/docs/current/sql-revoke.html):
  column grants must be handled independently from table grants.
- [PGlite extensions](https://pglite.dev/extensions/): local PostgreSQL-WASM
  `citext`/`pgcrypto` test runtime.
- [Design and implementation checklist](db-write-boundary-76-plan.md).
