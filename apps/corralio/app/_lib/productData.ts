import type { ConnectedSchedule } from "@/app/components/ConnectedScheduleList";
import type { FamilyChild, FamilyTeam } from "@/app/components/FamilySection";
import type { WeekendEvent } from "@/app/components/ThisWeekend";
import { parseChildColor } from "@/lib/family";
import { resolveAssignmentPresentation } from "@/lib/schedules/assignment";
import { parseCorralioSport } from "@/lib/schedules/sport";
import { createCorralioSupabaseServerClient } from "@/lib/supabase/server";
import { getWeekendCandidateWindow } from "@/lib/weekend";

type SourceRow = { id: string; display_name: string; sport: string | null; sync_status: string; last_synced_at: string | null; refresh_paused_at: string | null; child_id: string | null; team_id: string | null };
type ChildRow = { id: string; display_name: string; color_token: string; sort_order: number };
type TeamRow = { id: string; child_id: string; display_name: string; sport: string | null; sort_order: number };
type EventRow = { id: string; title: string; starts_at: string; ends_at: string | null; timezone: string | null; source_location_text: string | null; display_location_text: string | null; field_label: string | null; schedule_source_id: string | null; child_id: string | null; team_id: string | null };

export async function resolveCorralioViewer() {
  try {
    const supabase = createCorralioSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return null;
    const { data: membership } = await supabase.from("corralio_household_members").select("household_id").eq("user_id", authData.user.id).eq("role", "owner").eq("status", "active").maybeSingle();
    return { supabase, householdId: typeof membership?.household_id === "string" ? membership.household_id : null };
  } catch {
    return null;
  }
}

type CorralioViewer = NonNullable<Awaited<ReturnType<typeof resolveCorralioViewer>>>;

async function loadFamilyRows(viewer: CorralioViewer) {
  if (!viewer.householdId) return { sources: [] as SourceRow[], children: [] as ChildRow[], teams: [] as TeamRow[] };
  const [sourceResult, childResult, teamResult] = await Promise.all([
    viewer.supabase.from("corralio_schedule_sources").select("id,display_name,sport,sync_status,last_synced_at,refresh_paused_at,child_id,team_id").eq("household_id", viewer.householdId).neq("sync_status", "disconnected").order("created_at", { ascending: true }),
    viewer.supabase.from("corralio_children").select("id,display_name,color_token,sort_order").eq("household_id", viewer.householdId).is("archived_at", null).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    viewer.supabase.from("corralio_teams").select("id,child_id,display_name,sport,sort_order").eq("household_id", viewer.householdId).is("archived_at", null).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
  ]);
  return { sources: (sourceResult.data ?? []) as SourceRow[], children: (childResult.data ?? []) as ChildRow[], teams: (teamResult.data ?? []) as TeamRow[] };
}

function mapFamily(children: ChildRow[], teams: TeamRow[]) {
  const familyChildren: FamilyChild[] = children.map((child) => ({ id: child.id, displayName: child.display_name, colorToken: parseChildColor(child.color_token) }));
  const familyTeams: FamilyTeam[] = teams.map((team) => ({ id: team.id, childId: team.child_id, displayName: team.display_name, sport: parseCorralioSport(team.sport) }));
  return { familyChildren, familyTeams };
}

export async function loadWeekendData(viewer: CorralioViewer) {
  const familyRows = await loadFamilyRows(viewer);
  const { familyChildren, familyTeams } = mapFamily(familyRows.children, familyRows.teams);
  let events: EventRow[] = [];
  if (viewer.householdId) {
    const window = getWeekendCandidateWindow(new Date());
    const eventResult = await viewer.supabase.from("corralio_events").select("id,title,starts_at,ends_at,timezone,source_location_text,display_location_text,field_label,schedule_source_id,child_id,team_id").eq("household_id", viewer.householdId).gte("starts_at", window.from).lt("starts_at", window.to).order("starts_at", { ascending: true }).limit(200);
    events = (eventResult.data ?? []) as EventRow[];
  }
  const sourceLabels = new Map(familyRows.sources.map((source) => [source.id, source.display_name]));
  const sourceSports = new Map(familyRows.sources.map((source) => [source.id, parseCorralioSport(source.sport)]));
  const weekendEvents: WeekendEvent[] = events.map((event) => {
    const assignment = resolveAssignmentPresentation({ childId: event.child_id, teamId: event.team_id }, familyChildren, familyTeams);
    return { id: event.id, title: event.title, startsAt: event.starts_at, endsAt: event.ends_at, timezone: event.timezone, location: event.source_location_text ?? event.display_location_text, fieldLabel: event.source_location_text ? null : event.field_label, sourceLabel: event.schedule_source_id ? sourceLabels.get(event.schedule_source_id) ?? null : null, sport: event.schedule_source_id ? sourceSports.get(event.schedule_source_id) ?? null : null, assignmentLabel: assignment.label };
  });
  return { sourceCount: familyRows.sources.length, weekendEvents };
}

export async function loadFamilyData(viewer: CorralioViewer) {
  const rows = await loadFamilyRows(viewer);
  const { familyChildren, familyTeams } = mapFamily(rows.children, rows.teams);
  const connectedSources: ConnectedSchedule[] = rows.sources.flatMap((source) => {
    if (source.sync_status !== "pending" && source.sync_status !== "success" && source.sync_status !== "error") return [];
    const assignment = resolveAssignmentPresentation({ childId: source.child_id, teamId: source.team_id }, familyChildren, familyTeams);
    return [{ id: source.id, displayName: source.display_name, sport: parseCorralioSport(source.sport), syncStatus: source.sync_status, refreshPausedAt: source.refresh_paused_at, childId: source.child_id, teamId: source.team_id, assignmentLabel: assignment.label ?? "Not assigned", assignmentUnavailable: assignment.kind === "unavailable" }];
  });
  return { familyChildren, familyTeams, connectedSources, sourceCount: rows.sources.length };
}
