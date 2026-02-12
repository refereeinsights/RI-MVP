# Supabase Map

Last updated: 2026-02-12

## Scope
This document maps Supabase tables/views/functions to app features and API routes in `apps/referee`.
It complements `db-schema.md` by focusing on ownership and write paths.

## Security model summary
- Admin-only ops tables: most enrichment, source-ingestion, outreach, discovery, and moderation tables use RLS with `public.is_admin()` policies.
- Self-scoped tables: profile/referral/claim style records use user-bound policies (`auth.uid()` checks).
- Public-readable data is intentionally limited to curated views/functions and listing data.

## Core entities
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `profiles` | User profile + roles/admin flags | account pages, auth helpers, admin checks | account updates, admin role/verification updates |
| `tournaments` | Canonical tournament record | `/tournaments`, `/tournaments/[slug]`, hubs, admin dashboards | public submissions, admin edits, enrichment apply |
| `tournament_contacts` | Tournament contact info | tournament detail, admin | public submit assist, enrichment apply, admin edits |
| `venues` | Canonical venue records | admin venues, tournament venue joins | admin venue APIs, enrichment apply, OwlsEye runs |
| `tournament_venues` | Tournament-venue links | tournament detail, admin | enrichment apply, admin link updates |

## Enrichment and source ingestion
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `tournament_enrichment_jobs` | Queue + status for enrichment jobs | admin dashboard/enrichment page | queue/run endpoints + enrichment pipeline |
| `tournament_contact_candidates` | Contact candidates from crawls | admin enrichment screens | enrichment pipeline |
| `tournament_venue_candidates` | Venue candidates from crawls | admin enrichment screens | enrichment pipeline |
| `tournament_referee_comp_candidates` | Referee compensation candidates | admin enrichment + dashboard | enrichment pipeline |
| `tournament_date_candidates` | Date candidates | admin enrichment | enrichment pipeline |
| `tournament_attribute_candidates` | Director/hotel/referee-fields candidates | admin enrichment | enrichment pipeline |
| `tournament_sources` | Source URL registry + extracted metadata | admin source tools | URL queue/discovery/import flows |
| `tournament_source_logs` | Per-source run logs | source logs API, dashboard | admin source processors |
| `tournament_url_candidates` | Candidate official websites | URL apply APIs | URL search/apply routes |
| `tournament_url_suggestions` | Public/admin URL suggestions | enrichment page, suggestion queue | public suggestion endpoint + admin moderation |

## Discovery hygiene and dedupe
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `tournament_email_discovery_runs` | Run-level tracking for email discovery | admin dashboard | admin discovery runner |
| `tournament_email_discovery_results` | Discovered emails per tournament | admin dashboard/actions | admin discovery runner |
| `tournament_dead_domains` | Skiplist of dead domains (`ENOTFOUND` etc.) | discovery runner | discovery runner (upsert failures) |
| `tournament_duplicate_dismissals` | Dismissed duplicate candidates | admin duplicate tooling | admin duplicate actions |

## Outreach and verification
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `tournament_outreach` | Outreach drafts/sent tracking | `/admin/outreach` | outreach create/edit/send |
| `outreach_email_templates` | Reusable email templates | `/admin/outreach` | admin template CRUD |
| `tournament_staff_verify_tokens` | One-time verification tokens | outreach + verify pages | outreach generation + verify consume |
| `tournament_staff_verification_submissions` | Staff verification responses | staff queue + verify page | public verify submission + admin review |

## Reviews and scoring
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `tournament_referee_reviews` | Raw tournament reviews | admin moderation | `/api/referee-reviews` inserts, admin moderation updates |
| `tournament_referee_reviews_public` | Sanitized approved tournament reviews | tournament detail pages | derived view (no direct writes) |
| `tournament_referee_scores` | Tournament aggregate score | listings/detail/hubs | scoring jobs/admin recalcs |
| `schools` | Canonical schools | school pages/search | school review flow upsert |
| `school_referee_reviews` | Raw school reviews | admin moderation | `/api/schools/reviews` inserts |
| `school_referee_reviews_public` | Sanitized approved school reviews | school insights pages | derived view (no direct writes) |
| `school_referee_scores` | Aggregate school score | school listings/detail | score recomputation |
| `school_referee_scores_by_sport` | School score per sport | school pages | score recomputation |

## Assignor platform
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `assignors` | Canonical assignor directory | public assignor page, admin | admin CRUD, source processing |
| `assignor_contacts` | Assignor contact points | masked public directory + admin | admin/source processing |
| `assignor_coverage` | Assignor service areas | public + admin pages | admin/source processing |
| `assignor_zip_codes` | Coverage zip detail | public + admin pages | admin zip tools |
| `assignor_sources` | Source registry for assignor imports | admin source pages | admin source tools |
| `assignor_crawl_runs` | Crawl run records | admin source/review pages | edge function + admin triggers |
| `assignor_source_records` | Raw source records pending process | admin review pages | queue-url/import/crawl processors |
| `assignor_directory_public` | Public-safe directory projection | `/assignors` | derived view |
| `assignor_directory_public_fn()` | Public query fn (masked fields) | `/assignors` | function execution only |
| `contact_access_log` | Reveal/audit logging | admin audits | reveal/log endpoint inserts |
| `assignor_claim_requests` | Public claim requests | admin review | public claim submissions |
| `rate_limit_events` | Rate-limit event logging | admin/security review | reveal/claim flow logging |

## Referrals, engagement, and supporting tables
| Table/View | Purpose | Primary reads | Primary writes |
| --- | --- | --- | --- |
| `referral_codes` | User referral code ownership | referral APIs | auth flows + API upserts |
| `referrals` | Referral conversion records | referral APIs/account | `/api/referrals*` routes |
| `outbound_clicks` | Click-through tracking | admin analytics | `/go` redirect routes |
| `review_invites` | Invite flow tracking | invite APIs/admin | `/api/invites` |
| `referee_verification_requests` | Referee verification queue | admin + profile | verification submissions/admin updates |
| `badges`, `user_badges` | Badge catalog and assignments | profile/admin | admin badge assignment |

## RPCs and server functions seen in app code
| RPC / function | Used by | Notes |
| --- | --- | --- |
| `process_assignor_crawl_run` | `app/admin/assignors/sources/page.tsx`, `app/admin/assignors/review/page.tsx` | Processes crawl run into assignor records/entities |
| `process_assignor_source_record` | `app/admin/assignors/review/page.tsx` | Approves/rejects individual source records |
| `public.is_admin()` | migration policies, admin gates | Foundational policy helper for admin-only tables |

## High-risk write paths (watch list)
- Enrichment apply endpoints: `/api/admin/tournaments/enrichment/apply`, `/api/admin/tournaments/enrichment/url-apply*`.
- Email discovery runner: `/api/admin/tournaments/enrichment/email-discovery`.
- Outreach send/verify token generation: `/admin/outreach` actions and staff verification queue actions.
- Assignor processing RPC triggers in admin review/source pages.

## Primary code references
- Enrichment pipeline: `apps/referee/src/server/enrichment/pipeline.ts`
- Admin dashboard and discovery actions: `apps/referee/app/admin/page.tsx`
- Source admin utilities: `apps/referee/src/server/admin/sources.ts`
- Tournament enrichment admin APIs: `apps/referee/app/api/admin/tournaments/enrichment/*`
- Assignor public/admin flows: `apps/referee/app/assignors/page.tsx`, `apps/referee/app/admin/assignors/*`
- Assignor edge function: `supabase/functions/assignor-crawl-cnra/index.ts`
- Parser inventory and trigger map: `docs/overview/architecture/parser-map.md`
