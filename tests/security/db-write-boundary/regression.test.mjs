import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const migrations = new URL("../../../supabase/migrations/", import.meta.url);
const migrationName = "0010_worker_write_boundary.sql";
const legacy = process.env.RETRO_DB_TEST_LEGACY === "1";
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const editor = "33333333-3333-4333-8333-333333333333";
const viewer = "44444444-4444-4444-8444-444444444444";
const site = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherSite = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const asset = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const forgedAsset = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const tables = ["sites", "site_versions", "site_assets"];
const actors = [["owner", owner], ["editor", editor], ["viewer", viewer], ["unrelated", stranger]];
const rpcSignatures = [
  "publish_site_atomic(uuid,uuid,integer,integer,jsonb)",
  "migrate_site_assets_private(uuid,uuid,integer,jsonb,jsonb)",
  "create_site_invite(uuid,uuid,citext,text,text,timestamp with time zone)",
  "revoke_site_invite(uuid,uuid,uuid)",
  "accept_site_invite(text,uuid,citext)",
  "update_site_member_role(uuid,uuid,uuid,text)",
  "remove_site_member(uuid,uuid,uuid)",
  "submit_guestbook_entry(uuid,text,text,uuid,text)",
  "report_guestbook_entry(uuid,uuid,uuid,text,text)"
];

test("Worker database write boundary (disposable PostgreSQL-WASM, no network)", { timeout: 60000 }, async (t) => {
  const db = new PGlite({ extensions: { citext, pgcrypto } });
  // No URL, filesystem data directory, real Auth session or remote client exists.
  try {
    await db.exec(await readFile(new URL("bootstrap.sql", import.meta.url), "utf8"));
    const files = (await readdir(migrations)).filter((name) => /^\d+.*\.sql$/.test(name) && name < migrationName).sort();
    assert.equal(files.length, 9, "Review this fixture when the migration baseline changes");
    for (const name of files) await db.exec(await readFile(new URL(name, migrations), "utf8"));
    await db.exec(`
      insert into sites (id,owner_id,username,site_name,draft_document) values
        ('${site}','${owner}','fixture-a','Private A','{"siteName":"Private A"}'),
        ('${otherSite}','${stranger}','fixture-b','Private B','{"siteName":"Private B"}');
      insert into site_memberships (site_id,user_id,email,role,created_by) values
        ('${site}','${editor}','editor@example.invalid','editor','${owner}'),
        ('${site}','${viewer}','viewer@example.invalid','viewer','${owner}');
      insert into site_assets (id,site_id,owner_id,object_key,mime_type,size_bytes,public_url) values
        ('${asset}','${site}','${owner}','users/${owner}/sites/${site}/${asset}.png','image/png',4,'https://assets.example.invalid/legacy.png');
      insert into site_versions (site_id,version,document,created_by) values
        ('${site}',1,'{"siteName":"Published A"}','${owner}');
      update sites set published_document='{"siteName":"Published A"}', published_version=1,
        published_at='2026-10-19T00:00:00Z', published_artifact_status='synced' where id='${site}';
    `);
    const before = await snapshot();
    if (!legacy) await applyBoundary();

    async function applyBoundary() {
      await db.exec(await readFile(new URL(migrationName, migrations), "utf8"));
    }
    async function snapshot() {
      return (await db.query(`select jsonb_build_object(
        'sites',(select jsonb_agg(to_jsonb(s) order by id) from sites s),
        'versions',(select jsonb_agg(to_jsonb(v) order by id) from site_versions v),
        'assets',(select jsonb_agg(to_jsonb(a) order by id) from site_assets a)) as rows`)).rows[0].rows;
    }
    async function asRole(role, userId, fn) {
      assert.ok(["authenticated", "anon", "service_role"].includes(role));
      await db.exec("begin");
      try {
        await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
        await db.exec(`set local role ${role}`);
        return await fn();
      } finally {
        await db.exec("rollback");
      }
    }
    async function denied(sql, params = []) {
      await db.exec("savepoint denied_attempt");
      let caught;
      try { await db.query(sql, params); } catch (error) { caught = error; }
      finally { await db.exec("rollback to savepoint denied_attempt; release savepoint denied_attempt"); }
      assert.equal(caught?.code, "42501", `Expected insufficient_privilege: ${sql}; got ${caught?.code ?? "success"}`);
    }
    async function assertRpcAcl(role, expected) {
      for (const signature of rpcSignatures) {
        const result = await db.query("select has_function_privilege($1, $2, 'execute') as allowed", [role, `public.${signature}`]);
        assert.equal(result.rows[0].allowed, expected, `${role}: ${signature}`);
      }
    }

    await t.test("migration preserves every existing row byte-for-byte as JSON", async () => {
      assert.deepEqual(await snapshot(), before);
    });
    await t.test("client table and column write privileges are absent; service operations survive", async () => {
      for (const table of tables) {
        for (const role of ["authenticated", "anon"]) {
          for (const privilege of ["insert", "update", "delete", "truncate", "references", "trigger"]) {
            const result = await db.query("select has_table_privilege($1,$2,$3) as allowed", [role, `public.${table}`, privilege]);
            assert.equal(result.rows[0].allowed, false, `${role}/${table}/${privilege}`);
          }
          for (const privilege of ["insert", "update", "references"]) {
            const result = await db.query("select has_any_column_privilege($1,$2,$3) as allowed", [role, `public.${table}`, privilege]);
            assert.equal(result.rows[0].allowed, false, `${role}/${table}/column ${privilege}`);
          }
        }
      }
      for (const [table, privileges] of [["sites", ["select", "insert", "update"]], ["site_versions", ["select", "insert"]], ["site_assets", ["select", "insert", "update", "delete"]]]) {
        for (const privilege of privileges) {
          assert.equal((await db.query("select has_table_privilege('service_role',$1,$2) as allowed", [`public.${table}`, privilege])).rows[0].allowed, true);
        }
      }
    });

    for (const [label, sql, params] of [
      ["publication snapshot", "update sites set published_document=$1,published_version=99 where id=$2", [{ siteName: "Unpublished forgery" }, site]],
      ["artifact destination", "update sites set published_artifact_key='published/fixture-b/versions/1/site.json' where id=$1", [site]],
      ["history version", "insert into site_versions(site_id,version,document,created_by) values($1,99,'{}',$2)", [site, owner]],
      ["asset inventory", "insert into site_assets(id,site_id,owner_id,object_key,mime_type,size_bytes,public_url) values($1,$2,$3,'draft/foreign.png','image/png',0,'retro-asset:forged')", [forgedAsset, site, owner]]
    ]) {
      await t.test(`owner: concrete ${label} forgery is rejected`, async () => {
        await asRole("authenticated", owner, () => denied(sql, params));
      });
    }

    for (const [label, userId] of actors) {
      await t.test(`${label}: direct reads retain existing RLS visibility`, async () => {
        await asRole("authenticated", userId, async () => {
          const ids = (await db.query("select id from sites order by id")).rows.map((row) => row.id);
          assert.deepEqual(ids, [label === "unrelated" ? otherSite : site]);
          assert.equal((await db.query("select count(*)::int as n from site_assets")).rows[0].n, label === "unrelated" ? 0 : 1);
          assert.equal((await db.query("select count(*)::int as n from site_versions")).rows[0].n, label === "owner" ? 1 : 0);
        });
      });
      await t.test(`${label}: cannot forge publication, owner, username, draft, history or asset metadata directly`, async () => {
        await asRole("authenticated", userId, async () => {
          const columns = (await db.query("select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('sites','site_versions','site_assets')")).rows;
          assert.ok(columns.length > 30);
          for (const { table_name: table, column_name: column } of columns) {
            // Every column is checked, including future columns; zero-row INSERT still requires its ACL.
            await denied(`update public.${table} set ${column}=${column}`);
            await denied(`insert into public.${table} (${column}) select ${column} from public.${table} where false`);
          }
          await denied("update sites set published_document=$1,published_version=99,published_artifact_key='published/fixture-b/versions/1/site.json' where id=$2", [{ siteName: "Unpublished forgery" }, site]);
          await denied("insert into site_versions (site_id,version,document,created_by) values ($1,99,'{}',$2)", [site, owner]);
          await denied("insert into site_assets (id,site_id,owner_id,object_key,mime_type,size_bytes,public_url) values ($1,$2,$3,'draft/foreign.png','image/png',0,'retro-asset:forged')", [forgedAsset, site, owner]);
          await denied("insert into sites (id,owner_id,username,site_name,draft_document,published_document) values ($1,$2,'forged','forged','{}','{}')", ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", userId]);
          await denied("insert into sites (id,owner_id,username,site_name,draft_document) values ($1,$2,'fixture-a','forged','{}') on conflict (id) do update set published_document='{}'", [site, owner]);
          for (const table of tables) await denied(`delete from ${table}`);
        });
      });
      await t.test(`${label}: cannot call trusted mutation RPCs with a forged owner ID`, async () => {
        await assertRpcAcl("authenticated", false);
        await asRole("authenticated", userId, async () => {
          await denied("select * from publish_site_atomic($1,$2,1,1,'{}')", [site, owner]);
          await denied("select * from migrate_site_assets_private($1,$2,1,'{}','[]')", [site, owner]);
        });
      });
    }

    await t.test("anonymous: no core table reads/writes or trusted mutation RPCs", async () => {
      await assertRpcAcl("anon", false);
      await asRole("anon", null, async () => {
        for (const table of tables) {
          await denied(`select * from ${table}`);
          await denied(`update ${table} set id=id`);
          await denied(`delete from ${table}`);
          await denied(`insert into ${table} (id) select id from ${table} where false`);
        }
        await denied("select * from publish_site_atomic($1,$2,1,1,'{}')", [site, owner]);
        await denied("select * from migrate_site_assets_private($1,$2,1,'{}','[]')", [site, owner]);
      });
    });

    await t.test("Worker service: draft CAS, import/create, asset inventory and atomic publication/retry status remain usable", async () => {
      await assertRpcAcl("service_role", true);
      await asRole("service_role", null, async () => {
        const created = await db.query("insert into sites(owner_id,username,site_name,draft_document) values($1,'imported-fixture','Imported','{}') returning id", [owner]);
        assert.equal(created.rows.length, 1);
        const save = await db.query("update sites set draft_document=$1,site_name='Saved A',draft_version=2,updated_at=now() where id=$2 and draft_version=1 returning draft_version", [{ siteName: "Saved A" }, site]);
        assert.equal(save.rows[0].draft_version, 2);
        assert.equal((await db.query("update sites set draft_version=3 where id=$1 and draft_version=1 returning id", [site])).rows.length, 0);
        await db.query("insert into site_assets (id,site_id,owner_id,object_key,mime_type,size_bytes,public_url,storage_scope,kind) values($1,$2,$3,'draft/test.png','image/png',4,'retro-asset:test','draft_private','image')", [forgedAsset, site, owner]);
        assert.equal((await db.query("update site_assets set name='Renamed' where id=$1 returning id", [forgedAsset])).rows.length, 1);
        assert.equal((await db.query("delete from site_assets where id=$1 returning id", [forgedAsset])).rows.length, 1);
        const published = (await db.query("select * from publish_site_atomic($1,$2,2,1,$3)", [site, owner, { siteName: "Saved A" }])).rows[0];
        assert.equal(published.published_version, 2);
        assert.equal(published.artifact_key, "published/fixture-a/versions/2/site.json");
        assert.equal((await db.query("select count(*)::int as n from site_versions where site_id=$1", [site])).rows[0].n, 2);
        assert.equal((await db.query("update sites set published_artifact_status='failed',published_artifact_error='synthetic retry' where id=$1 and published_version=2 returning id", [site])).rows.length, 1);
        assert.equal((await db.query("update sites set published_artifact_status='synced',published_artifact_error=null where id=$1 and published_version=2 returning id", [site])).rows.length, 1);
        for (const [draftVersion, publicationVersion, code] of [[1, 2, "version_conflict"], [2, 1, "published_version_conflict"]]) {
          await db.exec("savepoint cas_conflict");
          await assert.rejects(db.query("select * from publish_site_atomic($1,$2,$3,$4,'{}')", [site, owner, draftVersion, publicationVersion]), (error) => error.code === "P0001" && error.message.includes(code));
          await db.exec("rollback to savepoint cas_conflict; release savepoint cas_conflict");
        }
      });
    });

    await t.test("Worker service: real private-asset migration RPC preserves ownership and advances draft version", async () => {
      const oldKey = `users/${owner}/sites/${site}/${asset}.png`;
      const newKey = `draft/users/${owner}/sites/${site}/${asset}.png`;
      await asRole("service_role", null, async () => {
        const updates = [{ id: asset, oldObjectKey: oldKey, oldPublicUrl: "https://assets.example.invalid/legacy.png", objectKey: newKey, publicUrl: `retro-asset:${asset}` }];
        const result = (await db.query("select * from migrate_site_assets_private($1,$2,1,$3,$4)", [site, owner, { siteName: "Private A", asset: `retro-asset:${asset}` }, updates])).rows[0];
        assert.equal(result.draft_version, 2);
        assert.equal(result.migrated_count, 1);
        const row = (await db.query("select owner_id,storage_scope,migration_status,object_key from site_assets where id=$1", [asset])).rows[0];
        assert.deepEqual(row, { owner_id: owner, storage_scope: "draft_private", migration_status: "pending", object_key: newKey });
      });
    });

    await t.test("remaining SELECT policies, with a local-only write grant, still reject owner/editor/viewer writes", async () => {
      await db.exec("begin");
      try {
        // Isolate RLS from ACL: this grant is rolled back in the in-memory fixture only.
        await db.exec("grant insert,update,delete on sites,site_versions,site_assets to authenticated");
        await db.exec("set local role authenticated");
        for (const [, userId] of actors) {
          await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId]);
          for (const table of tables) {
            assert.equal((await db.query(`update ${table} set id=id returning id`)).rows.length, 0);
            assert.equal((await db.query(`delete from ${table} returning id`)).rows.length, 0);
          }
          await denied("insert into sites(owner_id,username,site_name,draft_document) values($1,'rls-fixture','RLS','{}')", [userId]);
          await denied("insert into site_versions(site_id,version,document,created_by) values($1,99,'{}',$2)", [site, userId]);
          await denied("insert into site_assets(id,site_id,owner_id,object_key,mime_type,size_bytes,public_url) values($1,$2,$3,'draft/rls.png','image/png',0,'retro-asset:rls')", [forgedAsset, site, userId]);
        }
      } finally { await db.exec("rollback"); }
    });

    if (!legacy) {
      await t.test("reapplication clears PUBLIC/anon/authenticated column ACL drift and PUBLIC table/RPC grants", async () => {
        await db.exec(`
          grant update(published_document,published_artifact_key) on sites to authenticated,anon,public;
          grant insert(document) on site_versions to authenticated,anon,public;
          grant insert(object_key) on site_assets to authenticated,anon,public;
          grant select,insert,update,delete on sites,site_versions,site_assets to public;
          grant execute on function publish_site_atomic(uuid,uuid,integer,integer,jsonb) to public;
          grant execute on function migrate_site_assets_private(uuid,uuid,integer,jsonb,jsonb) to public;
        `);
        await applyBoundary();
        await asRole("authenticated", owner, async () => {
          await denied("update sites set published_document='{}' where id=$1", [site]);
          await denied("insert into site_versions(document) select '{}'::jsonb where false");
          await denied("insert into site_assets(object_key) select 'forged' where false");
        });
        await asRole("anon", null, async () => {
          for (const table of tables) await denied(`select * from ${table}`);
        });
        await assertRpcAcl("authenticated", false);
        await assertRpcAcl("anon", false);
        assert.deepEqual(await snapshot(), before);
      });
      await t.test("required service operations are explicitly granted without relying on platform defaults", async () => {
        await db.exec("revoke all on sites,site_versions,site_assets from service_role");
        await applyBoundary();
        await asRole("service_role", null, async () => {
          assert.equal((await db.query("update sites set draft_version=2 where id=$1 returning id", [site])).rows.length, 1);
          assert.equal((await db.query("select * from publish_site_atomic($1,$2,2,1,'{}')", [site, owner])).rows[0].published_version, 2);
          assert.equal((await db.query("delete from site_assets where id=$1 returning id", [asset])).rows.length, 1);
        });
      });
      for (const [label, setup, cleanup, expectedCode] of [
        ["unknown write policy", "create policy fixture_unexpected_write on sites for update using(true)", "drop policy fixture_unexpected_write on sites", "unexpected_write_policy"],
        ["disabled RLS", "alter table sites disable row level security", "alter table sites enable row level security", "rls_disabled"],
        ["inherited table write", "grant update on sites to fixture_inherited", "revoke update on sites from fixture_inherited", "inherited_table_grant"],
        ["inherited column write", "grant update(published_document) on sites to fixture_inherited", "revoke update(published_document) on sites from fixture_inherited", "inherited_column_grant"],
        ["inherited mutation RPC", "grant execute on function publish_site_atomic(uuid,uuid,integer,integer,jsonb) to fixture_inherited", "revoke execute on function publish_site_atomic(uuid,uuid,integer,integer,jsonb) from fixture_inherited", "inherited_rpc_grant"],
        ["inherited anonymous read", "grant fixture_inherited to anon; grant select(draft_document) on sites to fixture_inherited", "revoke select(draft_document) on sites from fixture_inherited; revoke fixture_inherited from anon", "inherited_anonymous_read"],
        ["service role without existing BYPASSRLS", "alter role service_role nobypassrls", "alter role service_role bypassrls", "service_requires_existing_bypassrls"]
      ]) {
        await t.test(`migration aborts atomically on ${label}; does not repair other roles/settings`, async () => {
          await db.exec("create role fixture_inherited; grant fixture_inherited to authenticated");
          try {
            await db.exec(setup);
            // A pre-existing ACL must survive the failed migration's rollback.
            await db.exec("grant update(published_artifact_error) on sites to authenticated");
            await assert.rejects(applyBoundary(), (error) => error.message.includes(`worker_write_boundary_${expectedCode}`));
            await db.exec("rollback");
            assert.equal((await db.query("select has_column_privilege('authenticated','sites','published_artifact_error','UPDATE') as allowed")).rows[0].allowed, true);
          } finally {
            await db.exec("rollback");
            await db.exec(cleanup);
            await db.exec("revoke fixture_inherited from authenticated; drop role fixture_inherited");
            await applyBoundary();
          }
        });
      }
      await t.test("release read-back SQL returns the expected metadata receipt without querying fixture rows", async () => {
        const sql = await readFile(new URL("../../../docs/security/db-write-boundary-76-readback.sql", import.meta.url), "utf8");
        const results = await db.exec(sql);
        const receipt = results.flatMap((result) => result.rows ?? []).find((row) => row.receipt)?.receipt;
        assert.ok(receipt);
        assert.equal(receipt.service_role_bypassrls, true);
        assert.deepEqual(receipt.client_write_grants, []);
        assert.deepEqual(receipt.client_column_write_grants, []);
        assert.equal(receipt.tables.length, 3);
        for (const row of receipt.tables) {
          assert.equal(row.rls_enabled, true);
          assert.equal(row.authenticated_select, true);
          assert.equal(row.anon_any_select, false);
          assert.deepEqual(row.policy_commands, ["r"]);
          assert.equal(row.service_select, true);
          assert.equal(row.service_insert, true);
        }
        assert.equal(receipt.mutation_rpcs.length, 9);
        for (const rpc of receipt.mutation_rpcs) {
          assert.equal(rpc.anon_execute, false);
          assert.equal(rpc.authenticated_execute, false);
          assert.equal(rpc.service_execute, true);
        }
      });
    }
    await t.test("all synthetic mutation attempts/Worker workflows leave the fixture intact after rollback", async () => {
      assert.deepEqual(await snapshot(), before);
    });
  } finally { await db.close(); }
});
