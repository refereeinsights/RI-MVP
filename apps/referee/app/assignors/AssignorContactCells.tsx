"use client";

import { useState } from "react";

type ContactResponse = {
  email: string | null;
  phone: string | null;
};

type AssignorContactCellsProps = {
  assignorId: string;
  maskedEmail?: string | null;
  maskedPhone?: string | null;
  canReveal: boolean;
  needsTerms: boolean;
  showSignIn: boolean;
  revealedEmail?: string | null;
  revealedPhone?: string | null;
  onReveal?: (assignorId: string) => Promise<void>;
};

export default function AssignorContactCells({
  assignorId,
  maskedEmail,
  maskedPhone,
  canReveal,
  needsTerms,
  showSignIn,
  revealedEmail,
  revealedPhone,
  onReveal,
}: AssignorContactCellsProps) {
  const [revealed, setRevealed] = useState<ContactResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReveal = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onReveal) {
        await onReveal(assignorId);
      } else {
        const resp = await fetch("/api/assignors/reveal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assignor_id: assignorId }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          throw new Error(text || "Unable to reveal contact details.");
        }

        const data = (await resp.json()) as ContactResponse;
        setRevealed({
          email: data?.email ?? null,
          phone: data?.phone ?? null,
        });
      }
    } catch (err: any) {
      setError(err?.message ?? "Unable to reveal contact details.");
    } finally {
      setLoading(false);
    }
  };

  const emailDisplay = revealedEmail ?? revealed?.email ?? maskedEmail ?? "—";
  const phoneDisplay = revealedPhone ?? revealed?.phone ?? maskedPhone ?? "—";
  const emailLink = revealedEmail || revealed?.email ? `mailto:${revealedEmail ?? revealed?.email}` : null;
  const phoneLink = revealedPhone || revealed?.phone ? `tel:${revealedPhone ?? revealed?.phone}` : null;
  const hasRevealed = !!(revealedEmail || revealed?.email || revealedPhone || revealed?.phone);

  return (
    <>
      <td style={{ padding: "6px 4px" }}>
        {emailLink ? (
          <a href={emailLink} style={{ color: "#0f172a", fontWeight: 600 }}>
            {emailDisplay}
          </a>
        ) : (
          <span>{emailDisplay}</span>
        )}
        {canReveal && !hasRevealed ? (
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={handleReveal}
              disabled={loading}
              className="btn btnSecondary"
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                fontSize: 12,
                border: "1px solid #0f172a",
                background: "#fff",
                color: "#0f172a",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? "Revealing..." : "Reveal"}
            </button>
          </div>
        ) : null}
        {needsTerms ? (
          <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
            Accept contact terms to reveal.
          </div>
        ) : null}
        {showSignIn ? (
          <div style={{ marginTop: 6, fontSize: 11, color: "#555" }}>
            Sign in to view contact details.
          </div>
        ) : null}
        {error ? (
          <div style={{ marginTop: 6, fontSize: 11, color: "#b91c1c" }}>{error}</div>
        ) : null}
      </td>
      <td style={{ padding: "6px 4px" }}>
        {phoneLink ? (
          <a href={phoneLink} style={{ color: "#0f172a", fontWeight: 600 }}>
            {phoneDisplay}
          </a>
        ) : (
          <span>{phoneDisplay}</span>
        )}
      </td>
    </>
  );
}
