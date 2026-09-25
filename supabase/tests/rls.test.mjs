import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(new URL("../migrations/20260925000000_init.sql", import.meta.url), "utf8");
const db = new PGlite({ extensions: { vector, pg_trgm } });

// Minimal stand-ins for the Supabase-managed schemas the migration references.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint);
  create table storage.objects (id uuid default gen_random_uuid() primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
`);
await db.exec(migration);
await db.exec(`
  grant usage on schema public, extensions, storage, auth to authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
  grant execute on function auth.uid() to authenticated;
`);

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}', 'shahar@example.com', '{"display_name":"שחר"}'), ('${B}', 'other@example.com', '{}')`);

async function as(user, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
let passed = 0;
const ok = (name) => { passed++; console.log("  ✓", name); };

// profile trigger
const profiles = await q("select id, display_name from public.profiles order by id");
assert.equal(profiles.length, 2); assert.equal(profiles[0].display_name, "שחר"); ok("profile auto-created with display name");

const emb = "[" + Array.from({ length: 1536 }, (_, i) => (i === 0 ? 1 : 0)).join(",") + "]";
const docId = await as(A, async () => {
  await q("insert into tasks (title, due_date, status) values ('לשלוח הסכם', current_date, 'today')");
  await q("insert into waiting_for (person, subject, expected_response_date) values ('דני', 'ההסכם', current_date - 1)");
  await q("insert into memories (category, content, source) values ('preference', 'מעדיף פגישות בבוקר', 'user_explicit')");
  await q("insert into activity_log (actor, action, summary) values ('assistant', 'task.created', 'נוצרה משימה')");
  const [d] = await q(`insert into documents (title, file_name, mime_type, storage_path) values ('הסכם עם X', 'x.pdf', 'application/pdf', '${A}/x.pdf') returning id`);
  await q(`insert into document_chunks (document_id, user_id, chunk_index, content, heading, embedding) values ($1, $2, 0, 'תקופת ההתקשרות היא 12 חודשים', 'סעיף 7 – תקופת ההתקשרות', $3)`, [d.id, A, emb]);
  await q(`insert into storage.objects (bucket_id, name) values ('documents', '${A}/x.pdf')`);
  return d.id;
});
ok("owner can write all entity types");

await as(A, async () => {
  const r = await q("select * from match_document_chunks($1::extensions.vector, 'תקופת ההתקשרות', 5, null)", [emb]);
  assert.equal(r.length, 1); assert.equal(r[0].heading, "סעיף 7 – תקופת ההתקשרות");
  const kw = await q("select * from match_document_chunks(null, 'ההתקשרות', 5, null)");
  assert.equal(kw.length, 1);
});
ok("hybrid retrieval returns owner's chunks (vector + keyword-only)");

await as(B, async () => {
  for (const t of ["tasks", "waiting_for", "memories", "activity_log", "documents", "document_chunks", "profiles"]) {
    const rows = await q(`select * from ${t}`);
    assert.equal(rows.length, t === "profiles" ? 1 : 0, `B sees ${t}`);
  }
  assert.equal((await q("select * from match_document_chunks($1::extensions.vector, 'ההתקשרות', 5, null)", [emb])).length, 0);
  assert.equal((await q("select * from storage.objects")).length, 0);
});
ok("other user sees nothing (tables, RPC, storage)");

await as(B, async () => {
  await assert.rejects(q(`insert into tasks (user_id, title) values ('${A}', 'spoof')`));
  await assert.rejects(q(`insert into document_chunks (document_id, user_id, chunk_index, content) values ('${docId}', '${B}', 1, 'x')`));
  await assert.rejects(q(`insert into storage.objects (bucket_id, name) values ('documents', '${A}/evil.pdf')`));
  const upd = await db.query("update tasks set title = 'hacked'");
  assert.equal(upd.affectedRows ?? 0, 0);
});
ok("cross-user writes are rejected");

await as(A, async () => {
  const r = await db.query("update activity_log set summary = 'tampered'");
  assert.equal(r.affectedRows ?? 0, 0);
  assert.equal((await q("select summary from activity_log"))[0].summary, "נוצרה משימה");
});
ok("activity log is append-only for the owner");

await as(A, async () => {
  await assert.rejects(q("insert into ai_usage (user_id, requests) values ($1, 0)", [A]));
  await assert.rejects(q("select bump_ai_usage($1, 0, 0, 10, 1)", [A]));
});
ok("clients can't write usage or call the metering function");

await q("select bump_ai_usage($1, 0, 0, 2, 1)", [A]);
await q("select bump_ai_usage($1, 100, 50, 2, 0)", [A]);
await q("select bump_ai_usage($1, 0, 0, 2, 1)", [A]);
await assert.rejects(q("select bump_ai_usage($1, 0, 0, 2, 1)", [A]), /limit/);
const [u] = await q("select requests, input_tokens from ai_usage where user_id = $1", [A]);
assert.equal(u.input_tokens, 100);
ok("daily AI limit enforced; token records don't count as requests");

await as(A, async () => {
  await assert.rejects(q("insert into tasks (title, status) values ('x', 'bogus')"));
  await assert.rejects(q("insert into tasks (title) values ('')"));
});
ok("check constraints validate status and title");

await q(`delete from auth.users where id = '${A}'`);
for (const t of ["tasks", "waiting_for", "memories", "activity_log", "documents", "document_chunks", "profiles"]) {
  const [{ n }] = await q(`select count(*)::int n from ${t} where ${t === "profiles" ? "id" : "user_id"} = '${A}'`);
  assert.equal(n, 0, t);
}
ok("deleting the auth user cascades to all personal data");

console.log(`\n${passed} database checks passed`);
