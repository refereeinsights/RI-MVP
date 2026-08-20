import { loadWeekendData, resolveCorralioViewer } from "@/app/_lib/productData";
import { BrandLogo } from "@/app/components/BrandLogo";
import { ProductShell } from "@/app/components/ProductShell";
import { SignInForm } from "@/app/components/SignInForm";
import { ThisWeekend } from "@/app/components/ThisWeekend";

export const dynamic = "force-dynamic";

function SignInPage() {
  return (
    <main className="landingShell">
      <section className="landingCard" aria-labelledby="corralio-title">
        <BrandLogo />
        <div className="launchBadge">Private pilot</div>
        <div className="messageBlock">
          <h1 id="corralio-title">Know what’s happening this weekend.</h1>
          <p className="promise">Connect one team schedule. See the weekend clearly.</p>
        </div>
        <div className="signInPanel">
          <h2>Sign in to your family planner</h2>
          <p>Use your password, or ask us to email you a secure sign-in link.</p>
          <SignInForm />
        </div>
      </section>
    </main>
  );
}

export default async function HomePage() {
  const viewer = await resolveCorralioViewer();
  if (!viewer) return <SignInPage />;

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
            <p>Open Family to connect your team’s iCal link and bring upcoming games and practices into one place.</p>
          </div>
        )}
      </section>
    </ProductShell>
  );
}
