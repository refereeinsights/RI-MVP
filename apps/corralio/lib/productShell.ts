export const PRODUCT_NAV_ITEMS = [
  { href: "/", label: "This Weekend", key: "weekend" },
  { href: "/upcoming", label: "Upcoming", key: "upcoming" },
  { href: "/family", label: "Family", key: "family" },
] as const;

export type ProductSection = (typeof PRODUCT_NAV_ITEMS)[number]["key"];

export function isProductSectionActive(section: ProductSection, item: ProductSection) {
  return section === item;
}
