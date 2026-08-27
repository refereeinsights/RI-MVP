# Corralio Slice 3.4 — Stage 1 Closeout Audit

**Date:** 2026-08-27

**Scope:** Schedule Connection Activation only

**Database activity:** bounded service-role reads; zero writes; zero external feed/provider calls

## Repository findings

- `ConnectScheduleForm.tsx` still begins with a raw Calendar link and explains iCal/ICS before any platform-recognition step. This is a material activation cliff under the launch gate requiring multiple connected schedules.
- The existing shared fetcher retains protocol, redirect, DNS/private-network, timeout, content, and size protections. The Corralio ingestion layer normalizes webcal, parses through the shared sports-schedule package, persists through the existing RPC boundary, and runs venue matching only after successful persistence.
- Schedule URLs remain service-only bearer secrets and are absent from ordinary connected-source payloads. No source URL needs to move into the new UI or measurement path.
- The current action/result boundary returns only message strings. Contextual recovery therefore needs one closed, safe `errorKind` added to the result and form state; no fetch/parser redesign is needed.
- A small typed code module is sufficient for the four-platform launch catalog. No platform catalog table or durable platform tag on `corralio_schedule_sources` is justified.
- Existing tables already establish successful imports, active-schedule count, second schedule connection, and weekly This Weekend use. Duplicating those facts as funnel rows would conflict with Slice 4.2A.
- Platform selection, instructions viewed, and failed submission/validation attempts leave no existing trace. A narrow household-private interaction table and authenticated-owner RPC are justified, with a one-minute dedupe bucket and fail-open application wrapper.

## Existing-household ingestion evidence

The one household containing all three launch platforms was identified in memory from stored source hostnames. No household ID, source ID, URL, event text, note, or location value was printed or retained.

| Platform | Active sources | Sync | Events | End time | Source/display location present | Midnight starts | Duplicate UIDs | Updated in place | Refresh failures |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| GameChanger | 1 | success | 150 | 150 | 148 / 148 | 2 | 0 | 150 | 0 |
| TeamSnap | 2 | success | 177 | 177 | 177 / 177 | 0 | 0 | 177 | 0 |
| Stack Team App | 1 | success | 39 | 39 | 39 / 39 | 0 | 0 | 1 | 0 |

The two GameChanger midnight starts are an audit flag, not proof of a parser defect; titles and raw feed content were intentionally not inspected. Current-row state cannot prove historical cancellation behavior, but all four sources are currently successful, all have succeeded refreshes, and no UID duplicate storm is present.

## Compatibility decision

- GameChanger: `COMPATIBLE`
- TeamSnap: `COMPATIBLE`
- Stack Team App: `COMPATIBLE`
- Other calendar: `MANUAL`

None is labeled `VERIFIED`: current ingestion evidence is strong enough for the V1 picker but does not independently prove the prompt's complete update/cancellation verification contract.

## Stage 2 design

1. Typed platform module provides the closed platform enum, names, tiers, instructions, and caveats.
2. The picker transports only the closed activation platform key. It does not alter source trust, fetching, parsing, persistence, venue logic, or refresh.
3. Ingestion returns a closed safe error kind alongside existing parent-safe copy.
4. The success UI keeps the form available and offers both Connect another schedule and See This Weekend without forced navigation.
5. A new private interaction table records only `platform_selected`, `instructions_viewed`, `link_submission_failed`, and `feed_validation_failed`, with a closed platform/reason vocabulary and one row per household/event/platform/reason/minute.
6. Successful imports, second-schedule activation, and This Weekend use remain report-time queries over existing tables.
7. Measurement is best effort and can never alter connection results.

## Verdict

No architectural or privacy blocker was found.

`SLICE 3.4 STAGE 1 CLOSED; STAGE 2 AUTHORIZED`
