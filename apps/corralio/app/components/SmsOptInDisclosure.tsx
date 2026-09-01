import Link from "next/link";

export const CORRALIO_SMS_NUMBER_DISPLAY = "509-206-9898";
export const CORRALIO_SMS_NUMBER_E164 = "+15092069898";

export function SmsOptInDisclosure() {
  return (
    <section className="smsOptIn" aria-labelledby="sms-opt-in-heading">
      <p className="eyebrow">Corralio text messages</p>
      <h2 id="sms-opt-in-heading">Text START to <span className="smsNumber">{CORRALIO_SMS_NUMBER_DISPLAY}</span></h2>
      <p>
        By texting START to Corralio, you agree to receive recurring transactional text messages about your Corralio account
        and family sports schedules. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or
        HELP for help. Consent is not a condition of purchase.
      </p>
      <a className="primaryLinkButton" href={`sms:${CORRALIO_SMS_NUMBER_E164}`}>
        Text START to Corralio
      </a>
      <p className="smsLegalLinks">
        Read the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </section>
  );
}
