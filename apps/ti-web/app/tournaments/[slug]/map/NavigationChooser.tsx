"use client";

import { useMemo } from "react";
import styles from "./TournamentVenueMap.module.css";

export type NavProvider = "apple" | "google" | "waze" | "copy";

type Props = {
  open: boolean;
  title: string;
  destinationLabel: string;
  providerHrefs: Partial<Record<NavProvider, string>>;
  copyText?: string | null;
  onClose: () => void;
  onProviderClick?: (provider: NavProvider) => void;
};

export default function NavigationChooser({
  open,
  title,
  destinationLabel,
  providerHrefs,
  copyText,
  onClose,
  onProviderClick,
}: Props) {
  const hasApple = Boolean(providerHrefs.apple);
  const items = useMemo(() => {
    const list: Array<{ provider: NavProvider; label: string; href?: string }> = [];
    if (hasApple) list.push({ provider: "apple", label: "Apple Maps", href: providerHrefs.apple });
    if (providerHrefs.google) list.push({ provider: "google", label: "Google Maps", href: providerHrefs.google });
    if (providerHrefs.waze) list.push({ provider: "waze", label: "Waze", href: providerHrefs.waze });
    list.push({ provider: "copy", label: "Copy address" });
    return list;
  }, [hasApple, providerHrefs.apple, providerHrefs.google, providerHrefs.waze]);

  if (!open) return null;

  const doCopy = async () => {
    const text = String(copyText ?? "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className={styles.navSheetBackdrop} role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className={styles.navSheetDismiss} aria-label="Close" onClick={onClose} />
      <div className={styles.navSheet}>
        <div className={styles.navSheetHeader}>
          <div>
            <div className={styles.navSheetTitle}>{title}</div>
            <div className={styles.navSheetSub}>{destinationLabel}</div>
          </div>
          <button type="button" className={styles.navSheetCloseBtn} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.navSheetActions}>
          {items.map((item) => {
            const disabled = item.provider === "copy" ? !String(copyText ?? "").trim() : !item.href;
            const label = item.provider === "copy" && !String(copyText ?? "").trim() ? "Copy unavailable" : item.label;
            if (item.provider === "copy") {
              return (
                <button
                  key={item.provider}
                  type="button"
                  className={styles.navSheetActionBtn}
                  disabled={disabled}
                  onClick={async () => {
                    onProviderClick?.("copy");
                    await doCopy();
                    onClose();
                  }}
                >
                  {label}
                </button>
              );
            }
            return (
              <a
                key={item.provider}
                className={styles.navSheetActionBtn}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  onProviderClick?.(item.provider);
                  onClose();
                }}
                aria-disabled={disabled ? "true" : "false"}
              >
                {label}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

