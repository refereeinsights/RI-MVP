# Supabase Migrations Guide (TournamentInsights / RefereeInsights)

This repo uses Supabase Postgres + the Supabase Data API (PostgREST / GraphQL / `supabase-js`). Supabase is tightening defaults:

- **May 30, 2026**: new projects will **not** expose `public.*` tables to the Data API by default.
- **October 30, 2026**: enforced for **existing projects**.

Implication: **any new table created in `public` should include explicit GRANTs** (or intentionally grant nothing), and should be protected with RLS as appropriate.

## 1) Default rule: explicit grants + RLS

For any new `CREATE TABLE public.*` migration, include (in the same migration):

1) **Explicit GRANT statements** for the roles you intend to access the table via the Data API:
- `anon`
- `authenticated`
- `service_role`

2) **Enable RLS**:

```sql
alter table public.your_table enable row level security;
```

3) **Add explicit policies** for any role that should read/write:

```sql
create policy "users can read their own rows"
  on public.your_table
  for select to authenticated
  using (auth.uid() = user_id);
```

Never rely on implicit defaults for table exposure. If a grant is missing, the Data API will return a `42501` with a suggested `GRANT` to fix it.

## 2) Decide table intent up front

### A) App-facing / client-accessible tables

If a table is meant to be read/written by logged-in users or publicly readable:

- Grant only the minimum privileges needed.
- Use RLS to enforce row-level access.
- Prefer writing *safe* public views for read-heavy public pages.

Example (adjust to your needs):

```sql
grant select on public.your_table to anon;
grant select, insert, update, delete on public.your_table to authenticated;
grant select, insert, update, delete on public.your_table to service_role;

alter table public.your_table enable row level security;
```

### B) Admin/internal workflow tables (queues, audit logs, enrichment runs)

If a table is intended for admin tooling and service-role usage only:

- **Do not grant** to `anon` or `authenticated` unless there is a clear, reviewed need.
- Keep access behind server-side endpoints using service role / admin auth.
- Consider moving to a non-exposed schema (e.g. `private`) in a future cleanup if practical.

Example (admin-only table):

```sql
-- Intentionally no grants to anon/authenticated.
grant select, insert, update, delete on public.your_admin_table to service_role;

alter table public.your_admin_table enable row level security;
-- Optional: policies only if you ever allow authenticated access later.
```

## 3) Views and SECURITY DEFINER

Avoid `SECURITY DEFINER` views unless you have a specific and reviewed reason.

If you do use them:
- Ensure the view is not selectable by `anon`/`authenticated` unless the data is safe.
- Prefer service-role-only access or move the view to a non-exposed schema.

## 4) Migration checklist (copy/paste)

Before merging a migration that creates/modifies `public.*` tables:

- [ ] Any new `public.*` table includes explicit `GRANT` statements (or an explicit admin-only “no anon/auth” stance).
- [ ] RLS is enabled for the table.
- [ ] Policies exist for any role that should access rows.
- [ ] Sensitive/admin tables are not exposed to `anon`/`authenticated`.
- [ ] Any `SECURITY DEFINER` view is justified and not externally selectable.

## 5) Known high-risk categories (treat as admin/internal by default)

The following kinds of tables are typically admin/internal and should not be externally exposed without careful review:
- `*_audit_log`
- `*_review_queue`, `*_queue`
- enrichment/discovery/import runs + run rows
- outreach/suppression templates and logs
- internal metrics tables (`*_metrics`, `*_events`)

