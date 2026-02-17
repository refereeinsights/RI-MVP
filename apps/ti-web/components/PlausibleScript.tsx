'use client';

import Script, { type ScriptProps } from "next/script";

type Props = {
  domain: string;
};

export default function PlausibleScript({ domain }: Props) {
  return (
    <Script
      src="https://plausible.io/js/script.js"
      {...({ "data-domain": domain } satisfies Record<string, string>)}
      strategy={"afterInteractive" satisfies ScriptProps["strategy"]}
    />
  );
}
