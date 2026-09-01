import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const layout = source("../../app/layout.tsx");
const footer = source("../../app/components/SiteFooter.tsx");
const disclosure = source("../../app/components/SmsOptInDisclosure.tsx");
const smsPage = source("../../app/sms/page.tsx");
const privacy = source("../../app/privacy/page.tsx");
const terms = source("../../app/terms/page.tsx");

test("public legal routes identify the operator and expose complete legal metadata", () => {
  assert.match(privacy, /Corralio is a service of CO Services/);
  assert.match(privacy, /phone numbers or SMS opt-in information/);
  assert.match(privacy, /their own marketing or promotional purposes/);
  assert.match(privacy, /adult account holders/);
  assert.match(terms, /service operated by CO Services/);
  assert.match(terms, /Corralio SMS program/);
  assert.match(terms, /Message frequency varies\. Message and data rates may apply\./);
  assert.match(terms, /Reply STOP to unsubscribe/);
  assert.match(terms, /Consent to SMS is not a condition of purchase/);
  assert.match(privacy, /export const metadata/);
  assert.match(terms, /export const metadata/);
  assert.doesNotMatch(privacy + terms, /governing law|arbitration|class.action waiver/i);
});

test("global footer links public legal routes without changing the brand", () => {
  assert.match(layout, /<SiteFooter \/>/);
  assert.match(footer, /Corralio is a service of CO Services\./);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/terms"/);
  assert.doesNotMatch(footer, /sole proprietorship/i);
});

test("SMS CTA carries the exact public disclosure and remains activation-gated", () => {
  assert.match(disclosure, /Text START to <span className="smsNumber">\{CORRALIO_SMS_NUMBER_DISPLAY\}<\/span>/);
  assert.match(disclosure, /509-206-9898/);
  assert.match(disclosure, /recurring transactional text messages/);
  assert.match(disclosure, /Message frequency varies\. Message and data rates may apply\./);
  assert.match(disclosure, /Reply STOP to opt out or\s+HELP for help/);
  assert.match(disclosure, /Consent is not a condition of purchase/);
  assert.match(disclosure, /href="\/terms"/);
  assert.match(disclosure, /href="\/privacy"/);
  assert.match(smsPage, /isPublicSmsOptInEnabled/);
  assert.match(smsPage, /Text access is not available yet/);
  assert.doesNotMatch(disclosure + smsPage, /marketing messages|promotional text/i);
});
