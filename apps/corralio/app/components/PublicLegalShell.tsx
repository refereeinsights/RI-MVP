import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/app/components/BrandLogo";

export function PublicLegalShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="legalShell">
      <article className="legalCard">
        <Link className="legalBrand" href="/" aria-label="Corralio home">
          <BrandLogo />
        </Link>
        <header className="legalHeader">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p>Effective August 31, 2026</p>
        </header>
        <div className="legalContent">{children}</div>
      </article>
    </main>
  );
}
