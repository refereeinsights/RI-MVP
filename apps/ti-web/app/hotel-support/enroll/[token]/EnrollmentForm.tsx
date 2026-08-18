"use client";

import { useFormState, useFormStatus } from "react-dom";

import type { HotelSupportEnrollmentActionState } from "@/lib/hotelSupportEnrollment";
import styles from "./page.module.css";

type Action = (
  previousState: HotelSupportEnrollmentActionState,
  formData: FormData
) => Promise<HotelSupportEnrollmentActionState>;

const INITIAL_STATE: HotelSupportEnrollmentActionState = { status: "idle", message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className={styles.submitButton} type="submit" disabled={pending}>
      {pending ? "Enrolling…" : "Enroll my tournament"}
    </button>
  );
}

export default function EnrollmentForm({
  action,
  tournamentName,
  termsText,
}: {
  action: Action;
  tournamentName: string;
  termsText: string;
}) {
  const [state, formAction] = useFormState(action, INITIAL_STATE);

  if (state.status === "submitted") {
    return (
      <section className={styles.confirmation} aria-labelledby="enrollment-received">
        <h2 id="enrollment-received">Enrollment received</h2>
        <p>We received your Tournament Hotel Support enrollment for <strong>{state.tournamentName || tournamentName}</strong>.</p>
        <p>We’ll review it and confirm when your program is active.</p>
        <p>Once activated, we’ll provide your TournamentInsights hotel page and simple materials you can share with teams and families.</p>
      </section>
    );
  }

  return (
    <form className={styles.form} action={formAction}>
      <fieldset className={styles.fieldset}>
        <legend>Your contact information</legend>
        <div className={styles.fieldGrid}>
          <label>
            Name
            <input name="contact_name" required maxLength={160} autoComplete="name" />
          </label>
          <label>
            Email
            <input name="contact_email" required maxLength={320} type="email" autoComplete="email" />
          </label>
          <label>
            Phone <span>(optional)</span>
            <input name="contact_phone" maxLength={50} type="tel" autoComplete="tel" />
          </label>
          <label>
            Role/title <span>(optional)</span>
            <input name="contact_title" maxLength={120} autoComplete="organization-title" />
          </label>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Who should receive the tournament support proceeds?</legend>
        <p className={styles.fieldHelp}>We’ll confirm payment and tax details with you before any proceeds are paid.</p>
        <div className={styles.fieldGrid}>
          <label>
            Recipient type
            <select name="expected_recipient_type" required defaultValue="">
              <option value="" disabled>Select one</option>
              <option value="tournament_organization">Tournament organization</option>
              <option value="nonprofit_booster">Nonprofit / booster organization</option>
              <option value="business">Business / club</option>
              <option value="other">Other organization</option>
            </select>
          </label>
          <label>
            Recipient name
            <input name="expected_recipient_name" required maxLength={200} autoComplete="organization" />
          </label>
        </div>
      </fieldset>

      <section className={styles.terms} aria-labelledby="program-terms">
        <h2 id="program-terms">Tournament Hotel Support Program Terms</h2>
        <div className={styles.termsText}>
          {termsText.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </div>
      </section>

      <fieldset className={styles.confirmations}>
        <legend>Required confirmations</legend>
        <label><input type="checkbox" name="confirm_authority" required /> I am authorized to enroll this tournament.</label>
        <label><input type="checkbox" name="confirm_housing_eligibility" required /> To the best of my knowledge, participation does not conflict with a mandatory, exclusive, or stay-to-play lodging arrangement.</label>
        <label><input type="checkbox" name="confirm_terms" required /> I have read and agree to the Tournament Hotel Support Program Terms.</label>
      </fieldset>

      {state.status === "error" ? <p className={styles.error} role="alert">{state.message}</p> : null}
      <SubmitButton />
      <p className={styles.activationNotice}>Enrollment does not activate the program. We’ll review it and confirm when your tournament is active.</p>
    </form>
  );
}
