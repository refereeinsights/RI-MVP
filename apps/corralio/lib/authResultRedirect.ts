import { NextResponse } from "next/server";

const SAFE_AUTH_RESULT_PATHS = new Set([
  "/",
  "/?auth=invalid",
  "/?auth=unavailable",
  "/?auth=expired",
]);

export type CorralioAuthResultPath =
  | "/"
  | "/?auth=invalid"
  | "/?auth=unavailable"
  | "/?auth=expired";

export function createCorralioAuthResultRedirect(path: CorralioAuthResultPath) {
  if (!SAFE_AUTH_RESULT_PATHS.has(path)) {
    throw new Error("Unsupported Corralio auth result path");
  }

  // A relative Location header preserves the browser-facing callback origin.
  // This matters when `next dev` listens on 0.0.0.0 but the browser uses
  // localhost or a LAN hostname. It also avoids trusting forwarded host data.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: path },
  });
}
