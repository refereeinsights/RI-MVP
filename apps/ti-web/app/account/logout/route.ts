import { NextResponse, type NextRequest } from "next/server";
import { sanitizeReturnTo } from "@/lib/returnTo";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const returnTo = sanitizeReturnTo(req.nextUrl.searchParams.get("returnTo"), "/");
  const url = new URL("/logout", req.url);
  if (returnTo && returnTo !== "/") url.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(url);
}

