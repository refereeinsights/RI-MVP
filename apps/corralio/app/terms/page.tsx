import type { Metadata } from "next";

import { PublicLegalShell } from "@/app/components/PublicLegalShell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using Corralio, a service of CO Services.",
};

export default function TermsPage() {
  return (
    <PublicLegalShell eyebrow="Legal" title="Terms of Service">
      <p>
        These Terms govern your use of Corralio, a service operated by CO Services. By using Corralio, you agree to these Terms.
        If you do not agree, do not use the service.
      </p>

      <section>
        <h2>Eligibility and accounts</h2>
        <p>
          You must be able to enter into this agreement and be an adult authorized to manage the family information you provide.
          You are responsible for accurate account information, safeguarding access to your account, and activity performed through
          it. Contact us promptly if you believe your account or verified communication channel has been compromised.
        </p>
      </section>

      <section>
        <h2>The Corralio service</h2>
        <p>
          Corralio helps families bring youth-sports schedules together, view conflicts, and prepare planning estimates and
          reminders. Features may depend on third-party calendars, venues, geocoding, routing, messaging, and other services.
          Corralio is a planning aid, not an official schedule source, navigation service, emergency service, or guarantee that
          an event, location, route, arrival time, or reminder is complete or current.
        </p>
      </section>

      <section>
        <h2>Your information and responsibilities</h2>
        <p>
          You may provide family, team, schedule, calendar, location, and preference information only when you have authority to do
          so. You are responsible for reviewing important details against the official team, league, tournament, venue, or calendar
          source and for making safe travel decisions. Do not submit unlawful content or use Corralio to harass, impersonate,
          exploit, probe, disrupt, or gain unauthorized access to people, accounts, systems, or data.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          Connected calendars and third-party links, providers, and services are governed by their own terms and privacy practices.
          Their availability, accuracy, and behavior are outside CO Services&apos; control. You authorize Corralio to access and process
          the calendar or subscription sources you choose to connect for the purpose of providing the service.
        </p>
      </section>

      <section>
        <h2>Corralio SMS program</h2>
        <p>
          If you opt in, Corralio may send recurring transactional and customer-care messages associated with your account and
          family sports schedules. Messages may include schedule confirmations, schedule changes, event reminders, arrival
          reminders, leave-by notifications, and responses to requests you initiate. No marketing or promotional messages are
          included in this program.
        </p>
        <p><strong>Message frequency varies. Message and data rates may apply.</strong></p>
        <p>
          Reply STOP to unsubscribe. Reply START to request re-subscription, subject to Corralio&apos;s consent and account rules. Reply
          HELP for help, or email <a href="mailto:help@corralio.com">help@corralio.com</a>. We will also honor other reasonable
          requests to stop messages. Consent to SMS is not a condition of purchase. Mobile carriers are not liable for delayed or
          undelivered messages.
        </p>
      </section>

      <section>
        <h2>Intellectual property</h2>
        <p>
          Corralio and its software, design, and original content are owned by CO Services or its licensors and are protected by
          applicable law. These Terms give you a limited, revocable, non-transferable right to use the service for its intended
          personal purposes; they do not transfer ownership of the service or third-party content.
        </p>
      </section>

      <section>
        <h2>Changes, suspension, and termination</h2>
        <p>
          We may change, suspend, or discontinue features and may restrict or terminate access where reasonably necessary to protect
          users, comply with law, address misuse, or operate the service. You may stop using Corralio at any time and may contact us
          for assistance with supported account or data requests.
        </p>
      </section>

      <section>
        <h2>Disclaimers and limitation of liability</h2>
        <p>
          To the extent permitted by law, Corralio is provided &quot;as is&quot; and &quot;as available&quot; without warranties of uninterrupted,
          error-free, complete, or current operation. CO Services disclaims implied warranties to the extent permitted by law.
          To the extent permitted by law, CO Services will not be liable for indirect, incidental, special, consequential, or
          punitive damages, or for losses caused by reliance on schedule, location, route, timing, reminder, or third-party data.
          Nothing in these Terms excludes rights or liability that cannot lawfully be excluded.
        </p>
      </section>

      <section>
        <h2>Changes to these Terms and contact</h2>
        <p>
          We may update these Terms as Corralio changes and will post the revised effective date here. Questions can be sent to
          {" "}<a href="mailto:help@corralio.com">help@corralio.com</a>.
        </p>
      </section>
    </PublicLegalShell>
  );
}
