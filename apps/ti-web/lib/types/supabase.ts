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
          last_invoice_id: string | null;
          last_payment_intent_id: string | null;
          display_name: string | null;
          username: string | null;
          reviewer_handle: string | null;
          zip_code: string | null;
          sports_interests: string[];
          terms_accepted_at: string | null;
          marketing_opt_in: boolean;
          qvc_pending_quick_check_id: string | null;
          qvc_pending_browser_hash: string | null;
          qvc_pending_set_at: string | null;
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
          last_invoice_id?: string | null;
          last_payment_intent_id?: string | null;
          display_name?: string | null;
          username?: string | null;
          reviewer_handle?: string | null;
          zip_code?: string | null;
          sports_interests?: string[];
          terms_accepted_at?: string | null;
          marketing_opt_in?: boolean;
          qvc_pending_quick_check_id?: string | null;
          qvc_pending_browser_hash?: string | null;
          qvc_pending_set_at?: string | null;
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
          last_invoice_id?: string | null;
          last_payment_intent_id?: string | null;
          display_name?: string | null;
          username?: string | null;
          reviewer_handle?: string | null;
          zip_code?: string | null;
          sports_interests?: string[];
          terms_accepted_at?: string | null;
          marketing_opt_in?: boolean;
          qvc_pending_quick_check_id?: string | null;
          qvc_pending_browser_hash?: string | null;
          qvc_pending_set_at?: string | null;
          updated_at?: string;
        };
      };
      stripe_webhook_events: {
        Row: {
          id: string;
          created_at: string;
          stripe_event_id: string;
          event_type: string;
          livemode: boolean;
          user_id: string | null;
          customer_id: string | null;
          subscription_id: string | null;
          status: string;
          error_message: string | null;
          payload: unknown | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          stripe_event_id: string;
          event_type: string;
          livemode: boolean;
          user_id?: string | null;
          customer_id?: string | null;
          subscription_id?: string | null;
          status?: string;
          error_message?: string | null;
          payload?: unknown | null;
        };
        Update: {
          created_at?: string;
          stripe_event_id?: string;
          event_type?: string;
          livemode?: boolean;
          user_id?: string | null;
          customer_id?: string | null;
          subscription_id?: string | null;
          status?: string;
          error_message?: string | null;
          payload?: unknown | null;
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
          notify_on_changes: boolean;
          last_notified_at: string | null;
          last_notified_hash: string | null;
          last_notified_critical_hash: string | null;
          last_notified_snapshot: unknown | null;
        };
        Insert: {
          user_id: string;
          tournament_id: string;
          created_at?: string;
          notify_on_changes?: boolean;
          last_notified_at?: string | null;
          last_notified_hash?: string | null;
          last_notified_critical_hash?: string | null;
          last_notified_snapshot?: unknown | null;
        };
        Update: {
          user_id?: string;
          tournament_id?: string;
          created_at?: string;
          notify_on_changes?: boolean;
          last_notified_at?: string | null;
          last_notified_hash?: string | null;
          last_notified_critical_hash?: string | null;
          last_notified_snapshot?: unknown | null;
        };
      };
      user_tournament_alerts: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          zip_code: string;
          radius_miles: number;
          days_ahead: number;
          sport: string | null;
          cadence: string;
          is_active: boolean;
          last_sent_at: string | null;
          last_result_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name?: string | null;
          zip_code: string;
          radius_miles: number;
          days_ahead: number;
          sport?: string | null;
          cadence: string;
          is_active?: boolean;
          last_sent_at?: string | null;
          last_result_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string | null;
          zip_code?: string;
          radius_miles?: number;
          days_ahead?: number;
          sport?: string | null;
          cadence?: string;
          is_active?: boolean;
          last_sent_at?: string | null;
          last_result_hash?: string | null;
          updated_at?: string;
        };
      };
      cron_job_locks: {
        Row: {
          key: string;
          locked_until: string;
          locked_at: string;
          locked_by: string | null;
        };
        Insert: {
          key: string;
          locked_until: string;
          locked_at?: string;
          locked_by?: string | null;
        };
        Update: {
          locked_until?: string;
          locked_at?: string;
          locked_by?: string | null;
        };
      };
      ti_tournament_alert_send_logs: {
        Row: {
          id: string;
          created_at: string;
          alert_id: string | null;
          user_id: string | null;
          cadence: string | null;
          recipient_email: string | null;
          tournaments_count: number | null;
          result_hash: string | null;
          outcome: string;
          error_message: string | null;
        };
        Insert: {
          alert_id?: string | null;
          user_id?: string | null;
          cadence?: string | null;
          recipient_email?: string | null;
          tournaments_count?: number | null;
          result_hash?: string | null;
          outcome: string;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          cadence?: string | null;
          recipient_email?: string | null;
          tournaments_count?: number | null;
          result_hash?: string | null;
          outcome?: string;
          error_message?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
