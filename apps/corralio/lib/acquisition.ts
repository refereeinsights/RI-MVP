export const CORRALIO_ACQUISITION_COOKIE = "corralio_acq_src";
export const TI_WEEKEND_PLANNER_PROVENANCE = "ti_weekend_planner_opt_in";
export const CORRALIO_ACQUISITION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type CorralioAcquisitionProvenance = typeof TI_WEEKEND_PLANNER_PROVENANCE;

export function resolveAcquisitionProvenanceCookie(
  rawValue: string | null | undefined,
): CorralioAcquisitionProvenance | null {
  return rawValue === TI_WEEKEND_PLANNER_PROVENANCE
    ? TI_WEEKEND_PLANNER_PROVENANCE
    : null;
}
