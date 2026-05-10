export type TiAnalyticsEventName =
  | "map_viewed"
  | "map_filter_changed"
  | "map_state_clicked"
  | "homepage_cta_clicked"
  | "homepage_sport_chip_clicked"
  | "tournament_detail_more_in_state_clicked"
  | "venue_page_viewed"
  | "venue_map_opened"
  | "venue_map_loaded"
  | "venue_select"
  | "directions_click"
  | "hotels_click"
  | "venue_view_click"
  | "nearest_airport_click"
  | "owls_eye_full_opened"
  | "owls_eye_unlock_prompt_shown"
  | "owls_eye_category_expanded"
  | "owls_eye_category_pins_enabled"
  | "owls_eye_result_selected"
  | "owls_eye_directions_clicked"
  | "venue_map_hotels_clicked"
  | "weekend_share_clicked"
  | "weekend_page_opened";

type OwlsEyeMapCategory = "coffee" | "food" | "hotels" | "quick_eats" | "hangouts" | "sporting_goods";

export type TiAnalyticsEventPropertiesByName = {
  map_viewed: {
    page_type: "heatmap" | "homepage";
    sport: string;
  };
  map_filter_changed: {
    page_type: "heatmap" | "homepage";
    filter_name: "sport";
    old_value: string;
    new_value: string;
  };
  map_state_clicked: {
    page_type: "heatmap" | "homepage";
    sport: string;
    state: string;
    href: string;
  };
  homepage_cta_clicked: {
    cta: "explore_map" | "browse_tournaments" | "open_map_from_preview";
  };
  homepage_sport_chip_clicked: {
    sport: string;
  };
  tournament_detail_more_in_state_clicked: {
    page_type: "tournament_detail";
    tournament_slug: string;
    sport: string;
    state: string;
    href: string;
    link_kind: "upcoming" | "month";
    month: string | null;
  };
  venue_page_viewed: {
    page_type: "venue_index" | "venue_detail";
    href: string;
    venue_id: string | null;
    venue_slug: string | null;
    sport: string | null;
    state: string | null;
    source_tournament_id: string | null;
    source_tournament_slug: string | null;
  };
  venue_map_opened: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    sport: string | null;
    venue_count: number;
    href: string;
  };
  venue_map_loaded: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    sport: string | null;
    venue_count: number;
    href: string;
  };
  venue_select: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    venue_name: string | null;
    source: "venue_card" | "venue_marker" | "selected_venue_panel";
    hasCoordinates: boolean;
    hasOwlEyeData: boolean;
  };
  directions_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    venue_name: string | null;
    source: "venue_card" | "selected_venue_panel" | "venue_marker";
    provider: "apple" | "google" | "waze" | "copy";
    hasCoordinates: boolean;
    hasOwlEyeData: boolean;
  };
  hotels_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    venue_name: string | null;
    source: "venue_card" | "selected_venue_panel";
  };
  venue_view_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    venue_name: string | null;
    source: "venue_card" | "selected_venue_panel";
  };
  nearest_airport_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    venue_name: string | null;
    source: "selected_venue_panel";
    provider: "apple" | "google" | "waze" | "copy";
    airport_id: string;
    airport_name: string;
    airport_iata: string | null;
  };
  owls_eye_full_opened: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    tier: "explorer" | "insider" | "weekend_pro" | "unknown";
  };
  owls_eye_unlock_prompt_shown: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    tier: "explorer" | "insider" | "weekend_pro" | "unknown";
  };
  owls_eye_category_expanded: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    category: OwlsEyeMapCategory;
    tier: "explorer" | "insider" | "weekend_pro" | "unknown";
  };
  owls_eye_category_pins_enabled: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    category: OwlsEyeMapCategory;
    enabled: boolean;
    tier: "explorer" | "insider" | "weekend_pro" | "unknown";
  };
  owls_eye_result_selected: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    category: OwlsEyeMapCategory;
    has_coords: boolean;
    tier: "explorer" | "insider" | "weekend_pro" | "unknown";
  };
  owls_eye_directions_clicked: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    category: OwlsEyeMapCategory;
    tier: "explorer" | "insider" | "weekend_pro" | "unknown";
  };
  venue_map_hotels_clicked: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
  };
  weekend_share_clicked: {
    source_page: "tournament_detail" | "venue_map" | "venue_detail" | "weekend_page";
    channel: "copy" | "native" | "sms" | "email" | "unknown";
    tournament_slug: string;
    venue: string | null; // slug preferred; uuid when no slug exists
    share_url: string;
  };
  weekend_page_opened: {
    tournament_slug: string;
    venue: string | null;
    source: "share" | "unknown";
    utm_source: string | null;
    utm_medium: string | null;
  };
};
