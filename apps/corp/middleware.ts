import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const ALLOWED_EXACT_PATHS = new Set([
  "/",
  "/tournaments",
  "/referees",
  "/about",
  "/robots.txt",
  "/favicon.ico",
  "/sitemap.xml",
]);

function isKnownPath(pathname: string) {
  if (ALLOWED_EXACT_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/tournament/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/svg/")) return true;
  if (pathname.includes(".")) return true;
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isKnownPath(pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL("/", request.url), 301);
}

export const config = {
  matcher: "/:path*",
};
