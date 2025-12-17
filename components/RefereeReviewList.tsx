import type { RefereeReviewPublic } from "@/lib/types/refereeReview";
import { badgeImagesForCodes } from "@/lib/badges";

type Props = {
  reviews: RefereeReviewPublic[];
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
  return (
    <span
      className={`whistleScale whistleScale--${size ?? "small"}`}
      aria-label={`${filled} out of 5 whistles`}
    >
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`whistleScale__icon ${index < filled ? "whistleScale__icon--filled" : ""}`}
        />
      ))}
    </span>
  );
}

export default function RefereeReviewList({ reviews }: Props) {
  if (!reviews.length) {
    return (
      <div className="reviewEmpty">
        <p>No referee feedback has been shared yet. Be the first to report back from the field.</p>
      </div>
    );
  }

  return (
    <div className="reviewList">
      {reviews.map((review) => (
        <article key={review.id} className="reviewCard">
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
                {formatDate(review.created_at)}
                {review.worked_games ? ` • ${review.worked_games} game${review.worked_games === 1 ? "" : "s"}` : ""}
                {review.reviewer_level ? ` • ${review.reviewer_level}` : ""}
              </div>
            </div>
            <div className="reviewCard__overall">
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
