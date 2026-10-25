# Issue #76: Worker-mediated database writes

Base: `539ca50fb80fa9b5b8a43e25857910a5d97f5698` (`main`).

**Requires owner approval before applying security settings.** This branch is a
code-only proposal. No remote migration, grants, policies or credentials are
changed by preparing or running its local tests.

## Design and assumption

The supported browser uses Supabase Auth and the Worker API for all site, draft,
publication, import and asset mutations (`apps/web/src/lib/api.ts`). The Worker
verifies the session, checks owner/editor/viewer access, validates documents and
uses a separate service-role client (`apps/api/src/lib/{supabase,access}.ts`).
Preserve this architecture, including existing clients using those endpoints.
Undocumented clients that write directly to PostgREST will lose that capability;
they must use the Worker. This assumption needs owner review before application.

Column-only draft grants were considered, but would retain an unvalidated path
around draft scope/version checks and require separate create/upsert rules.
Adding authenticated write RPCs would introduce another authorization contract.
The bounded proposal instead makes `sites`, `site_versions` and `site_assets`
read-only to authenticated clients and inaccessible to anonymous clients. Keep
existing SELECT RLS predicates and read-only helper RPCs. Remove the six obsolete
client write policies as defense in depth, revoke both table and residual column
privileges, and reassert service-only publication/asset-migration RPC execution.
Grant only the table operations the current Worker requires, without revoking
unrelated existing service permissions. No data shape, publication format,
function body, appearance schema or runtime API changes are required.

Owner and editor draft/asset edits remain Worker operations; only owners publish,
retry publication or manage members. Viewers only read. Unrelated users cannot
read private rows. Existing direct SELECT visibility is retained: owners read
versions; owners/editors/viewers read shared sites/assets. The service key remains
trusted infrastructure: SQL receives the owner ID already checked by the Worker.

## Implementation plan

- [x] Add `tests/security/db-write-boundary/` as an isolated, pinned local
  PostgreSQL-WASM test package. Bootstrap only fake Supabase roles, `auth.users`
  and `auth.uid()`; execute actual migrations 0001–0009 unchanged.
- [x] Demonstrate that the post-migration security assertions fail on the legacy
  source schema, using only synthetic rows in an in-memory database.
- [x] Add `supabase/migrations/0010_worker_write_boundary.sql`: transactional
  table/column ACL changes, six write-policy removals, required Worker grants,
  and service-only publication/asset-migration RPC ACLs. Do not alter rows.
- [x] Test owner/editor/viewer/unrelated/anonymous direct writes, every protected
  column, insert/upsert/delete, table and column drift, read isolation, RPC ACLs,
  CAS publication, private asset migration and Worker-style service mutations.
  Reapply 0010 to prove safe repeatability. Separately test RLS after a deliberate
  local-only table grant so ACL failure does not mask policy regressions.
- [x] Add a metadata-only read-back SQL receipt and deployment guide naming the
  exact owner-approved action, staging-first acceptance, backups and safe roll
  forward. Local success must never be presented as live enforcement.
- [x] Run this isolated database suite, relevant existing API tests, typecheck,
  secret audit and diff checks. Review and open a Draft PR to `main` with Refs #76.
  Do not run the full browser gate, apply remotely, merge, deploy or close #76.

## Verification limits

The disposable runtime exercises real PostgreSQL SQL/ACL/RLS semantics, with an
explicit minimal Auth fixture. It does not validate deployed grants, PostgREST
schema cache, real JWT role mapping, R2 or Worker secrets. Those require separate
owner-approved staging read-back and synthetic account acceptance.

Delivered as Draft PR [#96](https://github.com/laiw54724-ui/retro/pull/96).
The remote application/acceptance steps remain unperformed and require owner approval.
