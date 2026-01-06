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

function formatWhistles(score: number | null) {
  if (score === null || Number.isNaN(score)) return null;
  const whistles = Math.round((score / 20) * 10) / 10;
  return whistles % 1 === 0 ? whistles.toFixed(0) : whistles.toFixed(1);
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
  const awaiting = score === null || Number.isNaN(score);
  const whistles = formatWhistles(score);
  const label = awaiting || !whistles ? "Not reviewed" : `${whistles} whistle${Number(whistles) === 1 ? "" : "s"}`;
  const tooltip = summary
    ? `${label} • ${summary}`
    : awaiting
    ? "No referee reviews yet"
    : `${label} from referees`;

  const whistleValue = whistles ? Number(whistles) : null;
  let iconPath = "/shared-assets/svg/ri/yellow_card_transparent.svg";
  if (whistleValue !== null) {
    if (whistleValue < 2) iconPath = "/shared-assets/svg/ri/red_card_transparent.svg";
    else if (whistleValue > 3.7) iconPath = "/shared-assets/svg/ri/green_card_transparent.svg";
    else iconPath = "/shared-assets/svg/ri/yellow_card_transparent.svg";
  }
  const iconStyle: React.CSSProperties = {
    backgroundImage: `url(${iconPath})`,
  };

  return (
    <div
      className={`whistleBadge whistleBadge--${tone} ${
        size === "large" ? "whistleBadge--large" : ""
      }`}
      title={tooltip}
    >
      <div className="whistleBadge__icon" aria-hidden style={iconStyle} />
      <div className="whistleBadge__meta">
        <div className={`whistleBadge__score ${awaiting ? "whistleBadge__score--wide" : ""}`}>{label}</div>
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
