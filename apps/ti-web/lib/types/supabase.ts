export interface Database {
  public: {
    Tables: {
      ti_users: {
        Row: {
          id: string;
          email: string | null;
          created_at: string;
          first_seen_at: string | null;
          last_seen_at: string | null;
          status: string;
          signup_source: string;
          signup_source_code: string | null;
          plan: string;
          subscription_status: string;
          current_period_start: string | null;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          trial_ends_at: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          display_name: string | null;
          username: string | null;
          reviewer_handle: string | null;
          zip_code: string | null;
          sports_interests: string[];
          terms_accepted_at: string | null;
          marketing_opt_in: boolean;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          status?: string;
          signup_source?: string;
          signup_source_code?: string | null;
          plan?: string;
          subscription_status?: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          trial_ends_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          display_name?: string | null;
          username?: string | null;
          reviewer_handle?: string | null;
          zip_code?: string | null;
          sports_interests?: string[];
          terms_accepted_at?: string | null;
          marketing_opt_in?: boolean;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          first_seen_at?: string | null;
          last_seen_at?: string | null;
          status?: string;
          signup_source?: string;
          signup_source_code?: string | null;
          plan?: string;
          subscription_status?: string;
          current_period_start?: string | null;
          current_period_end?: string | null;
          cancel_at_period_end?: boolean;
          trial_ends_at?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          display_name?: string | null;
          username?: string | null;
          reviewer_handle?: string | null;
          zip_code?: string | null;
          sports_interests?: string[];
          terms_accepted_at?: string | null;
          marketing_opt_in?: boolean;
          updated_at?: string;
        };
      };
      ti_premium_interest: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          created_at?: string;
        };
      };
      ti_saved_tournaments: {
        Row: {
          id: string;
          user_id: string;
          tournament_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          tournament_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          tournament_id?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
