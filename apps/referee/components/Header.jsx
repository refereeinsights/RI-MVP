"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function Header({ isAuthenticated = false }) {
  const shouldPrefetch = process.env.NODE_ENV === "production";
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const toggleRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) return;
    // Return focus to the hamburger for keyboard users after close.
    toggleRef.current?.focus?.();
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="ri-header">
      <div className="ri-header-shell">
        <Link href="/" className="ri-logo" aria-label="RefereeInsights home" prefetch={shouldPrefetch}>
          {!logoFailed ? (
            <img
              className="ri-logo-img"
              src="/ri_header_logo_tm_white.png"
              alt="RefereeInsights"
              onError={() => setLogoFailed(true)}
              draggable="false"
            />
          ) : (
            <span className="ri-logo-fallback">RefereeInsights</span>
          )}
        </Link>

        <div className="ri-pill" title="RefereeInsights is in public beta">
          <span className="ri-pill-dot" aria-hidden="true" />
          {"Public\nBeta"}
        </div>

        <nav className="ri-nav" aria-label="Main navigation">
          <Link href="/tournaments" prefetch={shouldPrefetch}>Tournaments</Link>
          <Link href="/venues" prefetch={shouldPrefetch}>Venues</Link>
          <Link href="/assignors" prefetch={shouldPrefetch}>Assignors</Link>
        </nav>

        <div className="ri-header-actions">
          <Link href="/tournaments/list" className="ri-cta" title="Submit a tournament" prefetch={shouldPrefetch}>
            <span aria-hidden="true">🏆</span>
            List your tournament
          </Link>

          <div className="ri-auth-links" aria-label="Account actions">
            {!isAuthenticated ? (
              <Link href="/signup?returnTo=%2Faccount" className="ri-signup" prefetch={shouldPrefetch}>
                Sign up
              </Link>
            ) : null}

            <Link
              className={`ri-accountIcon ${isAuthenticated ? "is-auth" : "is-guest"}`}
              href={isAuthenticated ? "/account" : "/account/login"}
              prefetch={shouldPrefetch}
              aria-label={isAuthenticated ? "My account" : "Sign in"}
              title={isAuthenticated ? "My account" : "Sign in"}
            >
              <img className="ri-accountIcon__img" src="/referee-avatar.svg" alt="" aria-hidden="true" />
            </Link>

            <button
              ref={toggleRef}
              type="button"
              className="ri-menuToggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen ? "true" : "false"}
              aria-controls="ri-mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="ri-menuToggle__bars" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        id="ri-mobile-menu"
        className={`ri-mobileMenu ${menuOpen ? "is-open" : ""}`}
        hidden={!menuOpen}
      >
        <nav className="ri-mobileMenu__panel" aria-label="Mobile">
          <Link className="ri-mobileLink" href="/tournaments" onClick={closeMenu} prefetch={shouldPrefetch}>
            Tournaments
          </Link>
          <Link className="ri-mobileLink" href="/venues" onClick={closeMenu} prefetch={shouldPrefetch}>
            Venues
          </Link>
          <Link className="ri-mobileLink" href="/assignors" onClick={closeMenu} prefetch={shouldPrefetch}>
            Assignors
          </Link>
          <Link className="ri-mobileLink" href="/tournaments/list" onClick={closeMenu} prefetch={shouldPrefetch}>
            List your tournament
          </Link>
          <Link
            className="ri-mobileCta"
            href={isAuthenticated ? "/account" : "/account/login"}
            onClick={closeMenu}
            prefetch={shouldPrefetch}
          >
            {isAuthenticated ? "Account" : "Login"}
          </Link>
          {!isAuthenticated ? (
            <Link className="ri-mobileLink" href="/signup?returnTo=%2Faccount" onClick={closeMenu} prefetch={shouldPrefetch}>
              Sign up
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
