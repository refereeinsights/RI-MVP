import type { Metadata } from "next";

import {
  buildHotelSupportTermsV2,
  resolvePublicHotelSupportInvitation,
} from "@/lib/hotelSupportEnrollment";
import EnrollmentForm from "./EnrollmentForm";
import { submitHotelSupportEnrollmentAction } from "./actions";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tournament Hotel Support Enrollment | TournamentInsights",
  description: "Review and submit a private Tournament Hotel Support enrollment invitation.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

function formatTournamentDates(startDate: string | null, endDate: string | null) {
  if (!startDate) return "Dates to be announced";
  const format = (value: string) => new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
  return endDate && endDate !== startDate ? `${format(startDate)}–${format(endDate)}` : format(startDate);
}

function formatExpiration(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatTournamentSupportRate(rateCents: number) {
  return `$${rateCents / 100} per eligible room night`;
}

export default async function HotelSupportEnrollmentPage({ params }: { params: { token: string } }) {
  const result = await resolvePublicHotelSupportInvitation(params.token);
  if (result.kind === "unavailable") {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Tournament Hotel Support · Enrollment</div>
          <h1>Enrollment invitation unavailable</h1>
          <p>This private enrollment link is invalid, expired, revoked, or not available yet.</p>
          <p>Please contact the TournamentInsights team for a replacement invitation.</p>
        </section>
      </main>
    );
  }

  const invitation = result.invitation;
  if (invitation.status === "submitted") {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.eyebrow}>Tournament Hotel Support · Enrollment</div>
          <h1>Enrollment received</h1>
          <p>We received your Tournament Hotel Support enrollment for <strong>{invitation.tournamentName}</strong>.</p>
          <p>We’ll review it and confirm when your program is active.</p>
          <p>Enrollment and approval do not activate the program. We’ll confirm when your tournament is active.</p>
        </section>
      </main>
    );
  }

  const boundAction = submitHotelSupportEnrollmentAction.bind(null, params.token);
  return (
    <main className={styles.shell}>
      <article className={styles.card}>
        <div className={styles.eyebrow}>Tournament Hotel Support · Enrollment</div>
        <h1>Help your teams find hotels and support your tournament</h1>
        <p className={styles.intro}>TournamentInsights gives your tournament a dedicated hotel page to share with teams and families. When families book eligible hotels through your page, those bookings can generate support proceeds for your tournament.</p>
        <p className={styles.noManagement}>There’s nothing new for you to manage.</p>

        <section className={styles.summary} aria-labelledby="invitation-summary">
          <h2 id="invitation-summary">Invitation details</h2>
          <dl>
            <div><dt>Tournament</dt><dd>{invitation.tournamentName}</dd></div>
            <div><dt>Dates</dt><dd>{formatTournamentDates(invitation.startDate, invitation.endDate)}</dd></div>
            <div><dt>Location</dt><dd>{[invitation.city, invitation.state].filter(Boolean).join(", ") || "To be announced"}</dd></div>
            <div><dt>Tournament support</dt><dd>{formatTournamentSupportRate(invitation.offeredRateCents)}</dd></div>
            <div><dt>Invitation valid through</dt><dd>{formatExpiration(invitation.expiresAt)}</dd></div>
          </dl>
          {invitation.hotelPageUrl ? (
            <a href={invitation.hotelPageUrl} target="_blank" rel="noopener noreferrer">
              View tournament hotel page
            </a>
          ) : null}
        </section>

        <EnrollmentForm
          action={boundAction}
          tournamentName={invitation.tournamentName}
          termsText={buildHotelSupportTermsV2(invitation.offeredRateCents)}
        />
      </article>
    </main>
  );
}
