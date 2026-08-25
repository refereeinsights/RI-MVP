# Corralio Slice 4.4B Source-Classification Audit

Date: 2026-08-25

## Verdict

`SOURCE CLASSIFICATION PREREQUISITE NOT MET`

`SLICE 4.4B NOT READY`

The mandatory source-eligibility gate in the reviewed Slice 4.4B prompt fails. No provisional venue schema, shared evidence writer, runtime hook, migration, verifier, backfill, external request, or production enablement was created.

## Evidence

- `public.corralio_schedule_sources.source_type` is constrained to the single value `ics`. It distinguishes transport format, not publisher or evidence trust.
- Schedule creation always uses the generic ICS source writer. The persisted source has a user-submitted display name, secret URL, optional user-selected sport, and household assignment, but no server-derived provider/source class.
- The shared schedule fetcher accepts any syntactically valid public HTTP(S) URL that passes SSRF, redirect, response-size, and calendar-content checks. Those checks establish safe retrieval and valid ICS content; they do not establish that a team, league, club, tournament, or sports platform published the feed.
- The shared ICS normalizer is provider-agnostic and returns normalized event facts only. It records no trusted publisher identity or provider classification.
- Hostnames and final redirect URLs remain credential-bearing source material. The reviewed prompt expressly prohibits inventing source trust from those values without an existing trusted classification.
- User-entered schedule name, user-selected sport, and sports terminology in events are not trustworthy publisher evidence.
- ADR-019 explicitly accepts generic ICS coverage while deferring direct TeamSnap, GameChanger, and SportsEngine integrations. The repository therefore contains no previously accepted direct-provider trust contract to reuse.

## Why implementation stopped

4.4B would create cross-household shared intelligence. Allowing every generic ICS source to qualify would let an arbitrary or fabricated feed create reusable shared venue identities. Deriving eligibility from user-controlled labels, sport, event text, or an unaudited URL/hostname rule would violate the prompt's privacy, provenance, and source-trust boundary.

The correct audit-first outcome is to stop rather than manufacture a policy that repository data cannot support.

## Smallest prerequisite

Prepare a separately reviewed, narrow source-classification slice that:

1. Defines the first explicitly trusted sports schedule provider/source classes and the exact evidence that proves each class.
2. Derives classification exclusively on the trusted server from validated, non-secret characteristics; clients cannot submit or modify eligibility.
3. Persists a bounded provider/source-class token plus classifier version and classified-at timestamp on the protected schedule source, without exposing or copying its raw URL.
4. Defaults every existing and newly unrecognized source to `unclassified` and shared-evidence-ineligible.
5. Does not backfill or trust historical sources automatically.
6. Reclassifies safely when a source URL is replaced and prevents stale classification from surviving replacement.
7. Adds RLS/grant/RPC constraints, spoofing/redirect tests, payload-free logging, and a human-readable audit report of eligible/ineligible counts without raw URLs.
8. Requires separate approval for any hostname/domain allowlist and documents why ownership and redirect behavior make it trustworthy.

Once that prerequisite is implemented and verified, rerun the complete 4.4B audit. Do not treat prerequisite completion as authorization for a retroactive venue sweep or production enablement.

## Unchanged boundaries

- Slice 4.4 canonical matching remains read-only and complete locally.
- Slice 4.3 event geocodes, routes, and leave-by remain unchanged.
- Events from all current generic ICS sources remain fully usable.
- No canonical or provisional venue was created or modified.
- No ADR was changed because the gated implementation did not proceed.
- No external API call, database mutation, migration application, cron, push, or deployment occurred.
