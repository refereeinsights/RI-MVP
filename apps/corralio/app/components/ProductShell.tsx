import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/app/actions";
import { isProductSectionActive, PRODUCT_NAV_ITEMS, type ProductSection } from "@/lib/productShell";
import { BrandLogo } from "./BrandLogo";

export function ProductShell({ activeSection, children }: { activeSection: ProductSection; children: ReactNode }) {
  return (
    <div className="appShell">
      <header className="appHeader">
        <div className="appHeaderTopline">
          <Link className="appBrandLink" href="/" aria-label="Corralio home">
            <BrandLogo tone="dark-background" />
          </Link>
          <nav className="accountNav" aria-label="Account">
            <Link href="/account">Account</Link>
            <form action={signOut}><button className="textButton" type="submit">Sign out</button></form>
          </nav>
        </div>
        <nav className="productNav" aria-label="Family planner">
          {PRODUCT_NAV_ITEMS.map((item) => {
            const active = isProductSectionActive(activeSection, item.key);
            return <Link href={item.href} aria-current={active ? "page" : undefined} key={item.key}>{item.label}</Link>;
          })}
        </nav>
      </header>
      <main className="appContent">{children}</main>
    </div>
  );
}
