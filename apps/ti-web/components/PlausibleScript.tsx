'use client';

import Script from "next/script";

type Props = {
  domain: string;
};

export default function PlausibleScript({ domain }: Props) {
  return (
    <Script
      {...({
        src: "https://plausible.io/js/script.js",
        "data-domain": domain,
        strategy: "afterInteractive",
      } as any)}
    />
  );
}
