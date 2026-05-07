-- Perplexity cost rollup RPCs.
-- Reads token counts from discovery_batches.raw_paste (full Perplexity JSON response, stored on every call).
-- No schema changes required — raw_paste already contains usage.prompt_tokens / usage.completion_tokens.
-- Pricing: Sonar Pro $3/1M input tokens, $15/1M output tokens (as of 2026-05).
--
-- Quick-check:
--   select * from perplexity_usage_summary('2026-05-01', now());
--   select * from perplexity_usage_detail('2026-05-01', now()) order by called_at desc;

-- Summary: one aggregate row for the requested window.
create or replace function public.perplexity_usage_summary(from_ts timestamptz, to_ts timestamptz)
returns table(
  period_start      timestamptz,
  period_end        timestamptz,
  total_calls       bigint,
  total_input_tok   bigint,
  total_output_tok  bigint,
  total_cost_usd    numeric(10, 6)
)
language sql stable security definer
set search_path = public
as $$
  select
    from_ts                                                                                       as period_start,
    to_ts                                                                                         as period_end,
    count(*)                                                                                      as total_calls,
    sum(coalesce((raw_paste::jsonb -> 'usage' ->> 'prompt_tokens')::bigint,     0))              as total_input_tok,
    sum(coalesce((raw_paste::jsonb -> 'usage' ->> 'completion_tokens')::bigint, 0))              as total_output_tok,
    round(
        sum(coalesce((raw_paste::jsonb -> 'usage' ->> 'prompt_tokens')::numeric,     0)) / 1000000.0 * 3
      + sum(coalesce((raw_paste::jsonb -> 'usage' ->> 'completion_tokens')::numeric, 0)) / 1000000.0 * 15
    , 6)                                                                                          as total_cost_usd
  from public.discovery_batches
  where provider = 'perplexity'
    and created_at between from_ts and to_ts;
$$;

revoke execute on function public.perplexity_usage_summary(timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.perplexity_usage_summary(timestamptz, timestamptz) to service_role;

-- Detail: one row per call with per-call cost.
create or replace function public.perplexity_usage_detail(from_ts timestamptz, to_ts timestamptz)
returns table(
  batch_id      uuid,
  called_at     timestamptz,
  model         text,
  input_tokens  int,
  output_tokens int,
  cost_usd      numeric(10, 6)
)
language sql stable security definer
set search_path = public
as $$
  select
    id                                                                                    as batch_id,
    created_at                                                                            as called_at,
    model,
    coalesce((raw_paste::jsonb -> 'usage' ->> 'prompt_tokens')::int,     0)             as input_tokens,
    coalesce((raw_paste::jsonb -> 'usage' ->> 'completion_tokens')::int, 0)             as output_tokens,
    round(
        coalesce((raw_paste::jsonb -> 'usage' ->> 'prompt_tokens')::numeric,     0) / 1000000.0 * 3
      + coalesce((raw_paste::jsonb -> 'usage' ->> 'completion_tokens')::numeric, 0) / 1000000.0 * 15
    , 6)                                                                                  as cost_usd
  from public.discovery_batches
  where provider = 'perplexity'
    and created_at between from_ts and to_ts
  order by created_at desc;
$$;

revoke execute on function public.perplexity_usage_detail(timestamptz, timestamptz) from public, anon, authenticated;
grant  execute on function public.perplexity_usage_detail(timestamptz, timestamptz) to service_role;
