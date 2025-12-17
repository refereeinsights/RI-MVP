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
      created_at?: string;
      updated_at?: string;
    };
    Relationships: [];
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
