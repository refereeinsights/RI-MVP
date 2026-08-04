import "../tournaments/tournaments.css";
import Link from "next/link";
import type { Metadata } from "next";
import styles from "./page.module.css";
import BookTravelTeamBlockForm from "../book-travel/BookTravelTeamBlockForm";
import TeamHotelLandingTracker from "./TeamHotelLandingTracker";
import TeamHotelLandingPrimaryCta from "./TeamHotelLandingPrimaryCta";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { getTiTierServer } from "@/lib/entitlementsServer";

export const dynamic = "force-dynamic";

const PAGE_URL = "https://www.tournamentinsights.com/team-hotel-booking";

const FAQS = [
  {
    question: "Who should use team hotel booking?",
    answer:
      "This page is for coaches, team managers, club travel coordinators, and families planning around five or more rooms for a tournament weekend.",
  },
  {
    question: "What information do I need before I submit a request?",
    answer:
      "Start with your tournament or destination, your check-in and check-out dates, and an estimated room count. The request form also asks for your contact information, team or club name, and any special requests.",
  },
  {
    question: "What happens after I submit a team hotel request?",
    answer:
      "TournamentInsights sends your request through the existing lodging partner workflow so group hotel options can be reviewed and followed up on by the lodging partner where appropriate.",
  },
  {
    question: "What if my tournament has a stay-to-play policy?",
    answer:
      "Always follow the tournament’s official lodging policy when one applies. If the event requires a specific booking path or partner, use the official lodging instructions from the tournament first.",
  },
] as const;

function cleanText(value: string | string[] | undefined) {
  if (Array.isArray(value)) return cleanText(value[0]);
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function cleanIsoDate(value: string | string[] | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function cleanRooms(value: string | string[] | undefined) {
  const text = cleanText(value);
  if (!text) return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) && parsed >= 5 ? String(parsed) : null;
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Team Hotel Blocks for Youth Sports Tournaments | TournamentInsights",
    description:
      "Planning travel for 5 or more rooms? Send TournamentInsights your tournament, venue, dates, and room count to request group hotel options near the fields, courts, or rink.",
    alternates: { canonical: "/team-hotel-booking" },
    openGraph: {
      title: "Team Hotel Blocks for Youth Sports Tournaments | TournamentInsights",
      description:
        "Request group hotel options for your youth sports team near the tournament venue without calling hotels one by one.",
      url: PAGE_URL,
      siteName: "TournamentInsights",
      type: "website",
    },
  };
}

export default async function TeamHotelBookingPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const tierInfo = await getTiTierServer(user ?? null);

  const isAuthed = Boolean(user);
  const isUnverified = Boolean(isAuthed && tierInfo.unverified);
  const authState: "signed_out" | "unverified" | "verified" = !isAuthed ? "signed_out" : isUnverified ? "unverified" : "verified";
  const entitlement: "explorer" | "insider" | "weekend_pro" | "unknown" = isAuthed ? tierInfo.tier : "unknown";

  const derivedDestination = [cleanText(searchParams?.venue_name), cleanText(searchParams?.city), cleanText(searchParams?.state)]
    .filter(Boolean)
    .join(", ");
  const destination = cleanText(searchParams?.destination) || derivedDestination || "";
  const checkin = cleanIsoDate(searchParams?.checkin) ?? "";
  const checkout = cleanIsoDate(searchParams?.checkout) ?? "";
  const rooms = cleanRooms(searchParams?.rooms) ?? "10";

  const tournamentId = cleanText(searchParams?.tournament_id);
  const venueId = cleanText(searchParams?.venue_id);
  const tournamentName = cleanText(searchParams?.tournament_name);
  const sport = cleanText(searchParams?.sport);
  const entrySource = cleanText(searchParams?.entry_source) ?? "team_hotel_booking";
  const entryPageType = cleanText(searchParams?.entry_page_type) ?? "team_hotel_booking";
  const entryPath = cleanText(searchParams?.entry_path) ?? "/team-hotel-booking";
  const entryPlacement = cleanText(searchParams?.entry_placement) ?? "team_hotel_booking_primary_cta";

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.tournamentinsights.com/" },
      { "@type": "ListItem", position: 2, name: "Book Travel", item: "https://www.tournamentinsights.com/book-travel" },
      { "@type": "ListItem", position: 3, name: "Team Hotel Booking", item: PAGE_URL },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <main className="pitchWrap tournamentsWrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <TeamHotelLandingTracker
        authState={authState}
        entitlement={entitlement}
        tournamentId={tournamentId}
        venueId={venueId}
        entrySource={entrySource}
        entryPageType={entryPageType}
        entryPath={entryPath}
        entryPlacement={entryPlacement}
      />
      <section className="field tournamentsField">
        <div className={styles.wrap}>
          <header className={styles.hero}>
            <div className={styles.eyebrow}>Team lodging for tournament weekends</div>
            <h1 className="title">Find a Hotel Block for Your Youth Sports Team</h1>
            <p className={styles.lede}>
              Planning travel for 5 or more rooms? Send us your tournament, venue, dates, and estimated room count. We’ll help you find group hotel options near the fields, courts, or rink—without calling hotels one by one.
            </p>
            <div className={styles.ctaRow}>
              <TeamHotelLandingPrimaryCta
                authState={authState}
                entitlement={entitlement}
                tournamentId={tournamentId}
                venueId={venueId}
                entrySource={entrySource}
                entryPageType={entryPageType}
                entryPath={entryPath}
                entryPlacement={entryPlacement}
                className={styles.primaryCta}
              />
              <div className={styles.secondaryText}>
                {tournamentName ? `Current tournament context: ${tournamentName}` : "Best for coaches, team managers, and club travel coordinators."}
              </div>
            </div>
          </header>

          <section className={styles.grid} aria-label="Team hotel booking overview">
            <article className={styles.card}>
              <h2 className={styles.cardTitle}>How this works</h2>
              <ul className={styles.list}>
                <li>This request is intended for team travel groups that need about 5 or more rooms.</li>
                <li>Start with your tournament or destination, dates, and estimated room count.</li>
                <li>After you submit, TournamentInsights routes the request through the existing lodging partner workflow.</li>
                <li>A lodging partner may follow up with options or clarifying questions.</li>
                <li>Follow the tournament’s official lodging instructions first when a stay-to-play policy applies.</li>
              </ul>
            </article>

            <article className={styles.card}>
              <h2 className={styles.cardTitle}>Best use cases</h2>
              <ul className={styles.list}>
                <li>Multi-day tournaments with families arriving from out of town.</li>
                <li>Coaches or managers coordinating rooms near the venue.</li>
                <li>Clubs comparing hotel areas before sending a team recommendation.</li>
                <li>Teams that want a single request instead of calling hotels individually.</li>
              </ul>
            </article>
          </section>

          <BookTravelTeamBlockForm
            surface="team_hotel_booking"
            defaultOpen
            showToggle={false}
            entitlement={entitlement}
            authState={authState}
            initialValues={{
              destination,
              checkin,
              checkout,
              rooms,
              groupName: tournamentName ?? "",
            }}
            plannerTrackingContext={{
              tournament_id: tournamentId,
              venue_id: venueId,
              entry_source: entrySource,
              entry_page_type: entryPageType,
              entry_path: entryPath,
              entry_placement: entryPlacement,
              current_page_type: "team_hotel_booking",
              current_page_path: "/team-hotel-booking",
            }}
          />

          <section className={styles.faq} aria-label="Team hotel booking FAQs">
            <h2 className="title" style={{ fontSize: "1.65rem", margin: 0 }}>Team hotel booking FAQs</h2>
            {FAQS.map((item) => (
              <article key={item.question} className={styles.faqItem}>
                <p className={styles.faqQ}>{item.question}</p>
                <p className={styles.faqA}>{item.answer}</p>
              </article>
            ))}
          </section>

          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: "#475569" }}>
              Looking for individual rooms instead? <Link href="/book-travel">Search hotels and rentals on Book Travel</Link>.
            </p>
            {sport ? (
              <p style={{ margin: 0, color: "#475569" }}>
                Sport context: <strong style={{ textTransform: "capitalize" }}>{sport}</strong>
              </p>
            ) : null}
          </div>

          <AffiliateDisclosure />
        </div>
      </section>
    </main>
  );
}
