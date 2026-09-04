# Slice 3.6B Phase 3A — Bounded Stage 2 UAT

**Verdict:** `SLICE 3.6B PHASE 3A COMPLETE LOCALLY`

## Scope and fixtures

The signed-in local UAT used one disposable Auth identity, one disposable household, one credential-free `.invalid` schedule source, and one synthetic upcoming event with public-place coordinates. No canonical or provisional venue was created or modified. The browser exercised only event leave-by; What Fits was not changed or supplied a routing origin.

The declared external-call ceiling was one Geocodio call and two ORS calls. The final actual ledger contained exactly one failed `geocode_event`/Geocodio request (`low_accuracy`) and two successful `route_event`/ORS requests. The quota delta was exactly three. The Geocodio call occurred during initial fixture setup because the existing event-location trigger correctly cleared coordinates supplied on insert and the mounted planner attempted to geocode the synthetic display label. The fixture was repaired post-insert, the alternate was seeded as already geocoded, and no additional Geocodio call was permitted or made.

## Browser journey

| Check | Evidence | Result |
|---|---|---|
| Home baseline | 20-minute cached drive; leave by 10:10 AM; `Leaving from Home · Change` | Pass |
| Progressive disclosure | Home, current location, alternate address, and the one-use/provider/no-retention disclosure appeared only after opening the control | Pass |
| Unsupported geolocation | Bounded unavailable message; no provider call | Pass |
| Denied geolocation | Bounded recovery message; Home remained selected; no provider call | Pass |
| Alternate address | Existing geocode reused; ORS returned 14 minutes; leave by 10:16 AM | Pass |
| Alternate reload | Same alternate and 14-minute cached route restored | Pass |
| Current location | Synthetic coordinates produced one ORS route of 11 minutes; leave by 10:19 AM | Pass |
| Current reload | Current result disappeared; durable alternate returned | Pass |
| Clear | Alternate row removed; Home restored at 20 minutes/10:10 without another provider call | Pass |
| Arrival preference | Source preference changed 30 → 45 minutes; leave-by changed 10:10 → 9:55 while drive remained 20 minutes | Pass |
| Browser health | No page errors or framework overlay; console contained React DevTools notices only | Pass |

## Privacy and persistence

Aggregate database inspection after current-location routing showed one payload-free claim and no current-coordinate or current-route persistence surface. The alternate row remained separately typed and routed. Household Home values, the Home-derived event route, and the destination-geocode timestamp remained unchanged throughout alternate and current routing.

The local server emitted the existing constant best-effort provisional-venue warning for the deliberately incomplete `.invalid` schedule fixture. This is the designed ingestion error boundary and did not expose payload data or affect the successful route/UI path.

## Cleanup

Independent cleanup checks returned zero retained rows for the disposable household, membership, schedule source, event, alternate origin, current-location claim, provider ledger, and quota, plus zero disposable Auth identities. The browser session, local server, and temporary harness were removed.

Physical-device GPS accuracy, native permission-prompt behavior, and mobile/PWA location-service behavior remain `UNVERIFIED ON PHYSICAL DEVICE` and belong to the combined physical-device launch gate.
