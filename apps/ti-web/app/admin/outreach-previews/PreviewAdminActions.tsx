"use client";

import type { CSSProperties } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PreviewAdminActionsProps = {
  previewId: string;
  tournamentId: string | null;
  previewLabel: string;
  campaignId: string;
  sport: string;
  directorEmail: string;
  directorRepliedAt: string | null;
  directorEmailFilter: string;
  defaultTestEmail: string;
  isSuppressed: boolean;
};

export default function PreviewAdminActions({
  previewId,
  tournamentId,
  previewLabel,
  campaignId,
  sport,
  directorEmail,
  directorRepliedAt,
  directorEmailFilter,
  defaultTestEmail,
  isSuppressed,
}: PreviewAdminActionsProps) {
  const router = useRouter();
  const [testEmail, setTestEmail] = useState(defaultTestEmail);
  const [editedDirectorEmail, setEditedDirectorEmail] = useState(directorEmail);
  const [replyNote, setReplyNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const hasDirectorEmail = isValidEmail(directorEmail);
  const hasEditedDirectorEmail = isValidEmail(editedDirectorEmail);

  const filtersHref = useMemo(() => {
    const params = new URLSearchParams();
    if (campaignId) params.set("campaign_id", campaignId);
    if (sport) params.set("sport", sport);
    if (directorEmailFilter) params.set("director_email", directorEmailFilter);
    return `/admin/outreach-previews${params.toString() ? `?${params.toString()}` : ""}`;
  }, [campaignId, directorEmailFilter, sport]);

  async function handleSendTest() {
    setMessage("");
    const response = await fetch("/api/outreach/send-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preview_id: previewId,
        email: testEmail,
      }),
    });

    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to send test email.");
      return;
    }

    setMessage(`Test email sent to ${testEmail}.`);
    router.refresh();
  }

  async function handleSendDirector() {
    if (!hasDirectorEmail) {
      setMessage("Director email is missing or invalid.");
      return;
    }

    setMessage("");
    const response = await fetch("/api/outreach/send-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preview_id: previewId,
        email: directorEmail,
      }),
    });

    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to send director email.");
      return;
    }

    setMessage(`Email sent to ${directorEmail}.`);
    router.refresh();
  }

  async function handleDeleteSelected() {
    setMessage("");
    const response = await fetch("/api/outreach/previews", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: previewId }),
    });

    const json = (await response.json().catch(() => ({}))) as { deleted?: number; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to delete preview.");
      return;
    }

    setMessage(`Deleted ${json.deleted ?? 0} preview.`);
    router.push(filtersHref);
    router.refresh();
  }

  async function handleDeleteCampaign() {
    if (!campaignId) {
      setMessage("Set a campaign filter before deleting campaign previews.");
      return;
    }

    setMessage("");
    const response = await fetch("/api/outreach/previews", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        sport,
      }),
    });

    const json = (await response.json().catch(() => ({}))) as { deleted?: number; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to delete campaign previews.");
      return;
    }

    setMessage(`Deleted ${json.deleted ?? 0} preview${json.deleted === 1 ? "" : "s"} from ${campaignId}.`);
    router.push(filtersHref);
    router.refresh();
  }

  async function handleSuppressTournament() {
    if (!tournamentId) {
      setMessage("This preview is not linked to a tournament id.");
      return;
    }

    setMessage("");
    const response = await fetch("/api/outreach/suppressions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        preview_id: previewId,
        tournament_id: tournamentId,
        sport,
        director_email: directorEmail,
        reason: "removed",
      }),
    });

    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to suppress tournament.");
      return;
    }

    setMessage(`Suppressed ${previewLabel} from future outreach and removed it from this preview batch.`);
    router.push(filtersHref);
    router.refresh();
  }

  async function handleUpdateDirectorEmail() {
    if (!tournamentId) {
      setMessage("This preview is not linked to a tournament id.");
      return;
    }
    if (!hasEditedDirectorEmail) {
      setMessage("Enter a valid email address.");
      return;
    }

    setMessage("");
    const response = await fetch("/api/outreach/update-director-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournament_id: tournamentId,
        director_email: editedDirectorEmail.trim().toLowerCase(),
        preview_id: previewId,
      }),
    });

    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to update director email.");
      return;
    }

    setMessage("Director email updated (tournament + preview).");
    router.refresh();
  }

  async function handleMarkReplied(replied: boolean) {
    setMessage("");
    const response = await fetch("/api/outreach/mark-replied", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preview_id: previewId,
        replied,
        note: replyNote.trim() || undefined,
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!response.ok) {
      setMessage(json.error || "Unable to update replied status.");
      return;
    }
    setReplyNote("");
    setMessage(replied ? "Marked replied." : "Cleared replied status.");
    router.refresh();
  }

  return (
    <section style={{ display: "grid", gap: 12, padding: 14, borderRadius: 12, border: "1px solid #dbe4ec" }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h3 style={{ margin: 0 }}>Actions</h3>
        <p className="muted" style={{ margin: 0 }}>
          Manage previews for {previewLabel}.
        </p>
        {isSuppressed ? (
          <p className="muted" style={{ margin: 0 }}>
            This tournament is already suppressed from future outreach batches.
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Send test to</span>
          <input
            type="email"
            value={testEmail}
            onChange={(event) => setTestEmail(event.target.value)}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-primary"
          disabled={pending || !testEmail.trim()}
          onClick={() => startTransition(() => void handleSendTest())}
          style={{ opacity: pending || !testEmail.trim() ? 0.7 : 1 }}
        >
          Send test email
        </button>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-primary"
          disabled={pending || !hasDirectorEmail || isSuppressed}
          onClick={() => startTransition(() => void handleSendDirector())}
          style={{ opacity: pending || !hasDirectorEmail || isSuppressed ? 0.7 : 1 }}
        >
          Send to director
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Director email</span>
          <input
            type="email"
            value={editedDirectorEmail}
            onChange={(event) => setEditedDirectorEmail(event.target.value)}
            placeholder="director@example.com"
            style={inputStyle}
          />
        </label>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-secondary"
          disabled={pending || !tournamentId || !hasEditedDirectorEmail}
          onClick={() => startTransition(() => void handleUpdateDirectorEmail())}
          style={{ opacity: pending || !tournamentId || !hasEditedDirectorEmail ? 0.7 : 1 }}
        >
          Save email
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6, minWidth: 320 }}>
          <span style={{ fontWeight: 600 }}>Reply note (optional)</span>
          <input
            type="text"
            value={replyNote}
            onChange={(event) => setReplyNote(event.target.value)}
            placeholder="e.g. Confirmed details / wrong email / will update later"
            style={{ ...inputStyle, minWidth: 320 }}
          />
        </label>
        <button
          type="button"
          className="cta ti-home-cta ti-home-cta-secondary"
          disabled={pending}
          onClick={() => startTransition(() => void handleMarkReplied(true))}
          style={{ opacity: pending ? 0.7 : 1 }}
        >
          Mark replied{directorRepliedAt ? "" : ""}
        </button>
        {directorRepliedAt ? (
          <button
            type="button"
            className="cta ti-home-cta ti-home-cta-secondary"
            disabled={pending}
            onClick={() => startTransition(() => void handleMarkReplied(false))}
            style={{ opacity: pending ? 0.7 : 1 }}
          >
            Clear replied
          </button>
        ) : null}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button
          type="button"
          onClick={() => startTransition(() => void handleSuppressTournament())}
          disabled={pending || !tournamentId || isSuppressed}
          style={{ ...dangerButtonStyle, opacity: pending || !tournamentId || isSuppressed ? 0.7 : 1 }}
        >
          Suppress tournament
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => void handleDeleteSelected())}
          disabled={pending}
          style={dangerButtonStyle}
        >
          Delete this preview
        </button>
        <button
          type="button"
          onClick={() => startTransition(() => void handleDeleteCampaign())}
          disabled={pending || !campaignId}
          style={{ ...dangerButtonStyle, opacity: pending || !campaignId ? 0.7 : 1 }}
        >
          Delete campaign previews
        </button>
      </div>

      {message ? (
        <p className="muted" style={{ margin: 0 }}>
          {message}
        </p>
      ) : null}
    </section>
  );
}

const inputStyle = {
  minWidth: 260,
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  padding: "10px 12px",
  font: "inherit",
} satisfies CSSProperties;

function isValidEmail(value: string | null | undefined) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

const dangerButtonStyle = {
  borderRadius: 10,
  border: "1px solid #dc2626",
  background: "#ffffff",
  color: "#b91c1c",
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
} satisfies CSSProperties;
