-- TI Weekend Planner (Stage 3.5-1 follow-up): stabilize guest-link reveal token reconstruction.
-- `token_version_nonce` is a dedicated opaque signing component used for token reconstruction.
-- It intentionally replaces timestamp formatting as a cryptographic input so reveal/regenerate
-- remain stable across timestamptz serialization differences.

alter table public.planner_guest_shares
  add column if not exists token_version_nonce text;

update public.planner_guest_shares
set token_version_nonce = encode(gen_random_bytes(16), 'hex')
where token_version_nonce is null or length(trim(token_version_nonce)) = 0;

alter table public.planner_guest_shares
  alter column token_version_nonce set not null;

alter table public.planner_guest_shares
  add constraint planner_guest_shares_token_version_nonce_not_blank
  check (length(trim(token_version_nonce)) > 0);
