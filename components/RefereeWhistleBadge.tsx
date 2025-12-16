import type { RefereeWhistleScoreStatus } from "@/lib/types/refereeReview";

type Props = {
  score: number | null;
  reviewCount?: number;
  summary?: string | null;
  status?: RefereeWhistleScoreStatus;
  size?: "small" | "large";
  showLabel?: boolean;
};

function toneFromScore(
  score: number | null,
  status: RefereeWhistleScoreStatus | undefined
): "green" | "yellow" | "red" | "muted" {
  if (status === "needs_moderation") return "red";
  if (score === null || Number.isNaN(score)) return "muted";
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

export default function RefereeWhistleBadge({
  score,
  reviewCount = 0,
  summary,
  status,
  size = "small",
  showLabel = false,
}: Props) {
  const tone = toneFromScore(score, status);
  const label =
    score === null || Number.isNaN(score) ? "Awaiting refs" : `${Math.round(score)}%`;
  const tooltip = summary
    ? `${label} • ${summary}`
    : score === null
    ? "No referee reviews yet"
    : `${label} whistle score from referees`;

  return (
    <div
      className={`whistleBadge whistleBadge--${tone} ${
        size === "large" ? "whistleBadge--large" : ""
      }`}
      title={tooltip}
    >
      <div className="whistleBadge__icon" aria-hidden>
        <svg
          width={24}
          height={24}
          viewBox="0 0 24 24"
          role="img"
          aria-label="Referee whistle"
        >
          <path
            fill="currentColor"
            d="M4 10a5 5 0 0 1 5-5h9.5a1.5 1.5 0 0 1 1.5 1.5V9h.5a1.5 1.5 0 0 1 0 3H20l-.65 2.27A5.5 5.5 0 0 1 9.06 18H6a4 4 0 0 1-4-4v-2.5A1.5 1.5 0 0 1 3.5 10Zm2 0v1.5H5.5a.5.5 0 0 0-.5.5V14a2 2 0 0 0 2 2H9a3.5 3.5 0 0 0 3.45-3.05l.05-.45A3.5 3.5 0 0 0 9 9H6Z"
          />
        </svg>
      </div>
      <div className="whistleBadge__meta">
        <div className="whistleBadge__score">{label}</div>
        {showLabel && (
          <div className="whistleBadge__label">
            {status === "needs_moderation" ? "Under review" : "Referee score"}
          </div>
        )}
        <div className="whistleBadge__reviews">
          {reviewCount > 0 ? `${reviewCount} review${reviewCount === 1 ? "" : "s"}` : "No reviews"}
        </div>
      </div>
    </div>
  );
}
