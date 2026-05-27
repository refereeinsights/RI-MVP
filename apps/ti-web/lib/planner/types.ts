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
  source_type: PlannerSourceType | string;
  source_id: string | null;
  source_event_uid?: string | null;
  created_at: string;
  updated_at: string;
};

export type PlannerEventCreateBody = {
  title: string;
  event_type: PlannerEventType;
  starts_at: string;
  ends_at?: string | null;
  timezone: string | null;
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
