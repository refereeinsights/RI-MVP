"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./AccountPage.module.css";

export type SavedTournamentItem = {
  tournament_id: string;
  slug: string | null;
  name: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
};

type SavedTournamentsSectionProps = {
  initialItems: SavedTournamentItem[];
};

function formatDate(value: string | null) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateRange(start: string | null, end: string | null) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e && s !== e) return `${s} - ${e}`;
  return s || e || "Dates TBA";
}

function formatLocation(city: string | null, state: string | null) {
  const parts = [city, state].filter(Boolean);
  return parts.length ? parts.join(", ") : "Location TBA";
}

export default function SavedTournamentsSection({ initialItems }: SavedTournamentsSectionProps) {
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDate = a.start_date ?? "9999-12-31";
      const bDate = b.start_date ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [items]);

  async function removeSaved(tournamentId: string) {
    if (!tournamentId || busyId) return;
    setBusyId(tournamentId);
    setStatus("");
    try {
      const response = await fetch(`/api/saved-tournaments/${encodeURIComponent(tournamentId)}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        setStatus("Unable to remove saved tournament.");
        return;
      }
      setItems((prev) => prev.filter((row) => row.tournament_id !== tournamentId));
      setStatus("Removed.");
    } catch {
      setStatus("Unable to remove saved tournament.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.sectionCard}>
      <h2 className={styles.sectionTitle}>My Saved Tournaments</h2>
      {sortedItems.length === 0 ? (
        <div className={styles.emptyState}>
          <p>You haven&apos;t saved any tournaments yet.</p>
          <Link href="/tournaments" className={styles.primaryAction}>
            Browse tournaments
          </Link>
        </div>
      ) : (
        <div className={styles.savedList}>
          {sortedItems.map((item) => (
            <div className={styles.savedRow} key={item.tournament_id}>
              <div className={styles.savedRowMain}>
                <div className={styles.savedRowName}>{item.name || "Tournament"}</div>
                <div className={styles.savedRowMeta}>{formatDateRange(item.start_date, item.end_date)}</div>
                <div className={styles.savedRowMeta}>{formatLocation(item.city, item.state)}</div>
              </div>
              <div className={styles.savedRowActions}>
                {item.slug ? (
                  <Link className={styles.secondaryAction} href={`/tournaments/${item.slug}`}>
                    View
                  </Link>
                ) : null}
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeSaved(item.tournament_id)}
                  disabled={busyId === item.tournament_id}
                >
                  {busyId === item.tournament_id ? "Removing..." : "Remove"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {status ? <div className={styles.inlineStatus}>{status}</div> : null}
    </section>
  );
}

