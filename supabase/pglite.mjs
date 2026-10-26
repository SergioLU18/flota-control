// Base en memoria (PGlite) que imita lo que trae Supabase (roles anon/authenticated, auth.users, auth.uid()
// y sus privilegios por defecto), con todas las migraciones aplicadas. La usan pruebas.mjs y historial/probar.mjs.
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

export async function baseDePrueba() {
  const db = new PGlite({ extensions: { btree_gist } })
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `)
  const migrations = (await readdir(here('./migrations'))).filter((f) => f.endsWith('.sql')).sort()
  for (const f of migrations) await db.exec(await readFile(here(`./migrations/${f}`), 'utf8'))
  return db
}
