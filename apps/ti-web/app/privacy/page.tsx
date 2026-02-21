import LegalPage from "../(legal)/LegalPage";
import { privacyContent } from "../(legal)/legalContent";
import { BRAND_TI } from "@/lib/brand";

export const metadata = {
  title: `${BRAND_TI} Privacy Policy`,
  description: `${BRAND_TI} Privacy Policy describing what information we collect and how it is used.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage title={`${BRAND_TI} Privacy Policy`} lastUpdated="February 2026" markdown={privacyContent} />;
}
