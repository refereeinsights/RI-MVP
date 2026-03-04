import Link from "next/link";
import ListYourTournamentForm from "@/app/list-your-tournament/ListYourTournamentForm";
import { getTournamentDuplicateMatchById } from "@/lib/tournamentDuplicateMatch";
import { TI_SPORTS, TI_SPORT_LABELS, type TiSport } from "@/lib/tiSports";
import styles from "./VerifyYourTournamentPage.module.css";

export const metadata = {
  title: "Verify Your Tournament",
  description:
    "Confirm your tournament details to unlock Staff Verified status, improve visibility, and highlight sponsor planning links.",
  alternates: { canonical: "/verify-your-tournament" },
};

function normalizeVerifySport(raw: string | string[] | undefined): TiSport {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return TI_SPORTS.includes(normalized as TiSport) ? (normalized as TiSport) : "soccer";
}

export default async function VerifyYourTournamentPage({
  searchParams,
}: {
  searchParams?: {
    sport?: string | string[];
    tournamentId?: string | string[];
    utm_campaign?: string | string[];
    utm_term?: string | string[];
    ab?: string | string[];
  };
}) {
  const sport = normalizeVerifySport(searchParams?.sport);
  const sportDisplay = TI_SPORT_LABELS[sport];
  const officialRole = sport === "baseball" || sport === "softball" ? "umpires" : "referees";
  const officialRoleTitle = sport === "baseball" || sport === "softball" ? "Umpire" : "Referee";
  const tournamentId = Array.isArray(searchParams?.tournamentId)
    ? searchParams?.tournamentId[0]
    : searchParams?.tournamentId || "";
  const campaignId = Array.isArray(searchParams?.utm_campaign)
    ? searchParams?.utm_campaign[0]
    : searchParams?.utm_campaign || "";
  const variantFromUtm = Array.isArray(searchParams?.utm_term) ? searchParams?.utm_term[0] : searchParams?.utm_term || "";
  const variantFromAb = Array.isArray(searchParams?.ab) ? searchParams?.ab[0] : searchParams?.ab || "";
  const variant = (variantFromAb || variantFromUtm || "").trim().toUpperCase();
  const initialDuplicateMatch = tournamentId ? await getTournamentDuplicateMatchById(tournamentId).catch(() => null) : null;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Tournament Verification</p>
        <h1 className={styles.title}>Verify Your {sportDisplay} Tournament</h1>
        <p className={styles.subtitle}>
          Your tournament is already listed. Confirm details to unlock Staff Verified status and improve visibility for
          families and {officialRole}.
        </p>

        <div className={styles.benefitsCard}>
          <h2 className={styles.benefitsTitle}>Why verify now</h2>
          <ul className={styles.benefitList}>
            <li>Staff Verified badge on your event page</li>
            <li>Priority placement in {sportDisplay.toLowerCase()} searches</li>
            <li>{officialRoleTitle} information panel (pay, lodging, mentors)</li>
            <li>Highlighted official hotel &amp; sponsor links</li>
            <li>A sharable event page for your website &amp; social</li>
          </ul>
        </div>

        <div className={styles.actions}>
          <Link href="#verify-tournament-form" className={styles.ctaButton}>
            Start Verification
          </Link>
          <span className={styles.secondaryText}>Takes less than 5 minutes. No account required.</span>
        </div>
      </section>

      <ListYourTournamentForm
        mode="verify"
        sportPreset={sport}
        showHero={false}
        formId="verify-tournament-form"
        outreachContext={{
          campaignId,
          tournamentId,
          variant: variant === "A" || variant === "B" ? variant : "",
        }}
        initialDuplicateMatch={initialDuplicateMatch}
      />
    </div>
  );
}
