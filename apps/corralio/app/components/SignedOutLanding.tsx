import { BrandLogo } from "@/app/components/BrandLogo";
import { PhoneAuthForm } from "@/app/components/PhoneAuthForm";
import { SignInForm } from "@/app/components/SignInForm";

const EXAMPLE_DAYS = [
  {
    day: "Saturday",
    events: [
      {
        identity: "Jordan · Harbor Baseball",
        time: "8:00 AM",
        title: "Game",
        location: "Tacoma",
        source: "via GameChanger",
        leaveBy: "Leave by 6:55 AM (est.) · ~52 min estimated drive",
      },
      { identity: "Riley · City Soccer", time: "10:30 AM", title: "Match", location: "Bellevue", source: "via TeamSnap" },
      { identity: "Jordan · Northside Lacrosse", time: "3:00 PM", title: "Practice", location: "Seattle" },
    ],
  },
  {
    day: "Sunday",
    events: [
      { identity: "Riley · Community Swim", time: "9:00 AM", title: "Meet", location: "Renton" },
    ],
  },
] as const;

export function SignedOutLanding({ phoneAuthSiteKey }: { phoneAuthSiteKey?: string | null }) {
  return (
    <main className="landingShell">
      <div className="landingCard">
        <BrandLogo />
        <div className="landingHeroGrid">
          <section className="landingMessage" aria-labelledby="corralio-title">
            <p className="eyebrow corralioTrademark">Corralio<sup aria-hidden="true">™</sup></p>
            <h1 id="corralio-title">The planner built for sports families.</h1>
            <p className="landingPromise">Every kid. Every team. One plan.</p>
            <p className="landingDescription">
              Bring the games, practices, and commitments scattered across your family’s team apps into one clear weekend plan.
            </p>
            <p className="landingDifference">Team apps organize the team. Corralio plans across the family.</p>
            <nav className="landingActions" aria-label="Account access">
              <a className="primaryLinkButton" href="#get-started-email">Get Started</a>
              <a className="landingSignInLink" href="#returning-sign-in">Sign in</a>
            </nav>
            <p className="landingPrivacy"><span aria-hidden="true">●</span> Your family’s plan is private by default.</p>
          </section>

          <section className="weekendPreview" aria-labelledby="weekend-preview-title">
            <div className="weekendPreviewHeading">
              <div>
                <p className="eyebrow">Example weekend</p>
                <h2 id="weekend-preview-title">One family plan</h2>
              </div>
              <span aria-hidden="true">✓</span>
            </div>
            <div className="previewDays">
              {EXAMPLE_DAYS.map((exampleDay, dayIndex) => (
                <section className="previewDay" key={exampleDay.day} aria-labelledby={`preview-day-${dayIndex}`}>
                  <h3 id={`preview-day-${dayIndex}`}>{exampleDay.day}</h3>
                  <ul>
                    {exampleDay.events.map((event, eventIndex) => (
                      <li className={`previewEvent previewEvent-${(dayIndex + eventIndex) % 3}`} key={`${event.identity}-${event.time}`}>
                        <p>{event.identity}</p>
                        <div><strong>{event.time}</strong><span>{event.title} · {event.location}</span></div>
                        {"source" in event ? <p className="previewSource">{event.source}</p> : null}
                        {"leaveBy" in event ? <p className="previewLeaveBy">{event.leaveBy}</p> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <p className="previewOutcome">We’ve got the weekend figured out.</p>
          </section>
        </div>

        <section className="landingPayoff" aria-labelledby="landing-payoff-title">
          <h2 id="landing-payoff-title">Corral your sports chaos.</h2>
          <p>Every schedule, every kid, every team — brought together so you can see how the weekend actually works.</p>
          <p className="landingValueBridge">Bring your schedules together. Spot conflicts. Know what the weekend looks like.</p>
        </section>

        <section className="signInPanel" id="account-access" aria-labelledby="account-access-title">
          <div className="signInIntro">
            <p className="eyebrow">First step</p>
            <h2 id="account-access-title">Get started with your email</h2>
            <p>We’ll send a secure link so you can start bringing your family’s schedules together.</p>
          </div>
          <div>
            {phoneAuthSiteKey ? <PhoneAuthForm siteKey={phoneAuthSiteKey} /> : null}
            <SignInForm />
          </div>
        </section>
      </div>
    </main>
  );
}
