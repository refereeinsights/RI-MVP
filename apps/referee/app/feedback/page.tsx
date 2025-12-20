import FeedbackForm from "./FeedbackForm";
import styles from "./feedback.module.css";

export const metadata = {
  title: "Feedback | Referee Insights",
  description: "Share feedback to improve Referee Insights.",
};

export default function FeedbackPage() {
  return (
    <div className={styles.feedbackPage}>
      <div className={styles.feedbackCard}>
        <h1>Help improve Referee Insights</h1>
        <p className={styles.intro}>
          Report bugs, request features, or share safety concerns.
        </p>
        <FeedbackForm />
      </div>
    </div>
  );
}
