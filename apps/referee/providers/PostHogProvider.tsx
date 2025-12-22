"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { PostHogProvider } from "posthog-js/react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
const IS_PROD = typeof window !== "undefined" && process.env.NODE_ENV === "production";

export default function PostHogClientProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    if (!POSTHOG_KEY || !IS_PROD) return;
    (async () => {
      const posthog = (await import("posthog-js")).default;
      if (cancelled) return;
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        autocapture: true,
        capture_pageview: false,
      });
      setClient(posthog);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!client) return;
    client.capture("$pageview", {
      $current_url: window.location.href,
    });
  }, [client, pathname, searchParams]);

  if (!POSTHOG_KEY || !IS_PROD || !client) {
    return <>{children}</>;
  }

  return <PostHogProvider client={client}>{children}</PostHogProvider>;
}
