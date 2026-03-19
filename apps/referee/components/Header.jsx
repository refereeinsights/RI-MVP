"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function Header() {
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
      <div className="ri-header__inner">
        <Link className="ri-header__brand" href="/" aria-label="RefereeInsights home">
          {!logoFailed ? (
            // Using <img> keeps this component framework-agnostic and avoids Next image config.
            // Reserve size via CSS to prevent layout shift even if this fails.
            <img
              className="ri-header__logo"
              src="/ri_new_logo_transparent.png"
              alt="RefereeInsights"
              onError={() => setLogoFailed(true)}
              draggable="false"
            />
          ) : (
            <span className="ri-header__brandText">RefereeInsights</span>
          )}
        </Link>

        <nav className="ri-header__nav" aria-label="Primary">
          <Link className="ri-navLink" href="/tournaments">
            Tournaments
          </Link>
          <Link className="ri-navLink" href="/venues">
            Venues
          </Link>
          <Link className="ri-navLink" href="/assignments">
            Assignments
          </Link>
        </nav>

        <div className="ri-header__right">
          <Link className="ri-loginBtn" href="/account/login">
            Login
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

      <div
        id="ri-mobile-menu"
        className={`ri-mobileMenu ${menuOpen ? "is-open" : ""}`}
        hidden={!menuOpen}
      >
        <nav className="ri-mobileMenu__panel" aria-label="Mobile">
          <Link className="ri-mobileLink" href="/tournaments" onClick={closeMenu}>
            Tournaments
          </Link>
          <Link className="ri-mobileLink" href="/venues" onClick={closeMenu}>
            Venues
          </Link>
          <Link className="ri-mobileLink" href="/assignments" onClick={closeMenu}>
            Assignments
          </Link>
          <Link className="ri-mobileCta" href="/account/login" onClick={closeMenu}>
            Login
          </Link>
        </nav>
      </div>
    </header>
  );
}

