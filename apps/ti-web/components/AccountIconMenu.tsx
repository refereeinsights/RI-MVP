"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TiTier } from "@/lib/entitlements";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authedOverride, setAuthedOverride] = useState<boolean | null>(null);
  const [needsVerifyOverride, setNeedsVerifyOverride] = useState<boolean | null>(null);

  const returnTo = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const encodedReturnTo = encodeURIComponent(returnTo);
  const signOutReturnTo = pathname.startsWith("/account") || pathname.startsWith("/verify-email") ? "/" : returnTo;
  const encodedSignOutReturnTo = encodeURIComponent(signOutReturnTo);

  const effectiveIsAuthed = authedOverride ?? isAuthed;
  const effectiveNeedsVerify = effectiveIsAuthed ? (needsVerifyOverride ?? needsEmailVerify) : false;
  const shouldShowUpgrade = effectiveIsAuthed && !effectiveNeedsVerify && tier !== "weekend_pro";

  useEffect(() => {
    let alive = true;
    const supabase = getSupabaseBrowserClient();

    const sync = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!alive) return;
        setAuthedOverride(Boolean(user));
        setNeedsVerifyOverride(Boolean(user && !user.email_confirmed_at));
      } catch {
        if (!alive) return;
        setAuthedOverride(false);
        setNeedsVerifyOverride(false);
      }
    };

    sync();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const user = session?.user ?? null;
      setAuthedOverride(Boolean(user));
      setNeedsVerifyOverride(Boolean(user && !user.email_confirmed_at));
    });

    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setOpen(false);
    setAuthedOverride(false);
    setNeedsVerifyOverride(false);
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      router.refresh();
      if (signOutReturnTo && signOutReturnTo !== returnTo) {
        router.push(signOutReturnTo);
      }
    }
  }

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
        style={{ ["--ring-color" as string]: ringColor(tier, effectiveIsAuthed, effectiveNeedsVerify) }}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">👤</span>
      </button>
      {open ? (
        <div className={styles.menu} role="menu" aria-label="Account menu options">
          {!effectiveIsAuthed ? (
            <>
              <Link className={styles.item} role="menuitem" href={`/login?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link className={styles.item} role="menuitem" href={`/signup?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Create free account
              </Link>
            </>
          ) : effectiveNeedsVerify ? (
            <>
              <Link className={styles.item} role="menuitem" href={`/verify-email?returnTo=${encodedReturnTo}`} onClick={() => setOpen(false)}>
                Verify email
              </Link>
              <div className={styles.divider} />
              <button className={styles.item} role="menuitem" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          ) : (
            <>
              {shouldShowUpgrade ? (
                <Link className={styles.item} role="menuitem" href="/premium" onClick={() => setOpen(false)}>
                  Upgrade to Weekend Pro
                </Link>
              ) : null}
              {shouldShowUpgrade ? <div className={styles.divider} /> : null}
              <Link className={styles.item} role="menuitem" href="/account" onClick={() => setOpen(false)}>
                Account
              </Link>
              <div className={styles.divider} />
              <button className={styles.item} role="menuitem" type="button" onClick={handleSignOut}>
                Sign out
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
