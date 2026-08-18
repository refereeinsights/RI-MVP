export type NavigationLinks = {
  appleMaps: string;
  googleMaps: string;
  waze: string;
};

export function buildNavigationLinks(rawLocation: string): NavigationLinks | null {
  const location = String(rawLocation ?? "").trim();
  if (!location) return null;

  const encoded = encodeURIComponent(location);
  return {
    appleMaps: `https://maps.apple.com/?daddr=${encoded}`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    waze: `https://waze.com/ul?q=${encoded}&navigate=yes`,
  };
}
