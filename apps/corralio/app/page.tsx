import { signOut } from "@/app/actions";
import { ConnectScheduleForm } from "@/app/components/ConnectScheduleForm";
import { ConnectedScheduleList, type ConnectedSchedule } from "@/app/components/ConnectedScheduleList";
import { SignInForm } from "@/app/components/SignInForm";
import { ThisWeekend, type WeekendEvent } from "@/app/components/ThisWeekend";
import { createCorralioSupabaseServerClient } from "@/lib/supabase/server";
import { parseCorralioSport } from "@/lib/schedules/sport";
import { getWeekendCandidateWindow } from "@/lib/weekend";

export const dynamic = "force-dynamic";

type SourceRow = { id: string; display_name: string; sport: string | null; sync_status: string; last_synced_at: string | null };
type NamedRow = { id: string; display_name: string };
type EventRow = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  source_location_text: string | null;
  display_location_text: string | null;
  field_label: string | null;
  schedule_source_id: string | null;
  child_id: string | null;
  team_id: string | null;
};

function Brand() {
  return (
    <div className="brandRow" aria-label="Corralio">
      <span className="brandMark" aria-hidden="true">C</span>
      <span className="brandName">Corralio</span>
    </div>
  );
}

function SignInPage() {
  return (
    <main className="landingShell">
      <section className="landingCard" aria-labelledby="corralio-title">
        <Brand />
        <div className="launchBadge">Private pilot</div>
        <div className="messageBlock">
          <h1 id="corralio-title">Know what’s happening this weekend.</h1>
          <p className="promise">Connect one team schedule. See the weekend clearly.</p>
        </div>
        <div className="signInPanel">
          <h2>Sign in to your family planner</h2>
          <p>We’ll email you a secure sign-in link.</p>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}

export default async function HomePage() {
  let supabase;
  try {
    supabase = createCorralioSupabaseServerClient();
  } catch {
    return <SignInPage />;
  }
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return <SignInPage />;

  const { data: membership } = await supabase
    .from("corralio_household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  const householdId = typeof membership?.household_id === "string" ? membership.household_id : null;

  let sources: SourceRow[] = [];
  let events: EventRow[] = [];
  let children: NamedRow[] = [];
  let teams: NamedRow[] = [];
  if (householdId) {
    const window = getWeekendCandidateWindow(new Date());
    const [sourceResult, eventResult, childResult, teamResult] = await Promise.all([
      supabase
        .from("corralio_schedule_sources")
        .select("id,display_name,sport,sync_status,last_synced_at")
        .eq("household_id", householdId)
        .neq("sync_status", "disconnected")
        .order("created_at", { ascending: true }),
      supabase
        .from("corralio_events")
        .select("id,title,starts_at,ends_at,timezone,source_location_text,display_location_text,field_label,schedule_source_id,child_id,team_id")
        .eq("household_id", householdId)
        .gte("starts_at", window.from)
        .lt("starts_at", window.to)
        .order("starts_at", { ascending: true })
        .limit(200),
      supabase.from("corralio_children").select("id,display_name").eq("household_id", householdId).is("archived_at", null),
      supabase.from("corralio_teams").select("id,display_name").eq("household_id", householdId).is("archived_at", null),
    ]);
    sources = (sourceResult.data ?? []) as SourceRow[];
    events = (eventResult.data ?? []) as EventRow[];
    children = (childResult.data ?? []) as NamedRow[];
    teams = (teamResult.data ?? []) as NamedRow[];
  }

  const sourceLabels = new Map(sources.map((source) => [source.id, source.display_name]));
  const sourceSports = new Map(sources.map((source) => [source.id, parseCorralioSport(source.sport)]));
  const childLabels = new Map(children.map((child) => [child.id, child.display_name]));
  const teamLabels = new Map(teams.map((team) => [team.id, team.display_name]));
  const weekendEvents: WeekendEvent[] = events.map((event) => ({
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    timezone: event.timezone,
    location: event.source_location_text ?? event.display_location_text,
    fieldLabel: event.source_location_text ? null : event.field_label,
    sourceLabel: event.schedule_source_id ? sourceLabels.get(event.schedule_source_id) ?? null : null,
    sport: event.schedule_source_id ? sourceSports.get(event.schedule_source_id) ?? null : null,
    assignmentLabel: event.child_id
      ? childLabels.get(event.child_id) ?? null
      : event.team_id
        ? teamLabels.get(event.team_id) ?? null
        : null,
  }));
  const connectedSources: ConnectedSchedule[] = sources.flatMap((source) => {
    if (source.sync_status !== "pending" && source.sync_status !== "success" && source.sync_status !== "error") return [];
    return [{
      id: source.id,
      displayName: source.display_name,
      sport: parseCorralioSport(source.sport),
      syncStatus: source.sync_status,
    }];
  });

  return (
    <main className="appShell">
      <header className="appHeader">
        <Brand />
        <form action={signOut}><button className="textButton" type="submit">Sign out</button></form>
      </header>
      <div className="appContent">
        <section className="heroSection">
          <p className="eyebrow">Family schedule</p>
          <h1>This Weekend</h1>
          <p>Every kid. Every team. One clear plan.</p>
        </section>

        <section className="contentCard" aria-labelledby="weekend-heading">
          <div className="sectionHeading">
            <div><p className="eyebrow">Your plan</p><h2 id="weekend-heading">What’s happening</h2></div>
            {sources.length ? <span className="countBadge">{sources.length} {sources.length === 1 ? "schedule" : "schedules"}</span> : null}
          </div>
          {sources.length ? <ThisWeekend events={weekendEvents} /> : (
            <div className="emptyState">
              <h3>Your weekend starts with one schedule</h3>
              <p>Connect your team’s iCal link to bring upcoming games and practices into one place.</p>
            </div>
          )}
        </section>

        <section className="contentCard connectCard" aria-labelledby="connect-heading">
          <p className="eyebrow">{sources.length ? "Add another" : "Get started"}</p>
          <h2 id="connect-heading">Connect a schedule</h2>
          <p className="sectionIntro">Your private calendar URL stays on the server and is never shown in the app after you connect it.</p>
          <ConnectScheduleForm />
          {connectedSources.length ? <ConnectedScheduleList sources={connectedSources} /> : null}
        </section>
      </div>
    </main>
  );
}
