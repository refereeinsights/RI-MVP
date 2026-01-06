import type { RefereeReviewPublic } from "@/lib/types/refereeReview";
import { badgeImagesForCodes } from "@/lib/badges";

type ReviewWithSchool = RefereeReviewPublic & {
  // optional school info for listings like /schools
  school_name?: string | null;
  school_city?: string | null;
  school_state?: string | null;
  sport?: string | null;
};

type Props = {
  reviews: ReviewWithSchool[];
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function clampScore(score: number | null | undefined) {
  const value = Number(score);
  if (!Number.isFinite(value)) return 1;
  return Math.min(5, Math.max(1, Math.round(value)));
}

function WhistleScale({ score, size }: { score: number; size?: "small" | "large" }) {
  const filled = clampScore(score);
  const iconForIndex = (index: number) => {
    if (index >= filled) {
      return {
        url: null,
        filter: undefined,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderColor: "rgba(255,255,255,0.7)",
      };
    }
    const whistleEquivalent = (index + 1) * (5 / 5); // map position to 1-5
    if (whistleEquivalent < 2)
      return {
        url: "/shared-assets/svg/ri/red_card_transparent.svg",
        filter: "brightness(1.1)",
        backgroundColor: "#ef4444",
        borderColor: "#ef4444",
      };
    if (whistleEquivalent > 3.7)
      return {
        url: "/shared-assets/svg/ri/green_card_transparent.svg",
        filter: "brightness(1.2) saturate(1.3)",
        backgroundColor: "#22c55e",
        borderColor: "#22c55e",
      };
    return {
      url: "/shared-assets/svg/ri/yellow_card_transparent.svg",
      filter: "brightness(1.1)",
      backgroundColor: "#facc15",
      borderColor: "#facc15",
    };
  };
  return (
    <span
      className={`whistleScale whistleScale--${size ?? "small"}`}
      aria-label={`${filled} out of 5 whistles`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`whistleScale__icon ${index < filled ? "whistleScale__icon--filled" : ""}`}
          style={{
            backgroundImage: iconForIndex(index).url ? `url(${iconForIndex(index).url})` : undefined,
            filter: iconForIndex(index).filter,
            backgroundColor: iconForIndex(index).backgroundColor,
            borderColor: iconForIndex(index).borderColor ?? "rgba(255,255,255,0.7)",
          }}
        />
      ))}
    </span>
  );
}

function reviewSportClass(sport?: string | null) {
  const normalized = sport?.toLowerCase();
  if (normalized === "soccer") return "reviewCard--soccer";
  if (normalized === "basketball") return "reviewCard--basketball";
  if (normalized === "football") return "reviewCard--football";
  return "";
}

export default function RefereeReviewList({ reviews }: Props) {
  if (!reviews.length) {
    return (
      <div className="reviewEmpty">
        <p style={{ color: "#ffffff", textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
          No referee feedback has been shared yet. Be the first to report back from the field.
        </p>
      </div>
    );
  }

  return (
    <div className="reviewList">
      {reviews.map((review) => (
        <article key={review.id} className={`reviewCard ${reviewSportClass(review.sport)}`}>
          <header className="reviewCard__header">
            <div>
              <div className="reviewCard__handle">
                {review.reviewer_handle}
            {review.reviewer_badges && review.reviewer_badges.length > 0 && (
              <span className="reviewCard__badges">
                {badgeImagesForCodes(review.reviewer_badges).map((image) => (
                  <img
                        key={`${review.id}-${image.src}`}
                        src={image.src}
                        alt={image.alt}
                        loading="lazy"
                      />
                    ))}
                  </span>
                )}
              </div>
              <div className="reviewCard__meta">
                {review.school_name && (
                  <>
                    <strong>{review.school_name}</strong>
                    <span>
                      {" "}
                      • {[review.school_city, review.school_state].filter(Boolean).join(", ")}
                    </span>
                    <br />
                  </>
                )}
                {formatDate(review.created_at)}
                {review.worked_games ? ` • ${review.worked_games} game${review.worked_games === 1 ? "" : "s"}` : ""}
                {review.reviewer_level ? ` • ${review.reviewer_level}` : ""}
              </div>
            </div>
            <div className="reviewCard__overall">
              {review.sport && (
                <span className="reviewCard__sport">{review.sport}</span>
              )}
              <WhistleScale score={review.overall_score} size="large" />
            </div>
          </header>

          <dl className="reviewCard__scores">
            {[
              { label: "Logistics", value: review.logistics_score },
              { label: "Facilities", value: review.facilities_score },
              { label: "Pay", value: review.pay_score },
              { label: "Support", value: review.support_score },
            ].map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  <WhistleScale score={item.value} />
                </dd>
              </div>
            ))}
          </dl>

          {review.shift_detail && (
            <p className="reviewCard__body">
              {review.shift_detail}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
