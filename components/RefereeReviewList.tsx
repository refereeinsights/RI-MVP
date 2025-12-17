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
            <div className="reviewCard__overall">{Math.round(review.overall_score)}%</div>
          </header>

          <dl className="reviewCard__scores">
            <div>
              <dt>Logistics</dt>
              <dd>{Math.round(review.logistics_score)}%</dd>
            </div>
            <div>
              <dt>Facilities</dt>
              <dd>{Math.round(review.facilities_score)}%</dd>
            </div>
            <div>
              <dt>Pay &amp; Support</dt>
              <dd>{Math.round((review.pay_score + review.support_score) / 2)}%</dd>
            </div>
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
