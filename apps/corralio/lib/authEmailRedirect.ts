export function buildCorralioAuthEmailRedirect(origin: string): string {
  const redirect = new URL("/auth/confirm", origin);
  // Auth email templates append token parameters with `&`, so this RedirectTo must already contain a query parameter.
  redirect.searchParams.set("brand", "corralio");
  return redirect.toString();
}
