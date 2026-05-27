import { redirect } from "next/navigation";

export const metadata = {
  title: "Planner | TournamentInsights",
  description: "Weekend logistics planner for tournament travel and schedules.",
};

export const runtime = "nodejs";

export default async function PlannerPage(props: { searchParams?: Record<string, string | string[] | undefined> }) {
  const sp = props.searchParams ?? {};
  const view = typeof sp.view === "string" ? sp.view : null;
  const importParam = typeof sp.import === "string" ? sp.import : null;

  const next = new URLSearchParams();
  if (view) next.set("view", view);
  if (importParam) next.set("import", importParam);

  redirect(`/weekend-planner${next.toString() ? `?${next.toString()}` : ""}`);
}
