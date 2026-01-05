export type ContactCandidate = {
  tournament_id: string;
  role_raw?: string | null;
  role_normalized?: "TD" | "ASSIGNOR" | "GENERAL" | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  source_url?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
};

export type VenueCandidate = {
  tournament_id: string;
  venue_name?: string | null;
  address_text?: string | null;
  venue_url?: string | null;
  source_url?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
};

export type CompCandidate = {
  tournament_id: string;
  rate_text?: string | null;
  rate_amount_min?: number | null;
  rate_amount_max?: number | null;
  rate_unit?: string | null;
  division_context?: string | null;
  travel_housing_text?: string | null;
  assigning_platforms?: string[] | null;
  source_url?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
};

export type PageResult = {
  contacts: ContactCandidate[];
  venues: VenueCandidate[];
  comps: CompCandidate[];
  pdfHints: CompCandidate[];
};
