export type TiAnalyticsEventName =
  | "map_viewed"
  | "map_filter_changed"
  | "map_state_clicked"
  | "homepage_cta_clicked"
  | "homepage_sport_chip_clicked"
  | "tournament_detail_more_in_state_clicked"
  | "venue_page_viewed"
  | "weekend_share_clicked"
  | "weekend_page_opened";

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
