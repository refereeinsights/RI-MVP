export type RefereeWhistleScoreStatus = "clear" | "needs_moderation";

export type RefereeWhistleScore = {
  tournament_id: string;
  ai_score: number | null;
  review_count: number;
  summary: string | null;
  status: RefereeWhistleScoreStatus;
  updated_at: string | null;
};

export type RefereeReviewPublic = {
  id: string;
  tournament_id: string;
  created_at: string;
  reviewer_handle: string;
  reviewer_level?: string | null;
  reviewer_badges?: string[] | null;
  is_demo?: boolean | null;
  pinned_rank?: number | null;
  worked_games?: number | null;
  overall_score: number;
  logistics_score: number;
  facilities_score: number;
  pay_score: number;
  support_score: number;
  sideline_score?: number | null;
  shift_detail?: string | null;
};
