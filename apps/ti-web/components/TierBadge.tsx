import Link from "next/link";
import styles from "./TierBadge.module.css";

type TierBadgeProps = {
  tier: "explorer" | "insider" | "weekend_pro";
  unverified?: boolean;
};

export default function TierBadge({ tier, unverified = false }: TierBadgeProps) {
  if (unverified) {
    return (
      <Link href="/verify-email" className={`${styles.badge} ${styles.unverified}`} aria-label="Verify email">
        Verify email
      </Link>
    );
  }

  if (tier === "weekend_pro") {
    return (
      <span className={`${styles.badge} ${styles.weekendPro}`} aria-label="Weekend Pro tier">
        Weekend Pro
      </span>
    );
  }

  if (tier === "insider") {
    return (
      <span className={`${styles.badge} ${styles.insider}`} aria-label="Insider tier">
        Insider
      </span>
    );
  }

  return (
    <span className={`${styles.badge} ${styles.explorer}`} aria-label="Explorer tier">
      Explorer
    </span>
  );
}
