import SportsPickerClient from "@/components/SportsPickerClient";

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
} from "@/lib/admin";

type Tab = "users" | "verification" | "badges";
type VStatus = "pending" | "approved" | "rejected";

function safeSportsArray(value: any): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return [];
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { tab?: Tab; q?: string; vstatus?: VStatus };
}) {
  await requireAdmin();

  const tab: Tab = (searchParams.tab as Tab) ?? "verification";
  const q = searchParams.q ?? "";
  const vstatus: VStatus = (searchParams.vstatus as VStatus) ?? "pending";

  const badges = await adminListBadges();

  const users =
    tab === "users" || tab === "badges" ? (q ? await adminSearchUsers(q) : []) : [];

  const requests =
    tab === "verification" ? await adminListVerificationRequests(vstatus) : [];

  async function updateUser(formData: FormData) {
    "use server";

    const user_id = String(formData.get("user_id") || "");
    const role = String(formData.get("role") || "");
    const years = String(formData.get("years_refereeing") || "").trim();
    const sportsCsv = String(formData.get("sports") || "").trim();

    await adminUpdateUserProfile({
      user_id,
      role: role || null,
      years_refereeing: years ? Number(years) : null,
      sports: sportsCsv
        ? sportsCsv.split(",").map((s) => s.trim()).filter(Boolean)
        : null,
    });
  }

  async function setDisabled(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const disabled = String(formData.get("disabled") || "") === "true";
    await adminSetUserDisabled(user_id, disabled);
  }

  async function awardBadgeAction(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const badge_id = Number(formData.get("badge_id"));
    if (!user_id || !badge_id) return;
    await adminAwardBadge({ user_id, badge_id });
  }

  async function revokeBadgeAction(formData: FormData) {
    "use server";
    const user_id = String(formData.get("user_id") || "");
    const badge_id = Number(formData.get("badge_id"));
    if (!user_id || !badge_id) return;
    await adminRevokeBadge({ user_id, badge_id });
  }

  async function approveVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const admin_notes = String(formData.get("admin_notes") || "").trim();

    await adminSetVerificationStatus({
      request_id,
      status: "approved",
      admin_notes: admin_notes || null,
    });
  }

  async function rejectVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));
    const admin_notes = String(formData.get("admin_notes") || "").trim();

    await adminSetVerificationStatus({
      request_id,
      status: "rejected",
      admin_notes: admin_notes || null,
    });
  }

  async function quickApproveVerificationAction(formData: FormData) {
    "use server";
    const request_id = Number(formData.get("request_id"));

    await adminSetVerificationStatus({
      request_id,
      status: "approved",
      admin_notes: null,
    });
  }

  const tabLink = (t: Tab) =>
    `/admin?tab=${t}${
      t !== "verification" ? "" : `&vstatus=${vstatus}`
    }${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const vLink = (s: VStatus) => `/admin?tab=verification&vstatus=${s}`;

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

      {/* Tabs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <TabButton t="verification" label="Verification" />
        <TabButton t="users" label="Users" />
        <TabButton t="badges" label="Badges" />
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
