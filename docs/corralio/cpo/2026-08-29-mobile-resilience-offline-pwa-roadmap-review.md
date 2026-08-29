# CPO Review — Mobile Resilience & Offline PWA Roadmap Addition
**2026-08-29**

Reviewing the founder's "Mobile Resilience & Offline PWA" direction before it becomes an executable Codex slice, per the document's own final instruction. Added to the roadmap (`docs/corralio/CORRALIO_PRODUCT_ROADMAP.md`, new "Launch Readiness — Mobile Resilience & Offline PWA" section). **No executable audit prompt has been written or authorized — that remains a separate, later step, exactly as instructed.**

## Source material: unverifiable from this repo

The document's Section 0 cites "the existing Corralio Handoff — Client Architecture, Offline/PWA & Device Testing" as source material. Checked directly: no document with that title, or close to it, exists anywhere in this repository. It is external — a claude.ai Project doc or a founder-side file not yet landed here. Practical consequence: the document's own scope corrections already anticipate this ("subject to the scope corrections below"), so this isn't a defect in the direction — but whoever eventually audits this should treat that handoff document's specific technical claims as unverified until independently re-confirmed against the live codebase, the same discipline applied to everything else in this thread. Recommend the handoff document itself get filed into the repo (`docs/reference/` or similar) before the audit prompt is written, so Codex has it as a citable source rather than a secondhand paraphrase.

## Verified against the live repository

**Service worker: zero caching infrastructure exists today.** `apps/corralio/public/sw.js` (51 lines) has exactly two listeners — `push` and `notificationclick` — no `fetch`, `install`/`activate` cache population, or Cache API usage anywhere. Its own header comment: "No caching or private-data storage." This confirms the document's framing is accurate: offline/caching is genuinely new infrastructure, not an extension of anything already built. It also confirms no conflict with Slice 3.6A, which explicitly scoped its service worker to exclude caching.

**Good news: the server/client boundary the document asks for already exists.** Traced "This Weekend" end to end: `apps/corralio/app/page.tsx` (server component) calls `loadWeekendData()`, which computes leave-by, freshness, and identity resolution server-side before handing already-computed data to the `ThisWeekend` client component. That component only groups by day and detects overlap conflicts on data it's given — no client-side raw Supabase querying found anywhere in this path. Interactive recompute goes through real Server Actions (`computeWeekendLeaveByAction`, `computeWhatFitsAction`). This means the audit's primary open question is genuinely "how do we cache already-correct server output for offline reading," not "how do we fix a boundary that's already leaking computation to the client." Meaningfully de-risks this workstream relative to how it might have read on paper.

**Schedule-refresh cadence: confirmed 4-hour, not 15–60 minute.** `apps/corralio/vercel.json` still shows `17 */4 * * *`, matching Slice 3.5.5's approved daily→4-hour change with a 3-hour freshness gate. No mention of a 15–30 or 30–60 minute polling hypothesis exists anywhere in this repo's prompts or notes — that reference must live in the external handoff document. Not a conflict: the founder's Section 6 already correctly treats it as an unapproved future hypothesis rather than a decision. Flagging only so it's clear this specific number can't be cross-checked from repo history the way everything else in this review was.

**ADR-030/031/033: still not landed — a standing gap, now touched by a second document.** `docs/corralio/CORRALIO_ARCHITECTURE_DECISIONS.md` contains real content through ADR-029 only. ADR-030/031/033 are cited by name in nine-plus other documents — including, now, this Mobile Resilience direction's own Section 8 physical-device requirement, which functions like a de facto ADR-033 ("launch-gate experience test") without ADR-033 ever having been formally written. This gap was already flagged once, in the prior Slice 3.6 audit packet. Recommend resolving it now rather than letting a third document accumulate on top of an ADR that doesn't formally exist: when ADR-033 is finally written, its content should likely just be this document's Section 8 physical-device matrix, closing both gaps in one motion rather than two independent launch-gate definitions coexisting.

**No conflicting in-flight work.** No existing prompt or slice already touches offline caching, service-worker fetch interception, or connectivity resilience. The one explicit prior statement on this ("no offline-caching commitment implied or required by this slice," Slice 3.6A's original draft) is consistent with, not contradicted by, this new item.

## One tension worth the founder's explicit confirmation, found while reviewing

`CORRALIO_PRODUCT_ROADMAP.md`'s existing V1 "Travel" section (unchanged by this review) says: "Reuse existing trusted attribution and Hotel Program resolution... Do not create a duplicate Corralio HotelPlanner commercial implementation." This was written before this session's HotelPlanner attribution design (`docs/reference/corralio-hotelplanner-attribution-design.md`) — which gives Corralio its own `source: "corralio"` value and its own attribution-token/mapping table, reusing TI's exact code pattern and infrastructure but distinguishing Corralio-originated bookings for the routing-origin use case.

My read: these are compatible, not conflicting — the attribution design reuses the same vendor account, the same HMAC auth code, and the same Custom3/`attr:` convention; it adds a distinguishing tag, not a second commercial implementation, checkout flow, or payment path. But the roadmap's existing language is old enough, and general enough, that it's worth the founder confirming that reading explicitly once the actual handoff feature is scoped, rather than leaving two documents that could be read as being in tension.

## Roadmap placement (as recorded in `CORRALIO_PRODUCT_ROADMAP.md`)

```
Slice 3.6A — Weekend Ready Web Push
  → Slice 3.6B — Required Arrival / Routing Origin / HotelPlanner attribution / Mapbox Traffic-Aware Planning
    → Mobile Resilience & Offline PWA — audit, then P1 launch-blocking fixes only
      → Physical-device end-to-end launch UAT (single combined pass: 3.6A push/tap-handoff
        + 3.6B arrival/routing/traffic + this workstream's offline/reconnect matrix)
        → Bounded family pilot
```

One placement refinement beyond what the founder's document specified: rather than a separate physical-device test pass for this workstream, fold its network-transition matrix (Wi-Fi → cellular → weak/no service → airplane mode → reconnect) into the same physical-device UAT pass already planned for 3.6A/3.6B — both need the same real iPhone and Android hardware, and running it twice wastes the one resource (physical devices, a human's time) that can't be parallelized or automated away.

## Status

Roadmap entry added. Review complete. Waiting on: founder confirmation of the HotelPlanner V1-language reading above (optional, low urgency), and an explicit go-ahead before this becomes an executable Codex audit prompt.
