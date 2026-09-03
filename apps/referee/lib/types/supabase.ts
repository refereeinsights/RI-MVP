export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: {
    foreignKeyName: string;
    columns: string[];
    referencedRelation: string;
    referencedColumns: string[];
  }[];
};

type PublicTables = {
  tournament_roll_forward_log: {
    Row: {
      id: string;
      parent_tournament_id: string;
      target_year: number;
      batch_label: string | null;
      status: "pending" | "no_dates_announced" | "discontinued" | "done" | "ambiguous" | "ready_to_create" | "linked_existing";
      sibling_id: string | null;
      notes: string | null;
      researched_at: string | null;
      created_at: string;
      updated_at: string;
      // Research-tool staging fields (written by upsert_roll_forward_log MCP tool)
      target_name: string | null;
      target_start_date: string | null;
      target_end_date: string | null;
      target_source_url: string | null;
      target_venue_name: string | null;
      target_venue_address: string | null;
      target_venue_city: string | null;
      target_venue_state: string | null;
      target_venue_source_url: string | null;
      target_organizer_domain: string | null;
      production_match_id: string | null;
      match_confidence: string | null;
      recommended_action: string | null;
      verified_dates: boolean | null;
      verified_source: boolean | null;
      verified_venue: boolean | null;
      verified_youth_scope: boolean | null;
      last_checked_at: string | null;
      next_check_at: string | null;
    };
    Insert: {
      id?: string;
      parent_tournament_id: string;
      target_year: number;
      batch_label?: string | null;
      status: "pending" | "no_dates_announced" | "discontinued" | "done" | "ambiguous" | "ready_to_create" | "linked_existing";
      sibling_id?: string | null;
      notes?: string | null;
      researched_at?: string | null;
      created_at?: string;
      updated_at?: string;
      target_name?: string | null;
      target_start_date?: string | null;
      target_end_date?: string | null;
      target_source_url?: string | null;
      target_venue_name?: string | null;
      target_venue_address?: string | null;
      target_venue_city?: string | null;
      target_venue_state?: string | null;
      target_venue_source_url?: string | null;
      target_organizer_domain?: string | null;
      production_match_id?: string | null;
      match_confidence?: string | null;
      recommended_action?: string | null;
      verified_dates?: boolean | null;
      verified_source?: boolean | null;
      verified_venue?: boolean | null;
      verified_youth_scope?: boolean | null;
      last_checked_at?: string | null;
      next_check_at?: string | null;
    };
    Update: {
      id?: string;
      parent_tournament_id?: string;
      target_year?: number;
      batch_label?: string | null;
      status?: "pending" | "no_dates_announced" | "discontinued" | "done" | "ambiguous" | "ready_to_create" | "linked_existing";
      sibling_id?: string | null;
      notes?: string | null;
      researched_at?: string | null;
      created_at?: string;
      updated_at?: string;
      target_name?: string | null;
      target_start_date?: string | null;
      target_end_date?: string | null;
      target_source_url?: string | null;
      target_venue_name?: string | null;
      target_venue_address?: string | null;
      target_venue_city?: string | null;
      target_venue_state?: string | null;
      target_venue_source_url?: string | null;
      target_organizer_domain?: string | null;
      production_match_id?: string | null;
      match_confidence?: string | null;
      recommended_action?: string | null;
      verified_dates?: boolean | null;
      verified_source?: boolean | null;
      verified_venue?: boolean | null;
      verified_youth_scope?: boolean | null;
      last_checked_at?: string | null;
      next_check_at?: string | null;
    };
    Relationships: [
      {
        foreignKeyName: "tournament_roll_forward_log_parent_tournament_id_fkey";
        columns: ["parent_tournament_id"];
        referencedRelation: "tournaments";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "tournament_roll_forward_log_sibling_id_fkey";
        columns: ["sibling_id"];
        referencedRelation: "tournaments";
        referencedColumns: ["id"];
      }
    ];
  };
  referee_contacts: {
    Row: {
      id: string;
      name: string | null;
      organization: string | null;
      role: string | null;
      email: string | null;
      phone: string | null;
      state: string | null;
      city: string | null;
      notes: string | null;
      source_url: string | null;
      type: "assignor" | "director" | "general" | "referee_coordinator";
      status: "pending" | "verified" | "rejected";
      confidence: number | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      name?: string | null;
      organization?: string | null;
      role?: string | null;
      email?: string | null;
      phone?: string | null;
      state?: string | null;
      city?: string | null;
      notes?: string | null;
      source_url?: string | null;
      type?: "assignor" | "director" | "general" | "referee_coordinator";
      status?: "pending" | "verified" | "rejected";
      confidence?: number | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      name?: string | null;
      organization?: string | null;
      role?: string | null;
      email?: string | null;
      phone?: string | null;
      state?: string | null;
      city?: string | null;
      notes?: string | null;
      source_url?: string | null;
      type?: "assignor" | "director" | "general" | "referee_coordinator";
      status?: "pending" | "verified" | "rejected";
      confidence?: number | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
  };
  tournament_referee_contacts: {
    Row: {
      id: string;
      tournament_id: string;
      referee_contact_id: string;
      notes: string | null;
      created_at: string;
    };
    Insert: {
      id?: string;
      tournament_id: string;
      referee_contact_id: string;
      notes?: string | null;
      created_at?: string;
    };
    Update: {
      id?: string;
      tournament_id?: string;
      referee_contact_id?: string;
      notes?: string | null;
      created_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "tournament_referee_contacts_referee_contact_id_fkey";
        columns: ["referee_contact_id"];
        referencedRelation: "referee_contacts";
        referencedColumns: ["id"];
      },
      {
        foreignKeyName: "tournament_referee_contacts_tournament_id_fkey";
        columns: ["tournament_id"];
        referencedRelation: "tournaments";
        referencedColumns: ["id"];
      }
    ];
  };
  tournament_contacts: {
    Row: {
      id: string;
      tournament_id: string | null;
      type: "assignor" | "director" | "general";
      name: string | null;
      email: string | null;
      phone: string | null;
      source_url: string | null;
      confidence: number | null;
      status: "pending" | "verified" | "rejected";
      notes: string | null;
      created_at: string;
      updated_at: string;
    };
    Insert: {
      id?: string;
      tournament_id?: string | null;
      type?: "assignor" | "director" | "general";
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      source_url?: string | null;
      confidence?: number | null;
      status?: "pending" | "verified" | "rejected";
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Update: {
      id?: string;
      tournament_id?: string | null;
      type?: "assignor" | "director" | "general";
      name?: string | null;
      email?: string | null;
      phone?: string | null;
      source_url?: string | null;
      confidence?: number | null;
      status?: "pending" | "verified" | "rejected";
      notes?: string | null;
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [
      {
        foreignKeyName: "tournament_contacts_tournament_id_fkey";
        columns: ["tournament_id"];
        referencedRelation: "tournaments";
        referencedColumns: ["id"];
      }
    ];
  };
} & {
  [key: string]: GenericTable;
};

export interface Database {
  public: {
    Tables: PublicTables;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TournamentContactRow =
  Database["public"]["Tables"]["tournament_contacts"]["Row"];
export type TournamentContactInsert =
  Database["public"]["Tables"]["tournament_contacts"]["Insert"];
export type TournamentContactUpdate =
  Database["public"]["Tables"]["tournament_contacts"]["Update"];

export type RefereeContactRow =
  Database["public"]["Tables"]["referee_contacts"]["Row"];
export type RefereeContactInsert =
  Database["public"]["Tables"]["referee_contacts"]["Insert"];
export type RefereeContactUpdate =
  Database["public"]["Tables"]["referee_contacts"]["Update"];

export type TournamentRefereeContactRow =
  Database["public"]["Tables"]["tournament_referee_contacts"]["Row"];
export type TournamentRefereeContactInsert =
  Database["public"]["Tables"]["tournament_referee_contacts"]["Insert"];
export type TournamentRefereeContactUpdate =
  Database["public"]["Tables"]["tournament_referee_contacts"]["Update"];

export type RollForwardStatus =
  Database["public"]["Tables"]["tournament_roll_forward_log"]["Row"]["status"];
export type TournamentRollForwardLogRow =
  Database["public"]["Tables"]["tournament_roll_forward_log"]["Row"];
export type TournamentRollForwardLogInsert =
  Database["public"]["Tables"]["tournament_roll_forward_log"]["Insert"];
export type TournamentRollForwardLogUpdate =
  Database["public"]["Tables"]["tournament_roll_forward_log"]["Update"];
