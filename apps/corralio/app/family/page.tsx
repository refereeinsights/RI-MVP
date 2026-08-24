import { redirect } from "next/navigation";

import { loadFamilyData, resolveCorralioViewer } from "@/app/_lib/productData";
import { ConnectScheduleForm } from "@/app/components/ConnectScheduleForm";
import { ConnectedScheduleList } from "@/app/components/ConnectedScheduleList";
import { FamilySection } from "@/app/components/FamilySection";
import { ProductShell } from "@/app/components/ProductShell";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const viewer = await resolveCorralioViewer();
  if (!viewer) redirect("/");
  const { familyChildren, familyTeams, connectedSources, sourceCount } = await loadFamilyData(viewer);
  return (
    <ProductShell activeSection="family">
      <section className="heroSection"><p className="eyebrow">Your household</p><h1>Family</h1><p>Keep every child, team, and schedule connected.</p></section>
      <FamilySection familyChildren={familyChildren} teams={familyTeams} />
      <section className="contentCard connectCard" aria-labelledby="connect-heading">
        <p className="eyebrow">{sourceCount ? "Add another" : "Get started"}</p><h2 id="connect-heading">Connect a schedule</h2>
        <p className="sectionIntro">Your private calendar link stays on the server and is never shown in the app after you connect it.</p>
        <ConnectScheduleForm />
        {connectedSources.length ? <ConnectedScheduleList sources={connectedSources} familyChildren={familyChildren} teams={familyTeams} /> : null}
      </section>
    </ProductShell>
  );
}
