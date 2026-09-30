-- The machines API uses the signed-in Supabase role and row-level security.
-- Explicit grants keep this working on projects with tightened defaults while
-- preventing anonymous API clients from reading stored device credentials.

revoke all on table public.machines from anon;
grant select, insert, update, delete on table public.machines to authenticated;
