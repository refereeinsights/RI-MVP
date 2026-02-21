import LegalPage from "../(legal)/LegalPage";
import { disclaimerContent } from "../(legal)/legalContent";
import { BRAND_TI } from "@/lib/brand";

export const metadata = {
  title: `${BRAND_TI} Review & Content Disclaimer`,
  description: `${BRAND_TI} disclaimer about directory content and third-party links.`,
  alternates: { canonical: "/disclaimer" },
};

export default function DisclaimerPage() {
  return (
    <LegalPage
      title={`${BRAND_TI} Review & Content Disclaimer`}
      lastUpdated="December 16, 2025"
      markdown={disclaimerContent}
    />
  );
}
