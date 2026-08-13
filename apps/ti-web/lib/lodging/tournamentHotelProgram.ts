export type TournamentHotelProgramType = "standard";
// Phase 2 will extend to: "standard" | "support_5" | "support_10"

export type TournamentHotelProgram = {
  programType: TournamentHotelProgramType;
  // Phase 2 will add trusted server-side routing configuration.
};

export async function getTournamentHotelProgram(
  _tournamentId: string
): Promise<TournamentHotelProgram> {
  // Phase 2: resolve enrollment and HotelPlanner configuration
  // from trusted database/configuration state.
  return { programType: "standard" };
}
