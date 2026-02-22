"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { TiTier } from "@/lib/entitlements";
import styles from "./AccountIconMenu.module.css";

type AccountIconMenuProps = {
  tier: TiTier;
  isAuthed: boolean;
  needsEmailVerify: boolean;
};

function ringColor(tier: TiTier, isAuthed: boolean, needsEmailVerify: boolean) {
  if (!isAuthed) return "#dc2626";
  if (needsEmailVerify) return "#f59e0b";
  if (tier === "weekend_pro") return "#7c3aed";
  return "#6ee7b7";
}

export default function AccountIconMenu({ tier, isAuthed, needsEmailVerify }: AccountIconMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();

  const returnTo = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const encodedReturnTo = encodeURIComponent(returnTo);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current) return;
      const target = event.target as Node;
      if (!wrapRef.current.contains(target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.button}
        style={{ ["--ring-color" as string]: ringColor(tier, isAuthed, needsEmailVerify) }}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">👤</span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label="Account menu options">
          {!isAuthed ? (
            <>
              <Link className={styles.item} role="menuitem" href={`/login?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link className={styles.item} role="menuitem" href={`/signup?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Create free account
              </Link>
            </>
          ) : needsEmailVerify ? (
            <>
              <Link className={styles.item} role="menuitem" href={`/verify-email?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Verify email
              </Link>
              <div className={styles.divider} />
              <Link className={styles.item} role="menuitem" href={`/logout?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Sign out
              </Link>
            </>
          ) : (
            <>
              <Link className={styles.item} role="menuitem" href="/account" onClick={() => setOpen(false)}>
                Account
              </Link>
              <div className={styles.divider} />
              <Link className={styles.item} role="menuitem" href={`/logout?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Sign out
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
