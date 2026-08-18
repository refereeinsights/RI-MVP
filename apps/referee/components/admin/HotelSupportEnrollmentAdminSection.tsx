"use client";

import { useState } from "react";
import { useFormState } from "react-dom";

import type {
  AdminHotelSupportEnrollmentView,
  HotelSupportAdminActionState,
} from "@/lib/hotelSupportEnrollmentAdmin";

type EnrollmentAction = (
  previousState: HotelSupportAdminActionState,
  formData: FormData
) => Promise<HotelSupportAdminActionState>;

const INITIAL_STATE: HotelSupportAdminActionState = { status: "idle", message: "" };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function recipientTypeLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function HotelSupportEnrollmentAdminSection({
  tournamentId,
  view,
  createAction,
  revokeAction,
  reviewAction,
}: {
  tournamentId: string;
  view: AdminHotelSupportEnrollmentView;
  createAction: EnrollmentAction;
  revokeAction: EnrollmentAction;
  reviewAction: EnrollmentAction;
}) {
  const [offeredRateCents, setOfferedRateCents] = useState<500 | 1000>(500);
  const [createState, createDispatch] = useFormState(createAction, INITIAL_STATE);
  const [revokeState, revokeDispatch] = useFormState(revokeAction, INITIAL_STATE);
  const [reviewState, reviewDispatch] = useFormState(reviewAction, INITIAL_STATE);
  const [copyStatus, setCopyStatus] = useState("");
  const enrollment = view.enrollment;
  const review = view.review;

  async function copyEnrollmentLink() {
    if (!createState.enrollmentUrl) return;
    try {
      await navigator.clipboard.writeText(createState.enrollmentUrl);
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Copy failed. Select and copy the link manually.");
    }
  }

  return (
    <section
      aria-labelledby={`hotel-support-enrollment-${tournamentId}`}
      style={{ border: "1px solid #99f6e4", borderRadius: 12, padding: 14, background: "#f0fdfa", display: "grid", gap: 12 }}
    >
      <div>
        <div id={`hotel-support-enrollment-${tournamentId}`} style={{ fontSize: 14, fontWeight: 900 }}>
          Hotel Support Enrollment
        </div>
        <div style={{ color: "#475569", fontSize: 12, marginTop: 3 }}>
          Director acceptance and founder review are separate from Hotel Program activation.
        </div>
      </div>

      {!view.schemaReady ? (
        <div role="status" style={{ padding: 10, borderRadius: 8, background: "#fff7ed", color: "#9a3412", fontSize: 12 }}>
          Enrollment schema is not available. Review and manually apply the unapplied Hotel Support migration before using this workflow.
        </div>
      ) : (
        <>
          <input type="hidden" name="hotel_support_tournament_id" value={tournamentId} />
          <div style={{ display: "flex", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
            <label style={{ fontSize: 12, fontWeight: 700 }}>
              Offered support rate
              <select
                name="hotel_support_rate_cents"
                value={offeredRateCents}
                onChange={(event) => setOfferedRateCents(Number(event.target.value) as 500 | 1000)}
                style={{ display: "block", marginTop: 4, minWidth: 210, padding: 8, borderRadius: 8, border: "1px solid #94a3b8" }}
              >
                <option value={500}>$5.00 per eligible room night</option>
                <option value={1000}>$10.00 per eligible room night</option>
              </select>
            </label>
            <button
              type="submit"
              formAction={createDispatch}
              style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#0f766e", color: "#fff", fontWeight: 800 }}
            >
              {view.invitationDisplayState === "active" ? "Replace invitation" : "Invite to Hotel Support"}
            </button>
          </div>

          {createState.message ? (
            <div role="status" style={{ fontSize: 12, color: createState.status === "created" ? "#065f46" : "#9a3412" }}>
              {createState.message}
            </div>
          ) : null}

          {createState.enrollmentUrl ? (
            <div style={{ display: "grid", gap: 7, padding: 10, borderRadius: 8, background: "#ecfdf5" }}>
              <strong style={{ fontSize: 12 }}>Copy this link now—it cannot be retrieved after you dismiss this result.</strong>
              <input aria-label="New director enrollment link" readOnly value={createState.enrollmentUrl} style={{ width: "100%", padding: 8 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button type="button" onClick={copyEnrollmentLink} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #0f766e", background: "#fff", color: "#0f766e", fontWeight: 800 }}>
                  Copy secure link
                </button>
                {copyStatus ? <span role="status" style={{ fontSize: 12 }}>{copyStatus}</span> : null}
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 5, paddingTop: 4, borderTop: "1px solid #99f6e4", fontSize: 12 }}>
            <div><strong>Invitation:</strong> {view.invitationDisplayState}</div>
            {view.invitation ? (
              <>
                <div><strong>Offered rate:</strong> ${(view.invitation.offered_rate_cents / 100).toFixed(2)} per eligible room night</div>
                <div><strong>Expires:</strong> {formatDateTime(view.invitation.expires_at)}</div>
                {view.invitationDisplayState === "active" ? (
                  <button
                    type="submit"
                    name="hotel_support_invitation_id"
                    value={view.invitation.id}
                    formAction={revokeDispatch}
                    style={{ justifySelf: "start", padding: "7px 10px", borderRadius: 8, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", fontWeight: 800 }}
                  >
                    Revoke invitation
                  </button>
                ) : null}
              </>
            ) : null}
            {revokeState.message ? <div role="status">{revokeState.message}</div> : null}
          </div>

          {enrollment && review ? (
            <div style={{ display: "grid", gap: 7, padding: 10, borderRadius: 8, background: "#fff" }}>
              <div><strong>Enrollment:</strong> {review.status}</div>
              <div><strong>Accepted:</strong> {formatDateTime(enrollment.accepted_at)}</div>
              <div><strong>Contact:</strong> {enrollment.contact_name} · {enrollment.contact_email}</div>
              {enrollment.contact_phone ? <div><strong>Phone:</strong> {enrollment.contact_phone}</div> : null}
              {enrollment.contact_title ? <div><strong>Role/title:</strong> {enrollment.contact_title}</div> : null}
              <div><strong>Expected recipient:</strong> {recipientTypeLabel(enrollment.expected_recipient_type)} · {enrollment.expected_recipient_name}</div>
              <div><strong>Accepted terms:</strong> {enrollment.terms_version} · {enrollment.terms_content_sha256.slice(0, 12)}…</div>

              {review.status === "submitted" ? (
                <>
                  <label style={{ fontSize: 12, fontWeight: 700 }}>
                    Internal review note (optional)
                    <textarea name="hotel_support_review_note" maxLength={1000} rows={3} style={{ display: "block", width: "100%", marginTop: 4, padding: 8 }} />
                  </label>
                  <input type="hidden" name="hotel_support_enrollment_id" value={enrollment.id} />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="submit" name="hotel_support_decision" value="approved" formAction={reviewDispatch} style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: "#166534", color: "#fff", fontWeight: 800 }}>
                      Approve enrollment
                    </button>
                    <button type="submit" name="hotel_support_decision" value="declined" formAction={reviewDispatch} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid #b91c1c", background: "#fff", color: "#b91c1c", fontWeight: 800 }}>
                      Decline enrollment
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ color: "#475569" }}>
                  Reviewed {review.reviewed_at ? formatDateTime(review.reviewed_at) : ""}. Approval did not activate fee routing.
                  {review.review_note ? <span style={{ display: "block" }}>Note: {review.review_note}</span> : null}
                </div>
              )}
              {reviewState.message ? <div role="status" style={{ fontSize: 12 }}>{reviewState.message}</div> : null}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#475569" }}>No director enrollment has been submitted.</div>
          )}
        </>
      )}
    </section>
  );
}
