import type { Metadata } from "next";

import { PublicLegalShell } from "@/app/components/PublicLegalShell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Corralio, a service of CO Services, handles information.",
};

export default function PrivacyPage() {
  return (
    <PublicLegalShell eyebrow="Legal" title="Privacy Policy">
      <p>
        Corralio is a service of CO Services. This policy explains how CO Services collects, uses, discloses, and protects
        information when you use Corralio.
      </p>

      <section>
        <h2>Information we collect</h2>
        <p>Depending on the features you use, Corralio may process:</p>
        <ul>
          <li>Account and contact information, including an email address or verified phone number.</li>
          <li>Family and youth-sports information that an adult account holder provides, including child display names, teams, sports, schedules, and preferences.</li>
          <li>Calendar subscription links, schedule-source metadata, and events imported from connected services.</li>
          <li>Locations, travel preferences, estimated routes, and notification settings used to prepare a family plan.</li>
          <li>Browser, device, security, interaction, and operational diagnostic information needed to operate and protect the service.</li>
          <li>Message, consent, delivery, and opt-out records when SMS, email, or push-notification features are used.</li>
        </ul>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>
          We use information to authenticate users; connect, refresh, and organize schedules; identify conflicts; calculate
          planning estimates; provide requested communications; support users; prevent abuse; diagnose failures; and improve
          the reliability and usability of Corralio. We do not use a household home or origin location as public venue evidence.
        </p>
      </section>

      <section>
        <h2>SMS and other notifications</h2>
        <p>
          If you opt in to the Corralio messaging program, we use your phone number and messaging-consent records to provide
          transactional text messages about your account and family sports schedules. Message frequency varies. Message and
          data rates may apply. Reply STOP to opt out or HELP for help. You may also contact us at
          {" "}<a href="mailto:help@corralio.com">help@corralio.com</a>. Consent to SMS is not a condition of purchase.
        </p>
        <p>
          We do not sell phone numbers or SMS consent, and we do not share phone numbers or SMS opt-in information with third
          parties for their own marketing or promotional purposes. Operational providers may process this information only as
          needed to provide messaging, authentication, hosting, security, analytics, support, or other Corralio services.
        </p>
        <p>
          Push or email notifications are sent only according to the choices and controls presented for those channels. You can
          use the applicable browser, device, account, or unsubscribe controls to change those choices.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosures</h2>
        <p>
          CO Services uses operational providers for functions such as hosting, authentication, messaging, mapping and routing,
          schedule processing, analytics, security, and support. These providers may receive information needed to perform their
          services. We may also disclose information when required by law, to protect users or the service, or as part of a
          business transaction subject to appropriate safeguards. We do not authorize operational providers to use SMS consent
          for unrelated marketing.
        </p>
      </section>

      <section>
        <h2>Security and retention</h2>
        <p>
          We use technical and organizational safeguards intended to protect information, including authorization boundaries and
          restricted access to sensitive service credentials. No system is completely secure. We retain information for as long
          as reasonably needed to provide and protect Corralio, meet legal obligations, resolve disputes, and enforce agreements.
          Retention may vary by record type and operational need.
        </p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can disconnect schedules, update supported account and notification settings, opt out of SMS by replying STOP, and
          request help or ask about access, correction, or deletion by emailing
          {" "}<a href="mailto:help@corralio.com">help@corralio.com</a>. Some records may be retained where reasonably necessary
          for security, legal, or operational purposes.
        </p>
      </section>

      <section>
        <h2>Children&apos;s information</h2>
        <p>
          Corralio is intended for adult account holders organizing family schedules. Adults may provide limited information
          about children for that purpose. Children should not create accounts or submit personal information directly.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          We may update this policy as Corralio changes and will post the revised effective date here. Questions or privacy
          requests can be sent to <a href="mailto:help@corralio.com">help@corralio.com</a>.
        </p>
      </section>
    </PublicLegalShell>
  );
}
