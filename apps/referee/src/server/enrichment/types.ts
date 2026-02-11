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
  travel_lodging?: "hotel" | "stipend" | null;
  assigning_platforms?: string[] | null;
  source_url?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
};

export type DateCandidate = {
  tournament_id: string;
  date_text?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  source_url?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
};

export type AttributeCandidate = {
  tournament_id: string;
  attribute_key:
    | "cash_at_field"
    | "referee_food"
    | "facilities"
    | "referee_tents"
    | "travel_lodging"
    | "ref_game_schedule"
    | "ref_parking"
    | "ref_parking_cost"
    | "mentors"
    | "assigned_appropriately";
  attribute_value: string;
  source_url?: string | null;
  evidence_text?: string | null;
  confidence?: number | null;
};

export type PageResult = {
  contacts: ContactCandidate[];
  venues: VenueCandidate[];
  comps: CompCandidate[];
  pdfHints: CompCandidate[];
  dates: DateCandidate[];
  attributes: AttributeCandidate[];
};
