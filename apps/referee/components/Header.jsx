"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function Header({ isAuthenticated = false }) {
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
      <div className="ri-header__top">
        <div className="ri-header__topInner">
          <Link className="ri-header__brand" href="/" aria-label="RefereeInsights home">
            {!logoFailed ? (
              // Use <img> to avoid Next Image config; the logo is in /public.
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

          <Link
            className={`ri-accountIcon ${isAuthenticated ? "is-auth" : "is-guest"}`}
            href={isAuthenticated ? "/account" : "/account/login"}
            aria-label={isAuthenticated ? "My account" : "Sign in"}
            title={isAuthenticated ? "My account" : "Sign in"}
          >
            <img className="ri-accountIcon__img" src="/referee-avatar.svg" alt="" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="ri-header__bottom">
        <div className="ri-header__bottomInner">
          <Link className="ri-listBtn" href="/tournaments/list" title="Submit a tournament">
            <span className="ri-listBtn__icon" aria-hidden="true">
              🏆
            </span>
            <span className="ri-listBtn__text">List your tournament</span>
          </Link>

          <span className="ri-betaPill">Public Beta</span>

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
          <Link className="ri-mobileLink" href="/tournaments/list" onClick={closeMenu}>
            List your tournament
          </Link>
          <Link
            className="ri-mobileCta"
            href={isAuthenticated ? "/account" : "/account/login"}
            onClick={closeMenu}
          >
            {isAuthenticated ? "Account" : "Login"}
          </Link>
        </nav>
      </div>
    </header>
  );
}
