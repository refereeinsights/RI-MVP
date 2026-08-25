# Corralio Slice 4.4B — Shared Provisional Venue Creation v3

You are working in the existing TournamentInsights / RefereeInsights / Corralio monorepo.

Slice 4.4 Location Foundation must be complete and verified before implementation begins.

This is an audit-first implementation prompt. Repository reality wins over assumptions here. The final product decision is:

> **low-trust ICS event location → structurally isolated shared provisional venue → Overture enrichment/corroboration → later validated canonical/public venue**

The operating principle is **capture broadly, enrich automatically, publish conservatively**. Do not implement or require Slice 4.4B.1; generic successfully persisted ICS events may enter this provisional pipeline. Source provenance is evidence, not authority.

## Objective

Slice 4.4 established:

**event location → household-origin/privacy exclusion → existing canonical venue matching → matched or unmatched**

Slice 4.4B handles a subset of the unmatched case:

> When a qualifying sports schedule identifies a legitimate named public sports/school facility that does not confidently match an existing canonical venue, safely create or reuse one provisional shared venue identity.

The operating model is:

> **Automatic creation. Shared reuse. No public promotion.**

This slice should answer one question well:

> Can Corralio safely create one reusable provisional venue once and have future events and households reuse it?

Do not solve the full provisional-venue lifecycle here. Slice 4.4C owns corroboration, withdrawal, merge, remediation, and promotion. Slice 4.5 owns Overture and Nearby.

---

## 0. Audit first

Before schema design or implementation, verify:

- Slice 4.4 matching behavior, privacy exclusion, schema, and trusted read boundary.
- Slice 4.3 event-geocoding orchestration and persisted fields.
- Current schedule-source classifications and which values are user-controlled.
- Schedule ingestion, replacement, and scheduled-refresh paths.
- `public.venues`, `venues_public`, aliases, deduplication, and candidate mechanisms.
- TI and RI venue detail, search, SEO, sitemap, export, and RPC surfaces.
- Existing shared-data ownership and transactional/RPC conventions.
- Existing human-run venue-resolution or coverage reporting, if any.
- Exact current text of ADR-008, ADR-021, ADR-030, and ADR-033.

Report material conflicts and exact proposed ADR amendments before implementation. Do not silently implement behavior contrary to accepted ADRs.

### Authoritative source boundary

V1 creation is limited to successfully persisted `origin_type='ics'` events. Manual events do not contribute shared provisional venue evidence. No publisher/source trust classification is required or authorized in this slice. Never infer authority from user-entered labels, URLs, event text, sport, or hostnames, and never persist raw source URLs or credentials as provisional provenance.

---

## 1. Dedicated provisional storage

Repository evidence currently indicates that `public.venues` is unsafe for provisional records because canonical rows feed public and SEO surfaces.

Prefer a dedicated service-controlled provisional venue table structurally isolated from `public.venues` and `venues_public`. Do not place provisional records in `public.venues` unless the audit proves every public consumer can be structurally migrated and that larger blast radius is explicitly approved.

If an existing safe candidate mechanism exists, prefer reuse. A provisional venue must not automatically appear in TI/RI venue pages, sitemaps, public search, canonical exports, or any surface assuming canonical truth.

---

## 2. Scope

### 4.4B does

- evaluate eligible unmatched events only after successful existing geocoding;
- require a conservatively parsed identifiable place/facility name;
- reuse Slice 4.4 privacy exclusion;
- check canonical venues first and active provisional venues second;
- create or reuse a provisional identity atomically;
- associate the event with a typed provisional identity;
- let future eligible events reuse that identity;
- retain minimal safe creation evidence;
- remain bounded, idempotent, non-blocking, and correctable through service-only suppression;
- extend an existing coverage report or create the smallest human-run read-only report if none exists.

### 4.4B does not

- promote provisional venues into `public.venues`;
- implement Overture, Nearby, or another external provider;
- implement evidence scoring, corroboration, or promotion thresholds;
- implement full withdrawal, merge, or review UI;
- create field/court/gym canonical entities;
- alter leave-by arithmetic, canonical venue data, or public venue pages;
- sweep or backfill historical unmatched events.

---

## 3. ICS eligibility and safe provenance

A parsed event is low-trust preliminary evidence. Successfully persisted ICS events qualify for evaluation; manual events and arbitrary pasted addresses do not. A generic ICS event can create only a structurally isolated provisional identity and can never authorize canonical/public data.

Never place raw feed URLs, tokens, signed URLs, credentials, household origins, or unnecessary household identifiers into shared provisional data. Persist only a sanitized source/provider class, a safe observation identity where justified, observation time, validator version, and creation method.

Repeated events from the same underlying feed/source are one evidence source, not independent corroboration. Full evidence-independence logic belongs in 4.4C.

---

## 4. Privacy and location prerequisites

Reuse Slice 4.4's household-origin exclusion; do not create a competing implementation. Recognize that it does not prove every other address is public.

Never create a provisional venue from household origin, a known private location, pickup/dropoff instructions, `Home`, `Away`, `TBD`, `Unknown`, `N/A`, `Meet at hotel`, parking-only/logistical text, or an unidentified address.

Reuse the successful event geocode produced by Slice 4.3. Do not geocode again for 4.4B. Geocoding establishes location, not public-venue legitimacy.

For 4.4B, existing Geocodio provenance means only persisted facts:

- accepted latitude and longitude;
- `location_geocoded_at`;
- provider token `geocodio`;
- the applicable implemented geocode-validator version, if available.

Do not claim or reconstruct accuracy, result type, provider confidence, formatted address, address components, raw response, or other metadata Slice 4.3 did not persist. Distinguish persisted facts from inferred validation signals.

---

## 5. V1 creation eligibility

Automatic provisional creation requires all of:

1. successfully persisted `origin_type='ics'` event;
2. no privacy/non-venue exclusion;
3. successful usable existing event geocode;
4. conservatively parsed non-empty place/facility name;
5. no suppression/tombstone for the deterministic identity;
6. no confident canonical match;
7. no confident active provisional match;
8. no ambiguous likely duplicate;
9. atomic creation succeeds within abuse bounds.

If any condition fails, do not create a provisional venue. The event remains usable and no parent-facing error is required.

### Conservative place-name parsing

Evaluate indicators only inside an identified facility-name component, never across arbitrary address or logistical text.

Do not require a sports/school/facility keyword allowlist. Schools, parks, churches, community and convention centers, YMCAs, fitness centers, fairgrounds, hotels/event facilities, and other named non-private places may qualify. Sports/facility terminology may assist parsing and duplicate detection but is not a restrictive allowlist.

Explicit negative tests include `Park Avenue`, `Court Street`, `School pickup`, `Meet at Central Park parking lot`, `Home field`, `Away gym`, `Field 4` or `Court 2` without a parent facility, keywords found only in logistical text, and an address near multiple plausible facilities.

### Facility versus sub-location

The facility is the venue. A named field, court, rink, gym, or room inside it remains event-level information. Preserve the raw event location/sub-location; do not create separate provisional identities for internal sub-locations.

### Address-only creation is deferred

Do not create a provisional venue from an address alone, even when it geocodes and comes from a qualifying schedule. Overture or another trusted public-place source may support that later. Do not generate temporary address-derived venue names.

---

## 6. Identity and matching contract

Create or reuse a dedicated shared provisional identity containing only required fields: UUID, parsed place name, normalized place name/address components, latitude/longitude, lifecycle state, timestamps, validator version, and minimal safe provenance. Never copy the complete source/display location string, field instructions, parking notes, team details, child information, or household identity into shared storage.

Do not overload Slice 4.4's canonical `venue_id`. Choose and report an explicit typed relationship such as `venue_kind` plus identity, separate canonical/provisional IDs, or another model that makes canonical, provisional, and unresolved states unambiguous.

For eligible events, matching order is:

**canonical venue → active provisional venue → validate → atomic create/reuse**

Use a trusted server-side provisional lookup boundary. Never expose provisional records through `venues_public`. Event association must preserve original location, geocode, and leave-by semantics.

Canonical and provisional identity are mutually exclusive. Every match row is exactly canonical, provisional, or unresolved/private/insufficient. If a canonical venue later matches, atomically clear the provisional association and preserve the original event location/geocode. Every subsequent due evaluation checks canonical before provisional.

When an ICS location changes, detach the stale association, rerun canonical-first matching, and only then reuse/create provisional identity. Event deletion cascades its private association. Source/household deletion follows existing private deletion guarantees. A zero-association shared provisional row is retained for controlled 4.4C cleanup/revalidation rather than automatically deleted.

---

## 7. Trigger and non-blocking boundary

Run only after a successful usable event geocode exists. Audit and choose the smallest existing integration point: a post-geocode trusted-server hook, bounded service-only worker, or retryable enrichment pass.

Do not move geocoding into ingestion. Provisional enrichment failure must never fail ingestion, mark source health, alter refresh counters, block rendering or leave-by, or create a parent-facing error. Keep it inside a separately caught trusted-server boundary with constant, payload-free failure logging.

Deduplicate equivalent work, use deterministic claims where needed, bound processing and creation per run/source/household, and make retries safe. Do not build sophisticated abuse scoring.

---

## 8. Atomic creation and duplicates

Application-level check-then-insert is insufficient. Use a transactional service-role RPC or equivalent trusted database transaction that:

1. accepts only sanitized server-validated identity input;
2. obtains deterministic serialization on a normalized identity key;
3. rechecks canonical candidates;
4. rechecks active provisional candidates;
5. refuses ambiguous likely duplicates;
6. creates only when still genuinely new;
7. otherwise returns the existing identity;
8. idempotently records minimal evidence.

Use normalized facility name, normalized address, locality, aliases, and coordinates as available. Coordinate proximity supports duplicate detection but never establishes identity alone. Two households discovering the same school concurrently must converge to one provisional identity.

Define and version the deterministic normalization/key strategy. Formatting variants expected to represent one place must serialize to the same lock scope. Never use a capped candidate query to prove uniqueness or absence.

Provide a service-only suppression operation before production use. Suppression retains a durable normalized tombstone so identical evidence cannot recreate a new UUID. Near variants are not silently suppressed unless normalization proves they are the same identity; otherwise leave them unresolved/ambiguous for later review.

---

## 9. Database security boundary

For provisional venue, association, evidence, claim, and quota tables as applicable:

- enable and force RLS;
- create no client write policies;
- grant no SELECT or write privilege to `public`, `anon`, or `authenticated`;
- grant only narrow required privileges to `service_role`;
- use household-safe foreign keys where household-private rows are involved;
- keep shared venue facts separate from private household/event evidence.

The creation/reuse RPC must validate inputs server-side, never trust client-supplied source eligibility, expose only the minimum result, be owned by `postgres`, and use `search_path=pg_catalog, public`. Select and justify `SECURITY INVOKER` or `SECURITY DEFINER`; the catalog verifier must assert that exact decision. Revoke execute from `public`, `anon`, and `authenticated`, and grant it only to the required trusted role.

Any failed security assertion fails the slice.

---

## 10. Minimal evidence and deletion

Store enough sanitized evidence to explain creation and support later 4.4C work: provisional venue ID, source class, safe idempotent observation fingerprint where justified, observation time, validator version, facility-name signal, and the bounded Geocodio provenance defined above.

Do not build scoring or promotion. Audit how household/source deletion removes or anonymizes private references without incorrectly destroying genuinely shared facts. Do not retain permanent household-derived identifiers merely for provenance.

---

## 11. Production enablement gate

4.4B may be designed, implemented, migrated, and verified independently. However:

> **Production automatic provisional creation requires a minimal trusted service-only suppression mechanism with a durable normalized tombstone.**

Document the exact gate and prove its default is safe. 4.5 may be developed against schema and disposable provisional identities, but production enrichment of automatically created provisional identities must respect the same gate. Canonical venues are unaffected.

No retroactive sweep, bulk backfill, production-wide creation, or historical replay is authorized. Any initial backfill requires a separate explicit decision after creation precision, correction capability, and coverage are understood.

---

## 12. Venue Identity Coverage report

Audit for an existing human-run read-only venue-resolution report. Extend it if suitable; otherwise create the smallest read-only script. Do not create a dashboard, schedule, materialization, or analytics pipeline.

Define Venue Identity Coverage as:

**eligible successfully geocoded public sports events associated with a canonical or active provisional venue ÷ all eligible successfully geocoded public sports events**

Report considered geocodes, private/non-venue exclusions, eligible named ICS events, canonical associations, provisional associations, unresolved eligible events, ambiguity blocks where available, zero-association provisional rows, and canonical/provisional/combined rates. Keep denominator semantics explicit and expose no sensitive raw data.

---

## 13. ADR and downstream contracts

Prepare exact amendments based on audit findings:

- ADR-008 may permit trusted provisional creation while retaining the ban on unvalidated canonical writes.
- ADR-021 likely remains intact; clarify only if needed.
- ADR-030 must be reconciled with the accepted Geocodio/Overture direction without implementing Overture here.
- ADR-033 must retain that schedule matching alone cannot create canonical venues while permitting the separate validated provisional pipeline.

Report exact text before changing canonical ADR documentation.

4.4C owns evidence independence, scoring, automatic thresholds, full withdrawal/merge/repoint behavior, promotion, observation windows, Overture promotion evidence, review UI, and sophisticated remediation. 4.5 attaches Overture place intelligence to canonical or active provisional identities, never household-specific POI copies.

---

## 14. Required tests

At minimum cover:

- qualifying ICS and ineligible manual-event behavior;
- absence of credentials/URLs/private IDs from shared data;
- household-origin and logistical exclusions;
- Geocodio-alone and address-only rejection;
- named sports facility and school qualification;
- every negative heuristic example above;
- canonical-first behavior, provisional reuse, and ambiguity refusal;
- two-household concurrency producing one provisional identity;
- repeated refresh/events remaining idempotent;
- typed canonical/provisional/unresolved identity states;
- preservation of raw event location, coordinates, routes, and leave-by;
- absence from `venues_public`, TI/RI sitemaps, searches, SEO pages, and canonical exports;
- coverage-report numerator, denominator, exclusions, and privacy;
- default-disabled production gate;
- constant payload-free failures and bounded claims/quotas.

Run appropriate Corralio, TI, and RI regressions because this touches shared venue intelligence.

---

## 15. Two-stage workflow

### Stage 1

Perform the audit, schema design, code, unapplied migration, offline tests, catalog and rollback-only verifier preparation, coverage script, TypeScript, lint, all four production builds, usage/cost review, and `git diff --check`.

Do not apply a production migration, push, deploy, run cron/backfill, or enable production creation. Commit locally only after reviewing the scoped diff.

### Stage 2

Only after human migration application, run the machine-failing catalog verifier, rollback-only behavioral verifier ending in `ROLLBACK`, disposable database/browser UAT, safe cross-household concurrency UAT, coverage report, and independent cleanup-zero verification.

No canonical promotion is authorized.

---

## 16. UAT and cleanup

Using only disposable identities:

- A qualifying named facility reuses its existing geocode, runs canonical/provisional duplicate checks, creates or reuses exactly one provisional identity, associates the event, and stores only safe evidence.
- Equivalent concurrent evidence from two households converges to one identity with idempotent evidence.
- A manual event, address-only event, and private/home event create no provisional identity or shared evidence while events remain usable.
- No provisional row appears in `venues_public`, TI/RI sitemaps, public search/SEO, or canonical pages; no canonical venue row changes.

Cleanup is incomplete until independent checks return zero disposable residue across Auth identities, households, family rows, sources, events, canonical/provisional associations, provisional fixtures when safe, evidence, claims, quotas/accounting, and every dependent fixture table discovered during audit.

If future lifecycle constraints require a synthetic tombstone, prove no household/private fixture data remains attached. Do not retain fixture addresses, coordinates, URLs, credentials, Auth/household/source IDs, screenshots, ledgers, or harnesses in repository notes or shared records.

4.4B must create zero incremental external API calls. Reuse existing successful coordinates; do not call Geocodio, OpenRouteService, Overture, Mapbox, or another provider. Any live call requires separate explicit authorization and must be reported.

---

## 17. Notes and Stage 1 report

Update `apps/corralio/notes.md` and `docs/notes.md`. Record audit findings, the deliberate removal of the source-trust gate, storage and identity decisions, public isolation, privacy/place parsing, truthful geocode provenance, atomic duplicate strategy, suppression boundary, abuse bounds, coverage report, 4.4C/4.5 deferrals, ADR actions, verifier names, builds/checks, usage, and cleanup-zero. Never record private fixture details or credentials.

Before requesting migration application, report:

1. ICS-only eligibility and removal of the source-classification prerequisite;
2. schema, isolation, eligibility, privacy, geocode, and identity decisions;
3. atomic duplicate and security design;
4. abuse bounds and coverage-report design;
5. production gate and downstream deferrals;
6. exact ADR reconciliation;
7. tests, all four builds, usage review, and exact unapplied migration.

---

## 18. Final restrictions and verdict

- Audit first; repository reality wins.
- Generic persisted ICS is eligible for provisional evaluation; manual events are not.
- Prefer isolated provisional storage and typed identities.
- Privacy first; a conservatively parsed named place is required; address-only deferred; no restrictive keyword allowlist.
- Existing canonical first, active provisional second, atomic creation third.
- No credential-bearing provenance, new external calls, Overture, canonical promotion, bulk backfill, retroactive sweep, public exposure, push, deployment, or cron.
- Update notes, verify cleanup zero, and commit locally only.
- Stop after Slice 4.4B.

Report exactly one final verdict:

- `SLICE 4.4B COMPLETE LOCALLY`
- `SLICE 4.4B READY AFTER LISTED FIXES`
- `SLICE 4.4B NOT READY`
