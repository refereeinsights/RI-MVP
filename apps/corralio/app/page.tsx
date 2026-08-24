import { loadWeekendData, resolveCorralioViewer } from "@/app/_lib/productData";
import { ProductShell } from "@/app/components/ProductShell";
import { SignedOutLanding } from "@/app/components/SignedOutLanding";
import { ThisWeekend } from "@/app/components/ThisWeekend";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const viewer = await resolveCorralioViewer();
  if (!viewer) return <SignedOutLanding />;

  const { sourceCount, weekendEvents } = await loadWeekendData(viewer);
  return (
    <ProductShell activeSection="weekend">
      <section className="heroSection">
        <p className="eyebrow">Family schedule</p>
        <h1>This Weekend</h1>
        <p>Every kid. Every team. One clear plan.</p>
      </section>
      <section className="contentCard" aria-labelledby="weekend-heading">
        <div className="sectionHeading">
          <div><p className="eyebrow">Your plan</p><h2 id="weekend-heading">What’s happening</h2></div>
          {sourceCount ? <span className="countBadge">{sourceCount} {sourceCount === 1 ? "schedule" : "schedules"}</span> : null}
        </div>
        {sourceCount ? <ThisWeekend events={weekendEvents} /> : (
          <div className="emptyState">
            <h3>Your weekend starts with one schedule</h3>
            <p>Open Family to connect a team schedule and bring upcoming games and practices into one place.</p>
          </div>
        )}
      </section>
    </ProductShell>
  );
}
