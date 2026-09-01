import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <p>Corralio is a service of CO Services.</p>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
