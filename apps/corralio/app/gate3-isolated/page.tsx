import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Gate3IsolatedClient } from "./Gate3IsolatedClient";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function Gate3IsolatedPage() {
  if (process.env.CORRALIO_GATE3_ISOLATED_RUNTIME !== "1") notFound();
  const siteKey = process.env.NEXT_PUBLIC_CORRALIO_GATE3_TURNSTILE_SITE_KEY?.trim();
  if (!siteKey) notFound();
  return <Gate3IsolatedClient siteKey={siteKey} />;
}
