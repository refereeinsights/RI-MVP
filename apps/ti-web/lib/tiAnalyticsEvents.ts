export type TiAnalyticsEventName =
  | "map_viewed"
  | "map_filter_changed"
  | "map_state_clicked"
  | "homepage_cta_clicked"
  | "homepage_sport_chip_clicked"
  | "tournament_detail_more_in_state_clicked"
  | "tournament_detail_weekend_plan_clicked"
  | "tournament_detail_venue_map_clicked"
  | "tournament_detail_travel_search_clicked"
  | "venue_page_viewed"
  | "venue_map_opened"
  | "venue_map_loaded"
  | "venue_select"
  | "directions_click"
  | "hotels_click"
  | "venue_view_click"
  | "nearest_airport_click"
  | "owls_eye_limited_continue"
  | "owls_eye_preview_shown"
  | "owls_eye_preview_pin_click"
  | "owls_eye_preview_directions_click"
  | "owls_eye_preview_upgrade_click"
  | "owls_eye_preview_hotel_booking_click"
  | "owls_eye_full_opened"
  | "owls_eye_unlock_prompt_shown"
  | "owls_eye_category_expanded"
  | "owls_eye_category_pins_enabled"
  | "owls_eye_result_selected"
  | "owls_eye_directions_clicked"
  | "venue_map_hotels_clicked"
  | "weekend_share_clicked"
  | "weekend_page_opened"
  | "weekend_share_venue_map_clicked"
  | "weekend_share_travel_clicked"
  | "weekend_share_planner_hub_clicked"
  | "tournament_map_weekend_plan_clicked"
  | "tournament_map_back_to_tournament_clicked"
  | "weekend_planner_saved_tournament_clicked"
  | "weekend_planner_saved_weekend_plan_clicked"
  | "weekend_planner_saved_venue_map_clicked"
  | "weekend_planner_saved_travel_clicked"
  | "book_travel_viewed"
  | "book_travel_hotels_clicked"
  | "book_travel_vrbo_clicked"
  | "book_travel_shared"
  | "book_travel_search_by_city_clicked"
  | "book_travel_add_event_clicked"
  | "book_travel_tournament_directory_clicked"
  | "book_travel_weekend_pro_upsell_clicked";

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
  tournament_detail_weekend_plan_clicked: {
    page_type: "tournament_detail";
    tournament_id: string;
    tournament_slug: string;
    source_page: "tournament_detail";
    cta: "weekend_plan";
    href: string;
  };
  tournament_detail_venue_map_clicked: {
    page_type: "tournament_detail";
    tournament_id: string;
    tournament_slug: string;
    source_page: "tournament_detail";
    cta: "venue_map";
    href: string;
  };
  tournament_detail_travel_search_clicked: {
    page_type: "tournament_detail";
    tournament_id: string;
    tournament_slug: string;
    source_page: "tournament_detail";
    cta: "travel_search";
    href: string;
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
  owls_eye_limited_continue: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
  };
  owls_eye_preview_shown: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
  };
  owls_eye_preview_pin_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    category: OwlsEyeMapCategory;
    has_coords: boolean;
  };
  owls_eye_preview_directions_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    category: OwlsEyeMapCategory;
    place_id: string | null;
    source: "preview_card" | "map_preview_pin";
    provider: "apple" | "google" | "waze" | "copy";
    has_coords: boolean;
  };
  owls_eye_preview_upgrade_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    source: "preview_card" | "limited_banner";
  };
  owls_eye_preview_hotel_booking_click: {
    page_type: "venue_map";
    tournament_id: string;
    tournament_slug: string;
    venue_id: string;
    place_id: string | null;
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
  weekend_share_venue_map_clicked: {
    page_type: "weekend_share";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_share";
    cta: "venue_map";
    href: string;
  };
  weekend_share_travel_clicked: {
    page_type: "weekend_share";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_share";
    cta: "travel_search";
    href: string;
    travel_kind: "hotels" | "rentals" | "book_travel";
  };
  weekend_share_planner_hub_clicked: {
    page_type: "weekend_share";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_share";
    cta: "planner_hub";
    href: string;
  };
  tournament_map_weekend_plan_clicked: {
    page_type: "tournament_map";
    tournament_id: string;
    tournament_slug: string;
    source_page: "tournament_map";
    cta: "weekend_plan";
    href: string;
    venue: string | null;
  };
  tournament_map_back_to_tournament_clicked: {
    page_type: "tournament_map";
    tournament_id: string;
    tournament_slug: string;
    source_page: "tournament_map";
    cta: "back_to_tournament";
    href: string;
  };
  weekend_planner_saved_tournament_clicked: {
    page_type: "weekend_planner";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_planner";
    cta: "open_tournament";
    href: string;
  };
  weekend_planner_saved_weekend_plan_clicked: {
    page_type: "weekend_planner";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_planner";
    cta: "weekend_plan";
    href: string;
  };
  weekend_planner_saved_venue_map_clicked: {
    page_type: "weekend_planner";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_planner";
    cta: "venue_map";
    href: string;
  };
  weekend_planner_saved_travel_clicked: {
    page_type: "weekend_planner";
    tournament_id: string;
    tournament_slug: string;
    source_page: "weekend_planner";
    cta: "travel";
    href: string;
  };
  book_travel_viewed: Record<string, never>;
  book_travel_hotels_clicked: {
    destination_present: boolean;
    has_dates: boolean;
  };
  book_travel_vrbo_clicked: {
    destination_present: boolean;
    has_dates: boolean;
  };
  book_travel_shared: {
    channel: "copy" | "native";
    share_url: string;
  };
  book_travel_search_by_city_clicked: Record<string, never>;
  book_travel_add_event_clicked: Record<string, never>;
  book_travel_tournament_directory_clicked: Record<string, never>;
  book_travel_weekend_pro_upsell_clicked: Record<string, never>;
};
