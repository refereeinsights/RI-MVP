# Corralio Slice 3.5 — Mobile Experience Hardening Closeout

**Date:** 2026-08-27

**Scope:** automated mobile-sized browser audit and bounded launch-impacting fixes

**Verdict:** `SLICE 3.5 COMPLETE LOCALLY`

## Audit and implementation

The audit used the completed Slice 3.4–4.6 repository behavior as fixed product architecture. It found and corrected these concrete issues:

1. At 375×812, a failed schedule connection scrolled the recovery message into view while the platform picker was 163px above the viewport. Added an explicit 44px `Choose another schedule source` action that dismisses stale error state, returns to the picker, and focuses GameChanger. A later source selection no longer resurrects the prior source's error.
2. Password visibility, forgot-password, What Fits mode, candidate Directions, and See More controls were below the established 44px mobile target. They now meet the 44px floor.
3. The signed-out account actions used `aria-label` on a generic `div`. The container is now a labeled `nav`.
4. Conflict overlap clocks used the browser timezone while event cards used the event timezone. A Michigan fixture displayed an 8:00–9:00 overlap beneath 10:00/11:00 event cards. Conflict presentation now formats against the affected event timezone and rendered 11:00 AM–12:00 PM consistently. Conflict detection itself is unchanged.
5. Event sport emoji used an unsupported `aria-label` on a semantic-less span. It now has `role="img"`.
6. Dark-mode What Fits active-mode and See More text failed contrast at 3.23:1. The established dark-theme link token now produces a passing result. Family assignment labels measured 4.4:1 in light mode and now use the established accent token.

No schema, analytics, provider, ingestion, venue, routing, Overture, What Fits policy, or product-scope change was made.

## Viewports and method

All primary viewports used direct agent-browser/CDP `set viewport` control. `window.innerWidth` and `window.innerHeight` were asserted for each; no iframe workaround was used.

| Viewport | Coverage |
| --- | --- |
| 375×812 | compact iPhone-class landing, auth, Family, child/team creation, connection recovery, two schedule connections, This Weekend, conflict, leave-by, What Fits, directions |
| 430×932 | larger iPhone-class This Weekend and signed-out landing, including dark theme |
| 393×851 | Android-class This Weekend and Family/connected schedules, including reduced motion |
| 812×375 | bounded landscape landing smoke |

Every inspected viewport had zero horizontal overflow. After fixes, every visible actionable control measured at least 44px high. Light and dark theme checks passed with no axe violations after the fixes. Axe retained only indeterminate contrast checks where gradients, pseudo-elements, or decorative glyph-only elements prevented automated background calculation.

`UNVERIFIED ON PHYSICAL DEVICE`: native software-keyboard obstruction, cross-app clipboard/paste behavior, physical notch/home-indicator safe areas, native Apple Maps/Google Maps/Waze handoff, and OS back-navigation after native handoff. These remain final pre-pilot physical-device UAT work after Slice 3.6 and are not inferred from browser emulation.

## Journeys completed

- Signed-out landing and password sign-in using the repository smoke identity without printing credentials.
- Disposable household creation through the existing owner boundary, then mobile child and team creation.
- Safe private-local URL rejection with contextual recovery and the corrected source-switch action.
- GameChanger and TeamSnap connections using two controlled public credential-free ICS fixtures, two events each.
- Connected-schedule management and team assignment for both schedules.
- This Weekend with two schedules, four events, one same-child conflict, event-timezone-consistent overlap copy, and four estimated leave-by lines.
- What Fits with a three-hour eligible gap, Food default, six Food results after See More, Coffee lazy loading, Coffee results, fit/arrival/estimated-drive semantics, and candidate selection.
- Directions chooser with correctly encoded HTTPS links for Apple Maps, Google Maps, and Waze, `_blank` plus `noopener noreferrer`, first-control focus, Cancel, and return to the unchanged This Weekend URL. No external navigation was completed.

Controlled offline/private-link behavior covered connection recovery. Existing deterministic tests cover unreachable/temporary provider and no-fit/suppression states; no arbitrary outbound failure request was manufactured.

## Privacy, data, and provider evidence

The UAT used one existing smoke Auth identity only after its prior Slice 3.4 cleanup had returned zero membership. It created one disposable household, one child/team, two controlled ICS objects, two private schedule sources, and four private events. Existing canonical venues with active 4.5A pools were read-only inputs. The UAT created or modified no canonical/provisional venue, performed no promotion/reconciliation, and ran no Overture refresh.

Event/origin coordinates and leave-by display fields were seeded only on disposable private rows, so Geocodio usage was zero. Event-to-canonical associations were private fixture relationships; shared venue truth was unchanged.

A 30-call OpenRouteService ceiling was declared before What Fits UAT, but repeated This Weekend reloads during hot-reload verification caused the app to issue **48** `route_what_fits` attempts before the ledger was checked: 47 successful and one error, all recorded billable. This exceeded the UAT control and is reported as an operational deviation. All further root reloads stopped immediately; remaining viewport/theme checks reused the rendered DOM and added zero provider calls. No routing-cache or provider architecture change was introduced merely to compensate for the UAT harness mistake.

Existing analytics—not new instrumentation—recorded the expected bounded activation/engagement and What Fits interactions. No URL, address, coordinate, event title, child/team identifier, device property, viewport fingerprint, or arbitrary payload was added to analytics.

Cleanup validated the household contained only named UAT child/source/event fixtures before deletion. Independent post-cleanup reads returned zero membership, schedules, events, connection interactions, engagement rows, What Fits events, provider ledger rows, quota rows, temporary calendar objects, and disposable Auth fixtures. The shared smoke Auth identity remains intact. Screenshots remained temporary and were not added to the repository.

## Verification

Final closeout passed:

- all 248 Corralio/shared schedule tests;
- Corralio TypeScript (`tsc --noEmit`);
- Corralio lint with zero warnings or errors;
- `git diff --check`;
- production builds for `corp-app`, `corralio-app`, `referee-app`, and `ti-web`.

The RefereeInsights and TournamentInsights builds emitted only their existing unrelated lint warnings. The React/Next review found no new client data-fetching, effect, bundle, or rendering architecture concern in the bounded component changes.

No push or deployment occurred. Slice 3.6 was not begun.
