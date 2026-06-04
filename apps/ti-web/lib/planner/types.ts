export type PlannerEventType =
  | "game"
  | "practice"
  | "travel"
  | "hotel"
  | "meal"
  | "check_in"
  | "referee_assignment"
  | "other";

export type PlannerSourceType = "manual" | "ics" | "public_schedule" | "tournament" | "admin";

export type PlannerChildRow = {
  id: string;
  user_id: string;
  display_name: string;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type PlannerTeamRow = {
  id: string;
  user_id: string;
  child_id: string;
  display_name: string;
  sport: string;
  season_label: string | null;
  sort_order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type PlannerChildWithTeamsRow = PlannerChildRow & {
  teams: PlannerTeamRow[];
};

export type PlannerSourceRow = {
  id: string;
  source_type: string;
  source_name: string | null;
  source_url?: string | null;
  team_name: string | null;
  child_profile_id: string | null;
  team_profile_id: string | null;
  last_synced_at: string | null;
  sync_status: string | null;
  sync_error: string | null;
  created_at: string | null;
  updated_at?: string | null;
};

export type PlannerChildCreateBody = {
  display_name: string;
  sort_order?: number | null;
};

export type PlannerChildUpdateBody = Partial<PlannerChildCreateBody> & {
  is_archived?: boolean;
};

export type PlannerTeamCreateBody = {
  child_id: string;
  display_name: string;
  sport: string;
  season_label?: string | null;
  sort_order?: number | null;
};

export type PlannerTeamUpdateBody = Partial<Omit<PlannerTeamCreateBody, "child_id">> & {
  child_id?: string;
  is_archived?: boolean;
};

export type PlannerEventRow = {
  id: string;
  user_id: string;
  weekend_id: string | null;
  title: string;
  event_type: PlannerEventType | string;
  team_name: string | null;
  opponent_name: string | null;
  tournament_id: string | null;
  venue_id: string | null;
  field_label: string | null;
  address_text: string | null;
  city: string | null;
  state: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  notes: string | null;
  child_profile_id: string | null;
  team_profile_id: string | null;
  source_type: PlannerSourceType | string;
  source_id: string | null;
  source_event_uid?: string | null;
  linkedVenue?: {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    seo_slug: string | null;
  } | null;
  created_at: string;
  updated_at: string;
};

export type PlannerEventCreateBody = {
  title: string;
  event_type: PlannerEventType;
  starts_at: string;
  ends_at?: string | null;
  timezone: string | null;
  child_profile_id?: string | null;
  team_profile_id?: string | null;
  tournament_id?: string | null;
  venue_id?: string | null;
  address_text?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
};

export type PlannerEventUpdateBody = Partial<PlannerEventCreateBody> & {
  title?: string;
  event_type?: PlannerEventType;
};
