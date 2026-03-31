"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TI_SPORTS, TI_SPORT_LABELS, type TiSport } from "@/lib/tiSports";
import { type TiTier } from "@/lib/entitlements";
import { ALERT_START_OFFSET_DAYS, computeAlertWindowUtc, getTierCaps } from "@/lib/tournamentAlerts";
import styles from "../AccountPage.module.css";

export type AlertClientRow = {
  id: string;
  name: string | null;
  zip_code: string;
  radius_miles: number;
  days_ahead: number;
  sport: string | null;
  cadence: "weekly" | "daily";
  is_active: boolean;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type AlertsClientProps = {
  initialAlerts: AlertClientRow[];
  tier: TiTier;
  defaultZip: string;
  recipientEmail: string;
};

function formatCadence(value: "weekly" | "daily") {
  return value === "daily" ? "Daily" : "Weekly";
}

function formatSport(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "Any sport";
  return TI_SPORT_LABELS[normalized as TiSport] ?? normalized;
}

function formatLastSent(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function AlertsClient({ initialAlerts, tier, defaultZip, recipientEmail }: AlertsClientProps) {
  const [alerts, setAlerts] = useState<AlertClientRow[]>(initialAlerts);
  const [status, setStatus] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const caps = useMemo(() => getTierCaps(tier === "weekend_pro" ? "weekend_pro" : "insider"), [tier]);

  const [form, setForm] = useState<{
    editingId: string | null;
    name: string;
    zip: string;
    radius: string;
    daysAhead: string;
    sport: string;
    cadence: "weekly" | "daily";
  }>(() => ({
    editingId: null,
    name: "",
    zip: defaultZip || "",
    radius: String(Math.min(25, caps.maxRadiusMiles)),
    daysAhead: String(Math.min(14, caps.maxDaysAhead)),
    sport: "",
    cadence: caps.allowedCadences.includes("daily") ? "weekly" : "weekly",
  }));

  const activeCount = useMemo(() => alerts.filter((a) => a.is_active).length, [alerts]);

  const effectiveWindow = useMemo(() => {
    const days = Number(form.daysAhead || "0");
    if (!Number.isFinite(days) || days <= 0) return null;
    return computeAlertWindowUtc(days);
  }, [form.daysAhead]);

  function startCreate() {
    setForm((prev) => ({
      ...prev,
      editingId: null,
      name: "",
      zip: defaultZip || prev.zip,
      radius: String(Math.min(Number(prev.radius || "25") || 25, caps.maxRadiusMiles)),
      daysAhead: String(Math.min(Number(prev.daysAhead || "14") || 14, caps.maxDaysAhead)),
      sport: "",
      cadence: caps.allowedCadences.includes("daily") ? "weekly" : "weekly",
    }));
    setStatus("");
  }

  function startEdit(alert: AlertClientRow) {
    setForm({
      editingId: alert.id,
      name: alert.name ?? "",
      zip: alert.zip_code,
      radius: String(alert.radius_miles),
      daysAhead: String(alert.days_ahead),
      sport: alert.sport ?? "",
      cadence: alert.cadence,
    });
    setStatus("");
  }

  function clearEdit() {
    setForm((prev) => ({ ...prev, editingId: null }));
    setStatus("");
  }

  async function refresh() {
    const res = await fetch("/api/account/alerts", { method: "GET" });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) throw new Error("Failed to load alerts.");
    setAlerts((json.alerts ?? []) as AlertClientRow[]);
  }

  async function saveForm() {
    if (busyId) return;
    setStatus("");

    const payload = {
      name: form.name,
      zip_code: form.zip,
      radius_miles: Number(form.radius),
      days_ahead: Number(form.daysAhead),
      sport: form.sport || null,
      cadence: form.cadence,
    };

    const editing = Boolean(form.editingId);
    const id = form.editingId;
    const url = editing ? `/api/account/alerts/${encodeURIComponent(id ?? "")}` : "/api/account/alerts";
    const method = editing ? "PATCH" : "POST";

    setBusyId(editing ? id! : "create");
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const message = translateError(json?.code, json?.error, caps);
        setStatus(message);
        return;
      }
      await refresh();
      setStatus(editing ? "Alert updated." : "Alert created.");
      if (!editing) startCreate();
      if (editing) clearEdit();
    } catch {
      setStatus("Unable to save alert.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(alert: AlertClientRow) {
    if (busyId) return;
    setBusyId(alert.id);
    setStatus("");
    try {
      const res = await fetch(`/api/account/alerts/${encodeURIComponent(alert.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: !alert.is_active }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const message = translateError(json?.code, json?.error, caps);
        setStatus(message);
        return;
      }
      await refresh();
    } catch {
      setStatus("Unable to update alert.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAlert(alert: AlertClientRow) {
    if (busyId) return;
    const confirmed = window.confirm("Delete this alert?");
    if (!confirmed) return;

    setBusyId(alert.id);
    setStatus("");
    try {
      const res = await fetch(`/api/account/alerts/${encodeURIComponent(alert.id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setStatus("Unable to delete alert.");
        return;
      }
      await refresh();
    } catch {
      setStatus("Unable to delete alert.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Your alerts</h2>
        <p className={styles.fieldHelp} style={{ margin: 0 }}>
          {tier === "weekend_pro"
            ? `Weekend Pro: up to ${caps.maxActiveAlerts} active alerts · daily or weekly cadence`
            : `Insider: ${caps.maxActiveAlerts} active alert · weekly cadence only`}
          {" · "}
          Radius cap: {caps.maxRadiusMiles} miles · “How far ahead” cap: {caps.maxDaysAhead} days
        </p>
        <p className={styles.fieldHelp} style={{ margin: 0 }}>
          Planning window: tournaments starting between <strong>today + {ALERT_START_OFFSET_DAYS}</strong> days and{" "}
          <strong>today + {ALERT_START_OFFSET_DAYS} + how-far-ahead</strong>.
          {effectiveWindow ? (
            <>
              {" "}
              Current window: <strong>{effectiveWindow.start}</strong> → <strong>{effectiveWindow.end}</strong>.
            </>
          ) : null}
        </p>

        {alerts.length === 0 ? (
          <div className={styles.emptyState}>
            <p>You don&apos;t have any alerts yet.</p>
            <button type="button" className={styles.primaryAction} onClick={startCreate}>
              Create an alert
            </button>
          </div>
        ) : (
          <div className={styles.savedList}>
            {alerts.map((alert) => (
              <div className={styles.savedRow} key={alert.id}>
                <div className={styles.savedRowMain}>
                  <div className={styles.savedRowName}>{alert.name?.trim() || "Tournament alert"}</div>
                  <div className={styles.savedRowMeta}>
                    {formatCadence(alert.cadence)} · {alert.zip_code} · {alert.radius_miles} mi · {alert.days_ahead} days ·{" "}
                    {formatSport(alert.sport)}
                  </div>
                  <div className={styles.savedRowMeta}>
                    Status: <strong>{alert.is_active ? "Active" : "Paused"}</strong> · Last sent: {formatLastSent(alert.last_sent_at)}
                  </div>
                </div>
                <div className={styles.savedRowActions}>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => startEdit(alert)}
                    disabled={busyId !== null}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryAction}
                    onClick={() => toggleActive(alert)}
                    disabled={busyId === alert.id}
                  >
                    {alert.is_active ? "Pause" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => deleteAlert(alert)}
                    disabled={busyId === alert.id}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {status ? <div className={styles.inlineStatus}>{status}</div> : null}
      </section>

      <section className={styles.sectionCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 className={styles.sectionTitle}>{form.editingId ? "Edit alert" : "Create alert"}</h2>
          {form.editingId ? (
            <button type="button" className={styles.secondaryAction} onClick={clearEdit} disabled={busyId !== null}>
              Cancel edit
            </button>
          ) : (
            <button type="button" className={styles.secondaryAction} onClick={startCreate} disabled={busyId !== null}>
              Reset
            </button>
          )}
        </div>

        <p className={styles.fieldHelp} style={{ margin: 0 }}>
          Alerts will send to <strong>{recipientEmail || "your sign-in email"}</strong>. You can change your email on{" "}
          <Link href="/account">Account</Link>.
        </p>

        <div className={styles.profileForm}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Alert name</span>
            <span className={styles.fieldHelp}>Optional.</span>
            <input
              className={styles.textInput}
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g., Soccer tournaments near home"
              disabled={busyId !== null}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>ZIP code</span>
            <span className={styles.fieldHelp}>US-only for v1.</span>
            <input
              className={styles.textInput}
              value={form.zip}
              onChange={(e) => setForm((p) => ({ ...p, zip: e.target.value }))}
              placeholder="99216"
              inputMode="numeric"
              disabled={busyId !== null}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Radius (miles)</span>
            <span className={styles.fieldHelp}>Max {caps.maxRadiusMiles} for your tier.</span>
            <input
              className={styles.textInput}
              value={form.radius}
              onChange={(e) => setForm((p) => ({ ...p, radius: e.target.value }))}
              inputMode="numeric"
              disabled={busyId !== null}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>How far ahead should we look?</span>
            <span className={styles.fieldHelp}>
              {buildAheadHelperText({
                daysAheadInput: form.daysAhead,
                maxDaysAhead: caps.maxDaysAhead,
                effectiveWindow,
              })}
            </span>
            <input
              className={styles.textInput}
              value={form.daysAhead}
              onChange={(e) => setForm((p) => ({ ...p, daysAhead: e.target.value }))}
              inputMode="numeric"
              disabled={busyId !== null}
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sport</span>
            <span className={styles.fieldHelp}>Optional.</span>
            <select
              className={styles.textInput}
              value={form.sport}
              onChange={(e) => setForm((p) => ({ ...p, sport: e.target.value }))}
              disabled={busyId !== null}
            >
              <option value="">Any sport</option>
              {TI_SPORTS.map((sport) => (
                <option key={sport} value={sport}>
                  {TI_SPORT_LABELS[sport]}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cadence</span>
            <span className={styles.fieldHelp}>
              {caps.allowedCadences.includes("daily") ? "Choose daily or weekly." : "Weekly only for Insider."}{" "}
              {tier !== "weekend_pro" ? (
                <>
                  <Link href="/premium" className={styles.secondaryAction} style={{ marginLeft: 8 }}>
                    Upgrade
                  </Link>
                </>
              ) : null}
            </span>
            <select
              className={styles.textInput}
              value={form.cadence}
              onChange={(e) => setForm((p) => ({ ...p, cadence: e.target.value as any }))}
              disabled={busyId !== null || !caps.allowedCadences.includes("daily")}
            >
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.primaryAction}
              onClick={saveForm}
              disabled={busyId !== null || (activeCount >= caps.maxActiveAlerts && !form.editingId)}
            >
              {busyId ? "Saving..." : form.editingId ? "Save changes" : "Create alert"}
            </button>
            {activeCount >= caps.maxActiveAlerts && !form.editingId ? (
              <span className={styles.fieldHelp} style={{ margin: 0 }}>
                You&apos;ve hit your active alert limit ({caps.maxActiveAlerts}).{" "}
                {tier !== "weekend_pro" ? <Link href="/premium">Upgrade</Link> : "Pause an existing alert to create another."}
              </span>
            ) : null}
          </div>
        </div>
      </section>
    </>
  );
}

function translateError(code: string | undefined, fallback: string | undefined, caps: ReturnType<typeof getTierCaps>) {
  if (code === "ALERT_LIMIT_REACHED") return `You’ve hit your active alert limit (${caps.maxActiveAlerts}).`;
  if (code === "CADENCE_NOT_ALLOWED") return "That cadence isn’t available on your tier.";
  if (code === "RADIUS_TOO_LARGE") return `Radius too large. Max is ${caps.maxRadiusMiles} miles.`;
  if (code === "DAYS_AHEAD_TOO_LARGE") return `How far ahead is too large. Max is ${caps.maxDaysAhead} days.`;
  if (code === "ZIP_NOT_SUPPORTED") return "That ZIP code isn’t supported yet.";
  if (code === "INVALID_ZIP") return "Enter a valid US ZIP code.";
  if (code === "INVALID_RADIUS") return "Enter a valid radius in miles.";
  if (code === "INVALID_DAYS_AHEAD") return "Enter a valid number of days ahead.";
  if (code === "EMAIL_UNVERIFIED") return "Verify your email to use alerts.";
  if (code === "INSIDER_REQUIRED") return "Create a free Insider account to use alerts.";
  if (fallback) return fallback;
  return "Something went wrong.";
}

function buildAheadHelperText(args: {
  daysAheadInput: string;
  maxDaysAhead: number;
  effectiveWindow: { start: string; end: string } | null;
}) {
  const minWeeks = Math.ceil(ALERT_START_OFFSET_DAYS / 7);

  const days = Number(args.daysAheadInput || "0");
  if (!Number.isFinite(days) || days <= 0) {
    const maxWeeks = Math.ceil((ALERT_START_OFFSET_DAYS + args.maxDaysAhead) / 7);
    return `We’ll show tournaments starting ${minWeeks}–${maxWeeks} weeks from now`;
  }

  const clamped = Math.min(Math.floor(days), args.maxDaysAhead);
  const maxWeeks = Math.ceil((ALERT_START_OFFSET_DAYS + clamped) / 7);
  const rangeLabel = args.effectiveWindow ? `${args.effectiveWindow.start} → ${args.effectiveWindow.end}` : null;
  return rangeLabel
    ? `We’ll show tournaments starting between ${rangeLabel} (${minWeeks}–${maxWeeks} weeks from now)`
    : `We’ll show tournaments starting ${minWeeks}–${maxWeeks} weeks from now`;
}
