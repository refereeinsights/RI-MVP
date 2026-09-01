# Corralio CPO Evidence — InLeague ICS Availability

**Recorded:** 2026-08-31

**Status:** Founder-supplied vendor-support statement; out-of-catalog candidate evidence only

## Source statement

> We have added an ICS subscription (or download) function that is available under team assignments, upcoming games, or your team's schedule page (presuming there are games published).
>
> Let us know if you have any issues with it!

The founder supplied this statement as InLeague documentation. No public source URL, publication date, representative feed, or Corralio-side test accompanied it.

## What this establishes

- InLeague reports an ICS capability.
- InLeague says it may be available from Team Assignments, Upcoming Games, or the team's Schedule page.
- Availability depends on games having been published.
- The vendor's wording does not clearly distinguish a durable subscription from a one-time download in every context.

## What remains unproven

- The exact current public support URL and instructions.
- Whether each entry point returns a subscription URL, a downloaded `.ics` snapshot, or different behavior.
- Whether the URL is public, authenticated, expiring, or credential-bearing.
- Whether Corralio's server-side URL and SSRF boundaries accept the resulting URL safely.
- Initial Corralio import, persistent refresh, schedule changes, reschedules, cancellations, locations, and duplicate handling.
- Team versus household connection contexts.
- Whether a representative feed contains usable calendar/team metadata.

## Product classification

InLeague is a **Future Platform Addition Rule candidate**, not a current Corralio catalog platform and not `COMPATIBLE` or `VERIFIED`. This evidence must not create a picker option, analytics enum value, database constraint change, partnership claim, or source-specific ingestion path by itself.

The Schedule-Source Compatibility & Evidence Matrix audit should carry this candidate forward without creating a matrix row for a key that does not exist. A later separately authorized platform-addition pass should verify the public vendor documentation and one representative credential-safe feed, then determine whether InLeague belongs in both team and household contexts. Generic `Other calendar` remains the supported path in the meantime.
