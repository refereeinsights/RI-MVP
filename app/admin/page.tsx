import SportsPickerClient from "@/components/SportsPickerClient";
import { redirect } from "next/navigation";

import {
  requireAdmin,
  adminSearchUsers,
  adminUpdateUserProfile,
  adminSetUserDisabled,
  adminListBadges,
  adminGetUserBadges,
  adminAwardBadge,
  adminRevokeBadge,
  adminListVerificationRequests,
  adminSetVerificationStatus,
  adminResendConfirmationEmail,
  adminListTournamentReviews,
  adminUpdateTournamentReview,
  adminDeleteTournamentReview,
  type ReviewStatus,
} from "@/lib/admin";

type Tab = "users" | "verification" | "badges" | "reviews";
type VStatus = "pending" | "approved" | "rejected";

function safeSportsArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [];
}

function redirectWithNotice(target: FormDataEntryValue | null, notice: string) {
  const base =
    typeof target === "string" && target.length > 0 ? target : "/admin";
  const joiner = base.includes("?") ? "&" : "?";
  redirect(`${base}${joiner}notice=${encodeURIComponent(notice)}`);
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: {
    tab?: Tab;
    q?: string;
    vstatus?: VStatus;
    rstatus?: ReviewStatus;
    notice?: string;
  };
}) {
  await requireAdmin();

  const tab: Tab = (searchParams.tab as Tab) ?? "verification";
  const q = searchParams.q ?? "";
  const vstatus: VStatus = (searchParams.vstatus as VStatus) ?? "pending";
  const reviewStatus: ReviewStatus = (searchParams.rstatus as ReviewStatus) ?? "pending";
  const notice = searchParams.notice ?? "";

  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "verification") {
    params.set("vstatus", vstatus);
  }
  if (tab === "reviews") {
    params.set("rstatus", reviewStatus);
  }
  if (q) {
    params.set("q", q);
  }
  const adminBasePath = params.toString() ? `/admin?${params.toString()}` : "/admin";

  const badges = await adminListBadges();

  const users =
    tab === "users" || tab === "badges" ? (q ? await adminSearchUsers(q) : []) : [];

  const requests =
    tab === "verification" ? await adminListVerificationRequests(vstatus) : [];

  const reviewSubmissions =
    tab === "reviews" ? await adminListTournamentReviews(reviewStatus) : [];

  async function updateUser(formData: FormData) {
    "use server";

    const user_id = String(formData.get("user_id") || "");
    const role = String(formData.get("role") || "");
    const years = String(formData.get("years_refereeing") || "").trim();
    const sportsCsv = String(formData.get("sports") || "").trim();
    const redirectTo = formData.get("redirect_to");

    await adminUpdateUserProfile({
      user_id,
      role: role || null,
      years_refereeing: years ? Number(years) : null,
      sports: sportsCsv
        ? sportsCsv.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    });

    redirectWithNotice(redirectTo, "Profile updated");
  }

  async function setDisabled(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const disabled = String(formData.get("disabled") || "") === "true";
    const redirectTo = formData.get("redirect_to");
    await adminSetUserDisabled(user_id, disabled);
    redirectWithNotice(redirectTo, disabled ? "User disabled" : "User enabled");
  }

  async function awardBadgeAction(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const badge_id = Number(formData.get("badge_id"));
    const redirectTo = formData.get("redirect_to");
    if (!user_id || !badge_id) return;
    await adminAwardBadge({ user_id, badge_id });
    redirectWithNotice(redirectTo, "Badge awarded");
  }

  async function resendConfirmationAction(formData: FormData) {
    "use server";
    const email = String(formData.get("email") || "").trim();
    const redirectTo = formData.get("redirect_to");
    if (!email) return;
    await adminResendConfirmationEmail({ email });
    redirectWithNotice(redirectTo, "Confirmation email sent");
  }

  async function revokeBadgeAction(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const badge_id = Number(formData.get("badge_id"));
    const redirectTo = formData.get("redirect_to");
    if (!user_id || !badge_id) return;
    await adminRevokeBadge({ user_id, badge_id });
    redirectWithNotice(redirectTo, "Badge revoked");
  }

  async function approveVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const admin_notes = String(formData.get("admin_notes") || "").trim();
    const redirectTo = formData.get("redirect_to");

    await adminSetVerificationStatus({
      request_id,
      status: "approved",
      admin_notes: admin_notes || null,
    });
    redirectWithNotice(redirectTo, "Verification approved");
  }

  async function rejectVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const admin_notes = String(formData.get("admin_notes") || "").trim();
    const redirectTo = formData.get("redirect_to");

    await adminSetVerificationStatus({
      request_id,
      status: "rejected",
      admin_notes: admin_notes || null,
    });
    redirectWithNotice(redirectTo, "Verification rejected");
  }

  async function quickApproveVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const redirectTo = formData.get("redirect_to");

    await adminSetVerificationStatus({
      request_id,
      status: "approved",
      admin_notes: null,
    });
    redirectWithNotice(redirectTo, "Verification approved");
  }

  async function updateReviewAction(formData: FormData) {
    "use server";
    const review_id = String(formData.get("review_id") || "");
    if (!review_id) return;

    const redirectTo = formData.get("redirect_to");
    const statusInput = String(formData.get("status") || "pending");
    const normalizedStatus: ReviewStatus =
      statusInput === "approved" || statusInput === "rejected" ? statusInput : "pending";

    const numberFields = [
      "overall_score",
      "logistics_score",
      "facilities_score",
      "pay_score",
      "support_score",
    ] as const;

    const updates: Record<string, any> = {
      status: normalizedStatus,
    };

    for (const field of numberFields) {
      const raw = formData.get(field);
      const value = raw !== null ? Number(raw) : null;
      if (typeof value === "number" && Number.isFinite(value)) {
        updates[field] = value;
      }
    }

    const workedGamesRaw = formData.get("worked_games");
    if (workedGamesRaw !== null && workedGamesRaw !== "") {
      const value = Number(workedGamesRaw);
      updates.worked_games = Number.isFinite(value) ? value : null;
    } else {
      updates.worked_games = null;
    }

    const shiftDetail = String(formData.get("shift_detail") || "").trim();
    updates.shift_detail = shiftDetail || null;

    await adminUpdateTournamentReview({ review_id, updates });
    redirectWithNotice(redirectTo, "Review updated");
  }

  async function deleteReviewAction(formData: FormData) {
    "use server";
    const review_id = String(formData.get("review_id") || "");
    if (!review_id) return;
    const redirectTo = formData.get("redirect_to");
    await adminDeleteTournamentReview(review_id);
    redirectWithNotice(redirectTo, "Review deleted");
  }

  const tabLink = (t: Tab) => {
    const sp = new URLSearchParams();
    sp.set("tab", t);
    if (t === "verification") {
      sp.set("vstatus", vstatus);
    }
    if (t === "reviews") {
      sp.set("rstatus", reviewStatus);
    }
    if (q) {
      sp.set("q", q);
    }
    return `/admin?${sp.toString()}`;
  };

  const vLink = (s: VStatus) => `/admin?tab=verification&vstatus=${s}`;
  const reviewLink = (s: ReviewStatus) => `/admin?tab=reviews&rstatus=${s}`;

  const TabButton = ({ t, label }: { t: Tab; label: string }) => (
    <a
      href={tabLink(t)}
      style={{
        padding: "10px 12px",
        borderRadius: 999,
        border: "1px solid #111",
        background: tab === t ? "#111" : "#fff",
        color: tab === t ? "#fff" : "#111",
        fontWeight: 900,
        textDecoration: "none",
      }}
    >
      {label}
    </a>
  );

  const StatusPill = ({ s, label }: { s: VStatus; label: string }) => (
    <a
      href={vLink(s)}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: "1px solid #111",
        background: vstatus === s ? "#111" : "#fff",
        color: vstatus === s ? "#fff" : "#111",
        fontWeight: 900,
        textDecoration: "none",
        fontSize: 13,
      }}
    >
      {label}
    </a>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
        Admin Dashboard
      </h1>

      {notice && (
        <div
          style={{
            background: "#e0f2f1",
            border: "1px solid #26a69a",
            color: "#004d40",
            padding: "10px 14px",
            borderRadius: 10,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span>{notice}</span>
          <a
            href={adminBasePath}
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#004d40",
            }}
          >
            Dismiss
          </a>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <TabButton t="verification" label="Verification" />
        <TabButton t="users" label="Users" />
        <TabButton t="badges" label="Badges" />
        <TabButton t="reviews" label="Tournament reviews" />
      </div>

      {/* VERIFICATION TAB */}
      {tab === "verification" && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              Verification requests
            </h2>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill s="pending" label="Pending" />
              <StatusPill s="approved" label="Approved" />
              <StatusPill s="rejected" label="Rejected" />
            </div>
          </div>

          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            Showing: <strong>{vstatus}</strong> ({requests.length})
          </div>

          <div style={{ marginTop: 12 }}>
            {requests.length === 0 ? (
              <div style={{ color: "#555" }}>No requests.</div>
            ) : (
              requests.map((r: any) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 10,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 320 }}>
                      <div style={{ fontWeight: 900 }}>
                        {r.user_profile?.handle ?? "—"} ({r.user_profile?.email ?? "—"})
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Real name: {r.user_profile?.real_name ?? "—"}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Submitted: {new Date(r.submitted_at).toLocaleString()}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Association: {r.association ?? "—"} | Level: {r.level ?? "—"}
                      </div>

                      {r.evidence_url ? (
                        <div style={{ marginTop: 6 }}>
                          <a
                            href={r.evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 13 }}
                          >
                            View evidence ↗
                          </a>
                        </div>
                      ) : (
                        <div style={{ marginTop: 6, fontSize: 13, color: "#777" }}>
                          No evidence URL
                        </div>
                      )}

                      {r.notes ? (
                        <div style={{ marginTop: 8, fontSize: 13, color: "#444" }}>
                          <strong>User notes:</strong> {r.notes}
                        </div>
                      ) : null}

                      {r.reviewed_at ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
                          Reviewed: {new Date(r.reviewed_at).toLocaleString()} by{" "}
                          {r.reviewer_profile?.handle ?? "admin"}
                        </div>
                      ) : null}

                      {r.admin_notes ? (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>
                          <strong>Admin notes:</strong> {r.admin_notes}
                        </div>
                      ) : null}
                    </div>

                    {vstatus === "pending" ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <form action={quickApproveVerificationAction}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={adminBasePath} />
                          <button
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "none",
                              background: "#111",
                              color: "#fff",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                            title="Approve immediately (no notes)"
                          >
                            Quick approve
                          </button>
                        </form>

                        <form action={approveVerificationAction} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={adminBasePath} />
                          <input
                            name="admin_notes"
                            placeholder="Admin notes (optional)"
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                              width: 260,
                            }}
                          />
                          <button
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "none",
                              background: "#0a7a2f",
                              color: "#fff",
                              fontWeight: 900,
                            }}
                          >
                            Approve
                          </button>
                        </form>

                        <form action={rejectVerificationAction} style={{ display: "grid", gap: 8 }}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <input type="hidden" name="redirect_to" value={adminBasePath} />
                          <input
                            name="admin_notes"
                            placeholder="Reason / admin notes"
                            style={{
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                              width: 260,
                            }}
                          />
                          <button
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #b00020",
                              background: "#fff",
                              color: "#b00020",
                              fontWeight: 900,
                            }}
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    ) : (
                      <div style={{ color: "#555", fontSize: 13 }}>
                        No actions for non-pending.
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 10, color: "#555", fontSize: 12 }}>
                    Approving awards <strong>Verified Referee</strong> via your DB trigger.
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* USERS TAB */}
      {tab === "users" && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
            User search
          </h2>

          <form action="/admin" method="get" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="hidden" name="tab" value="users" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by email, handle, or real name…"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #bbb" }}
            />
            <button
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
              }}
            >
              Search
            </button>
          </form>

          {q && users.length === 0 && <div style={{ color: "#555" }}>No results.</div>}

          {users.map((u) => {
            const selectedSports = safeSportsArray(u.sports);

            return (
              <div
                key={u.user_id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                  background: "#fff",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 320 }}>
                    <div style={{ fontWeight: 900 }}>
                      {u.handle} ({u.role ?? "user"})
                    </div>
                    <div style={{ color: "#555", fontSize: 13 }}>{u.email}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>Real name: {u.real_name ?? "—"}</div>
                    <div style={{ color: "#555", fontSize: 13 }}>
                      Years: {u.years_refereeing ?? "—"} | Sports: {selectedSports.join(", ") || "—"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                    <form action={updateUser}>
                      <input type="hidden" name="user_id" value={u.user_id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />

                      <div style={{ display: "grid", gap: 10, minWidth: 360 }}>
                        <input
                          name="role"
                          defaultValue={u.role ?? ""}
                          placeholder="role (admin/user)"
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
                        />

                        <input
                          name="years_refereeing"
                          defaultValue={u.years_refereeing ?? ""}
                          placeholder="years as referee"
                          style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
                        />

                        {/* Sports picker (multi-select with icons). Submits hidden CSV named "sports". */}
                        <SportsPickerClient name="sports" defaultSelected={selectedSports} />

                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: "#111",
                            color: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Save
                        </button>
                      </div>
                    </form>

                    <div style={{ display: "grid", gap: 8 }}>
                      <form action={setDisabled}>
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input type="hidden" name="disabled" value="true" />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #111",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Disable
                        </button>
                      </form>

                      <form action={setDisabled}>
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input type="hidden" name="disabled" value="false" />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "none",
                            background: "#0a7a2f",
                            color: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Enable
                        </button>
                      </form>

                      <form action={resendConfirmationAction}>
                        <input type="hidden" name="email" value={u.email} />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          style={{
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #555",
                            background: "#fff",
                            fontWeight: 900,
                          }}
                        >
                          Resend confirmation
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* BADGES TAB */}
      {tab === "badges" && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>
            Manage badges
          </h2>

          <form action="/admin" method="get" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input type="hidden" name="tab" value="badges" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search user to manage badges…"
              style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid #bbb" }}
            />
            <button
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#111",
                color: "#fff",
                fontWeight: 900,
              }}
            >
              Search
            </button>
          </form>

          {q && users.length === 0 && <div style={{ color: "#555" }}>No results.</div>}

          {users.map(async (u) => {
            const userBadges = await adminGetUserBadges(u.user_id);

            return (
              <div
                key={u.user_id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                  background: "#fff",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  {u.handle}{" "}
                  <span style={{ color: "#555", fontWeight: 700 }}>({u.email})</span>
                </div>

                <div style={{ fontSize: 13, color: "#555", marginBottom: 10 }}>
                  Current badges: {(userBadges ?? []).length}
                </div>

                {userBadges.length === 0 ? (
                  <div style={{ color: "#777", fontSize: 13 }}>No badges.</div>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {userBadges.map((b: any) => (
                      <form key={b.badge_id} action={revokeBadgeAction}>
                        <input type="hidden" name="user_id" value={u.user_id} />
                        <input type="hidden" name="badge_id" value={b.badge_id} />
                        <input type="hidden" name="redirect_to" value={adminBasePath} />
                        <button
                          title="Click to revoke"
                          style={{
                            border: "1px solid #111",
                            background: "#fff",
                            borderRadius: 999,
                            padding: "6px 10px",
                            fontWeight: 900,
                            cursor: "pointer",
                          }}
                        >
                          {b.badges?.label ?? b.badge_id} ✕
                        </button>
                      </form>
                    ))}
                  </div>
                )}

                <form action={awardBadgeAction} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="user_id" value={u.user_id} />
                  <input type="hidden" name="redirect_to" value={adminBasePath} />
                  <select
                    name="badge_id"
                    style={{ padding: 8, borderRadius: 10, border: "1px solid #bbb" }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Award a badge…
                    </option>
                    {badges.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label} ({b.code})
                      </option>
                    ))}
                  </select>

                  <button
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "none",
                      background: "#111",
                      color: "#fff",
                      fontWeight: 900,
                    }}
                  >
                    Award
                  </button>
                </form>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
      {/* REVIEWS TAB */}
      {tab === "reviews" && (
        <section style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>
              Tournament referee reviews
            </h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={reviewLink("pending")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "pending" ? "#111" : "#fff",
                  color: reviewStatus === "pending" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Pending
              </a>
              <a
                href={reviewLink("approved")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "approved" ? "#111" : "#fff",
                  color: reviewStatus === "approved" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Approved
              </a>
              <a
                href={reviewLink("rejected")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: "1px solid #111",
                  background: reviewStatus === "rejected" ? "#111" : "#fff",
                  color: reviewStatus === "rejected" ? "#fff" : "#111",
                  fontWeight: 900,
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Rejected
              </a>
            </div>
          </div>

          <div style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
            Showing: <strong>{reviewStatus}</strong> ({reviewSubmissions.length})
          </div>

          <div style={{ marginTop: 12 }}>
            {reviewSubmissions.length === 0 ? (
              <div style={{ color: "#555" }}>No reviews.</div>
            ) : (
              reviewSubmissions.map((review) => (
                <div
                  key={review.id}
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ minWidth: 280 }}>
                      <div style={{ fontWeight: 900 }}>
                        {review.tournament?.name ?? "Unknown tournament"}
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        {review.tournament?.city ? `${review.tournament.city}, ` : ""}
                        {review.tournament?.state ?? ""}
                      </div>
                      <div style={{ marginTop: 6, color: "#555", fontSize: 13 }}>
                        Reviewer: @{review.reviewer?.handle ?? "unknown"} (
                        {review.reviewer?.email ?? "no email"})
                      </div>
                      <div style={{ color: "#555", fontSize: 13 }}>
                        Submitted: {new Date(review.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div style={{ minWidth: 180, fontSize: 13, color: "#333" }}>
                      <strong>Scores</strong>
                      <div>Overall: {review.overall_score}</div>
                      <div>Logistics: {review.logistics_score}</div>
                      <div>Facilities: {review.facilities_score}</div>
                      <div>Pay: {review.pay_score}</div>
                      <div>Support: {review.support_score}</div>
                      <div>Worked games: {review.worked_games ?? "—"}</div>
                    </div>
                  </div>

                  {review.shift_detail ? (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 10,
                        background: "#f9f9f9",
                        fontSize: 13,
                        color: "#444",
                      }}
                    >
                      {review.shift_detail}
                    </div>
                  ) : null}

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <form action={updateReviewAction} style={{ flex: 1, minWidth: 280 }}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Overall
                          <input
                            type="number"
                            name="overall_score"
                            defaultValue={review.overall_score}
                            min={0}
                            max={100}
                            step={5}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Logistics
                          <input
                            type="number"
                            name="logistics_score"
                            defaultValue={review.logistics_score}
                            min={0}
                            max={100}
                            step={5}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Facilities
                          <input
                            type="number"
                            name="facilities_score"
                            defaultValue={review.facilities_score}
                            min={0}
                            max={100}
                            step={5}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Pay accuracy
                          <input
                            type="number"
                            name="pay_score"
                            defaultValue={review.pay_score}
                            min={0}
                            max={100}
                            step={5}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Organizer support
                          <input
                            type="number"
                            name="support_score"
                            defaultValue={review.support_score}
                            min={0}
                            max={100}
                            step={5}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                        <label style={{ fontSize: 12, fontWeight: 700 }}>
                          Games worked
                          <input
                            type="number"
                            name="worked_games"
                            defaultValue={review.worked_games ?? ""}
                            min={0}
                            max={30}
                            style={{
                              width: "100%",
                              padding: 8,
                              borderRadius: 10,
                              border: "1px solid #bbb",
                            }}
                          />
                        </label>
                      </div>

                      <label style={{ display: "block", marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                        Shift detail
                        <textarea
                          name="shift_detail"
                          defaultValue={review.shift_detail ?? ""}
                          rows={3}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 10,
                            border: "1px solid #bbb",
                            marginTop: 4,
                          }}
                        />
                      </label>

                      <label style={{ display: "block", marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                        Status
                        <select
                          name="status"
                          defaultValue={review.status}
                          style={{
                            width: "100%",
                            padding: 8,
                            borderRadius: 10,
                            border: "1px solid #bbb",
                            marginTop: 4,
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="rejected">Rejected</option>
                        </select>
                      </label>

                      <button
                        style={{
                          marginTop: 12,
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "none",
                          background: "#111",
                          color: "#fff",
                          fontWeight: 900,
                        }}
                      >
                        Save changes
                      </button>
                    </form>

                    <form action={deleteReviewAction} style={{ alignSelf: "flex-start" }}>
                      <input type="hidden" name="review_id" value={review.id} />
                      <input type="hidden" name="redirect_to" value={adminBasePath} />
                      <button
                        style={{
                          padding: "10px 12px",
                          borderRadius: 10,
                          border: "1px solid #b00020",
                          background: "#fff",
                          color: "#b00020",
                          fontWeight: 900,
                        }}
                        type="submit"
                      >
                        Delete review
                      </button>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}
