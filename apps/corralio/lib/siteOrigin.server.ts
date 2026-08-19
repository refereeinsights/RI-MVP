import "server-only";

import { parseCorralioSiteOrigin } from "@/lib/siteOrigin";

export function getCorralioSiteOrigin(): string {
  return parseCorralioSiteOrigin(process.env.CORRALIO_SITE_URL);
}
