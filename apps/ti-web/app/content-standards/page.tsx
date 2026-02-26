import LegalPage from "../(legal)/LegalPage";
import { contentStandardsContent } from "../(legal)/legalContent";
import { BRAND_TI } from "@/lib/brand";

export const metadata = {
  title: `${BRAND_TI} Content Standards`,
  description: `${BRAND_TI} community content standards and moderation rules.`,
  alternates: { canonical: "/content-standards" },
};

export default function ContentStandardsPage() {
  return (
    <LegalPage
      title={`${BRAND_TI} Content Standards`}
      lastUpdated="2026-02-26"
      markdown={contentStandardsContent}
    />
  );
}
