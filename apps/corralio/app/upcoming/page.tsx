import { redirect } from "next/navigation";

import { resolveCorralioViewer } from "@/app/_lib/productData";
import { ProductShell } from "@/app/components/ProductShell";

export const dynamic = "force-dynamic";

export default async function UpcomingPage() {
  const viewer = await resolveCorralioViewer();
  if (!viewer) redirect("/");
  return (
    <ProductShell activeSection="upcoming">
      <section className="heroSection"><p className="eyebrow">Beyond the weekend</p><h1>Upcoming</h1><p>A longer-range family schedule is on the way.</p></section>
      <section className="contentCard upcomingPlaceholder" aria-labelledby="upcoming-heading">
        <p className="eyebrow">Coming soon</p><h2 id="upcoming-heading">Plan further ahead</h2>
        <p className="sectionIntro">This view will bring future games and practices together without changing your current weekend plan.</p>
      </section>
    </ProductShell>
  );
}
