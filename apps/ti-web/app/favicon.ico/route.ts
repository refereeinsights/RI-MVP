import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const url = new URL(req.url);
  url.pathname = "/ti-logo.png";
  url.search = "";
  return NextResponse.redirect(url, { status: 307 });
}

