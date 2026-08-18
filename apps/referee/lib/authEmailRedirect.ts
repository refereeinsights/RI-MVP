export function buildRiAuthEmailRedirect(origin: string): string {
  const redirect = new URL("/auth/confirm", origin);
  // Auth email templates append token parameters with `&`, so this RedirectTo must already contain a query parameter.
  redirect.searchParams.set("auth_callback", "1");
  return redirect.toString();
}
