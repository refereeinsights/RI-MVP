import type { Metadata } from "next";

import { PublicLegalShell } from "@/app/components/PublicLegalShell";
import { SmsOptInDisclosure } from "@/app/components/SmsOptInDisclosure";
import { isPublicSmsOptInEnabled } from "@/lib/sms/publicOptIn";

export const metadata: Metadata = {
  title: "Corralio Text Messages",
  description: "Information about Corralio transactional text messages.",
};

export default function SmsPage() {
  const smsOptInEnabled = isPublicSmsOptInEnabled();

  return (
    <PublicLegalShell eyebrow="Communications" title="Corralio text messages">
      {smsOptInEnabled ? (
        <SmsOptInDisclosure />
      ) : (
        <section aria-labelledby="sms-coming-soon">
          <h2 id="sms-coming-soon">Text access is not available yet</h2>
          <p>
            Corralio is preparing transactional text-message access. We will publish the opt-in number and complete SMS
            disclosure here only after the secure inbound workflow and opt-out controls are operational.
          </p>
          <p>For help today, email <a href="mailto:help@corralio.com">help@corralio.com</a>.</p>
        </section>
      )}
    </PublicLegalShell>
  );
}
