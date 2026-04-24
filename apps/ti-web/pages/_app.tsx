import type { AppProps } from "next/app";

export default function TiApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

