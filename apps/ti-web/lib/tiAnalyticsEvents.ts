export type TiAnalyticsEventName =
  | "map_viewed"
  | "map_filter_changed"
  | "map_state_clicked"
  | "homepage_cta_clicked"
  | "homepage_sport_chip_clicked"
  | "tournament_detail_more_in_state_clicked";

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
};
