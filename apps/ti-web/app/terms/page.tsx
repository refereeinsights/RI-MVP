import LegalPage from "../(legal)/LegalPage";
import { termsContent } from "../(legal)/legalContent";
import { BRAND_TI } from "@/lib/brand";

export const metadata = {
  title: `${BRAND_TI} Terms of Service`,
  description: `${BRAND_TI} Terms of Service for using the platform and submitting content.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <LegalPage title={`${BRAND_TI} Terms of Service`} lastUpdated="December 16, 2025" markdown={termsContent} />;
}
