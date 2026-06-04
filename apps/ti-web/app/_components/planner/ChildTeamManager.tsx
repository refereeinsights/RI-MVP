"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PlannerChildRow,
  PlannerChildWithTeamsRow,
  PlannerTeamCreateBody,
  PlannerTeamRow,
} from "@/lib/planner/types";
import styles from "./Planner.module.css";

type ChildListResponse = { ok: true; children: PlannerChildWithTeamsRow[] };
type ChildCreateResponse = { ok: true; child: PlannerChildRow };
type TeamCreateResponse = { ok: true; team: PlannerTeamRow };

async function jsonFetch<T>(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
  const json = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    const msg = (json as any)?.error || (json as any)?.message || `Request failed (${res.status})`;
    throw new Error(String(msg));
  }
  return json as T;
}

function titleCaseSport(value: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Sport";
  return raw
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type Props = {
  onProfilesChanged?: () => void;
};

export default function ChildTeamManager(props: Props) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [children, setChildren] = useState<PlannerChildWithTeamsRow[]>([]);

  const [newChildName, setNewChildName] = useState("");
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editingChildName, setEditingChildName] = useState("");

  const [newTeamChildId, setNewTeamChildId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamSport, setNewTeamSport] = useState("");
  const [newTeamSeason, setNewTeamSeason] = useState("");

  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");
  const [editingTeamSport, setEditingTeamSport] = useState("");
  const [editingTeamSeason, setEditingTeamSeason] = useState("");

  const loadProfiles = useCallback(async (includeArchived = showArchived) => {
    setLoading(true);
    try {
      const res = await jsonFetch<ChildListResponse>(`/api/planner/children?include_archived=${includeArchived ? "1" : "0"}`, {
        method: "GET",
      });
      setChildren(res.children);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load child/team profiles.");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    if (!open) return;
    void loadProfiles(showArchived);
  }, [loadProfiles, open, showArchived]);

  const activeChildren = useMemo(() => children.filter((child) => !child.is_archived), [children]);
  const archivedChildren = useMemo(() => children.filter((child) => child.is_archived), [children]);
  const activeChildCount = activeChildren.length;
  const activeTeamCount = useMemo(
    () => children.reduce((sum, child) => sum + child.teams.filter((team) => !team.is_archived).length, 0),
    [children]
  );

  async function onCreateChild() {
    if (saving) return;
    setError(null);
    setNotice(null);
    if (!newChildName.trim()) {
      setError("Child name is required.");
      return;
    }
    setSaving(true);
    try {
      await jsonFetch<ChildCreateResponse>("/api/planner/children", {
        method: "POST",
        body: JSON.stringify({ display_name: newChildName.trim() }),
      });
      setNewChildName("");
      setNotice("Child profile created.");
      await loadProfiles(showArchived);
      props.onProfilesChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to create child profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveChild(childId: string) {
    if (saving) return;
    setError(null);
    setNotice(null);
    if (!editingChildName.trim()) {
      setError("Child name is required.");
      return;
    }
    setSaving(true);
    try {
      await jsonFetch(`/api/planner/children/${encodeURIComponent(childId)}`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: editingChildName.trim() }),
      });
      setEditingChildId(null);
      setEditingChildName("");
      setNotice("Child profile updated.");
      await loadProfiles(showArchived);
      props.onProfilesChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to update child profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleChildArchive(child: PlannerChildWithTeamsRow, archived: boolean) {
    if (saving) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await jsonFetch(`/api/planner/children/${encodeURIComponent(child.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ is_archived: archived }),
      });
      setNotice(archived ? "Child archived. Teams under that child were archived too." : "Child restored.");
      await loadProfiles(true);
      setShowArchived(true);
      props.onProfilesChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to update child archive state.");
    } finally {
      setSaving(false);
    }
  }

  async function onCreateTeam(childId: string) {
    if (saving) return;
    setError(null);
    setNotice(null);
    const payload: PlannerTeamCreateBody = {
      child_id: childId,
      display_name: newTeamName.trim(),
      sport: newTeamSport.trim(),
      season_label: newTeamSeason.trim() || null,
    };
    if (!payload.display_name) {
      setError("Team name is required.");
      return;
    }
    if (!payload.sport) {
      setError("Sport is required.");
      return;
    }
    setSaving(true);
    try {
      await jsonFetch<TeamCreateResponse>("/api/planner/teams", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setNewTeamChildId(null);
      setNewTeamName("");
      setNewTeamSport("");
      setNewTeamSeason("");
      setNotice("Team profile created.");
      await loadProfiles(showArchived);
      props.onProfilesChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to create team profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveTeam(teamId: string) {
    if (saving) return;
    setError(null);
    setNotice(null);
    if (!editingTeamName.trim()) {
      setError("Team name is required.");
      return;
    }
    if (!editingTeamSport.trim()) {
      setError("Sport is required.");
      return;
    }
    setSaving(true);
    try {
      await jsonFetch(`/api/planner/teams/${encodeURIComponent(teamId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          display_name: editingTeamName.trim(),
          sport: editingTeamSport.trim(),
          season_label: editingTeamSeason.trim() || null,
        }),
      });
      setEditingTeamId(null);
      setEditingTeamName("");
      setEditingTeamSport("");
      setEditingTeamSeason("");
      setNotice("Team profile updated.");
      await loadProfiles(showArchived);
      props.onProfilesChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to update team profile.");
    } finally {
      setSaving(false);
    }
  }

  async function onToggleTeamArchive(team: PlannerTeamRow, archived: boolean) {
    if (saving) return;
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await jsonFetch(`/api/planner/teams/${encodeURIComponent(team.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ is_archived: archived }),
      });
      setNotice(archived ? "Team archived." : "Team restored.");
      await loadProfiles(true);
      setShowArchived(true);
      props.onProfilesChanged?.();
    } catch (err: any) {
      setError(err?.message || "Failed to update team archive state.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.muted} style={{ marginBottom: 10, textAlign: "center" }}>
        {activeChildCount} child profile{activeChildCount === 1 ? "" : "s"} · {activeTeamCount} active team{activeTeamCount === 1 ? "" : "s"}
      </div>
      <div className={`${styles.eventActions} ${styles.eventActionsCenter}`}>
        <button className={styles.secondaryBtn} type="button" onClick={() => setOpen((v) => !v)} disabled={saving}>
          {open ? "Hide profiles" : "Manage child/team profiles"}
        </button>
      </div>
      <div className={styles.muted} style={{ marginTop: 10, textAlign: "center" }}>
        Optional foundation only. Event and calendar assignment comes in the next stage.
      </div>

      {open ? (
        <div className={styles.profileManager}>
          {error ? <div className={styles.profileError}>{error}</div> : null}
          {notice ? <div className={styles.profileNotice}>{notice}</div> : null}

          <div className={styles.profileSection}>
            <div className={styles.profileSectionTitle}>Add child</div>
            <div className={styles.eventActions}>
              <input
                className={styles.input}
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                placeholder="Avery Davis"
                maxLength={80}
                disabled={saving}
              />
              <button className={styles.primaryBtn} type="button" onClick={() => void onCreateChild()} disabled={saving}>
                Save child
              </button>
            </div>
          </div>

          <label className={styles.profileToggle}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} disabled={saving || loading} />
            <span>Show archived profiles</span>
          </label>

          {loading ? <div className={styles.muted}>Loading profiles…</div> : null}

          {!loading && activeChildren.length === 0 ? (
            <div className={styles.muted}>No child profiles yet. Add one when you need it. Weekend Planner still works without profiles.</div>
          ) : null}

          {!loading ? (
            <div className={styles.profileList}>
              {activeChildren.map((child) => {
                const activeTeams = child.teams.filter((team) => !team.is_archived);
                const archivedTeams = child.teams.filter((team) => team.is_archived);

                return (
                  <div key={child.id} className={styles.profileCard}>
                    <div className={styles.profileHeader}>
                      <div>
                        <div className={styles.profileName}>{child.display_name}</div>
                        <div className={styles.eventMeta}>
                          {activeTeams.length} active team{activeTeams.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className={styles.eventActions}>
                        {editingChildId === child.id ? (
                          <>
                            <button className={styles.primaryBtn} type="button" onClick={() => void onSaveChild(child.id)} disabled={saving}>
                              Save
                            </button>
                            <button
                              className={styles.secondaryBtn}
                              type="button"
                              onClick={() => {
                                setEditingChildId(null);
                                setEditingChildName("");
                              }}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            className={styles.secondaryBtn}
                            type="button"
                            onClick={() => {
                              setEditingChildId(child.id);
                              setEditingChildName(child.display_name);
                            }}
                            disabled={saving}
                          >
                            Edit child
                          </button>
                        )}
                        <button className={styles.dangerBtn} type="button" onClick={() => void onToggleChildArchive(child, true)} disabled={saving}>
                          Archive child
                        </button>
                      </div>
                    </div>

                  {editingChildId === child.id ? (
                    <div className={styles.eventActions}>
                      <input
                        className={styles.input}
                        value={editingChildName}
                        onChange={(e) => setEditingChildName(e.target.value)}
                        placeholder="Child name"
                        maxLength={80}
                        disabled={saving}
                      />
                    </div>
                  ) : null}

                  <div className={styles.profileSection}>
                    <div className={styles.profileSectionTitle}>Teams</div>
                    <div className={styles.profileTeamList}>
                      {activeTeams.length ? (
                        activeTeams.map((team) => (
                            <div key={team.id} className={styles.profileTeamCard}>
                              {editingTeamId === team.id ? (
                                <>
                                  <div className={styles.eventActions}>
                                    <input
                                      className={styles.input}
                                      value={editingTeamName}
                                      onChange={(e) => setEditingTeamName(e.target.value)}
                                      placeholder="Spokane 12U Owls"
                                      maxLength={100}
                                      disabled={saving}
                                    />
                                    <input
                                      className={styles.input}
                                      value={editingTeamSport}
                                      onChange={(e) => setEditingTeamSport(e.target.value)}
                                      placeholder="soccer"
                                      maxLength={40}
                                      disabled={saving}
                                    />
                                    <input
                                      className={styles.input}
                                      value={editingTeamSeason}
                                      onChange={(e) => setEditingTeamSeason(e.target.value)}
                                      placeholder="Spring 2027"
                                      maxLength={40}
                                      disabled={saving}
                                    />
                                  </div>
                                  <div className={styles.eventActions}>
                                    <button className={styles.primaryBtn} type="button" onClick={() => void onSaveTeam(team.id)} disabled={saving}>
                                      Save team
                                    </button>
                                    <button
                                      className={styles.secondaryBtn}
                                      type="button"
                                      onClick={() => {
                                        setEditingTeamId(null);
                                        setEditingTeamName("");
                                        setEditingTeamSport("");
                                        setEditingTeamSeason("");
                                      }}
                                      disabled={saving}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <div className={styles.profileTeamRow}>
                                  <div>
                                    <div className={styles.profileTeamName}>{team.display_name}</div>
                                    <div className={styles.eventMeta}>
                                      {titleCaseSport(team.sport)}
                                      {team.season_label ? ` · ${team.season_label}` : ""}
                                    </div>
                                  </div>
                                  <div className={styles.eventActions}>
                                    <button
                                      className={styles.secondaryBtn}
                                      type="button"
                                      onClick={() => {
                                        setEditingTeamId(team.id);
                                        setEditingTeamName(team.display_name);
                                        setEditingTeamSport(team.sport);
                                        setEditingTeamSeason(team.season_label ?? "");
                                      }}
                                      disabled={saving}
                                    >
                                      Edit team
                                    </button>
                                    <button className={styles.dangerBtn} type="button" onClick={() => void onToggleTeamArchive(team, true)} disabled={saving}>
                                      Archive team
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))
                      ) : (
                        <div className={styles.muted}>No teams under this child yet.</div>
                      )}
                    </div>

                    {showArchived && archivedTeams.length ? (
                      <div className={styles.profileSection}>
                        <div className={styles.profileSectionTitle}>Archived teams</div>
                        <div className={styles.profileTeamList}>
                          {archivedTeams.map((team) => (
                            <div key={team.id} className={styles.profileTeamCard}>
                              <div className={styles.profileTeamRow}>
                                <div>
                                  <div className={styles.profileTeamName}>{team.display_name}</div>
                                  <div className={styles.eventMeta}>
                                    {titleCaseSport(team.sport)}
                                    {team.season_label ? ` · ${team.season_label}` : ""}
                                    {" · Archived"}
                                  </div>
                                </div>
                                <div className={styles.eventActions}>
                                  <button className={styles.secondaryBtn} type="button" onClick={() => void onToggleTeamArchive(team, false)} disabled={saving}>
                                    Restore team
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {newTeamChildId === child.id ? (
                      <div className={styles.profileInlineForm}>
                        <input
                          className={styles.input}
                          value={newTeamName}
                          onChange={(e) => setNewTeamName(e.target.value)}
                          placeholder="Spokane 12U Owls"
                          maxLength={100}
                          disabled={saving}
                        />
                        <input
                          className={styles.input}
                          value={newTeamSport}
                          onChange={(e) => setNewTeamSport(e.target.value)}
                          placeholder="soccer"
                          maxLength={40}
                          disabled={saving}
                        />
                        <input
                          className={styles.input}
                          value={newTeamSeason}
                          onChange={(e) => setNewTeamSeason(e.target.value)}
                          placeholder="Spring 2027"
                          maxLength={40}
                          disabled={saving}
                        />
                        <div className={styles.eventActions}>
                          <button className={styles.primaryBtn} type="button" onClick={() => void onCreateTeam(child.id)} disabled={saving}>
                            Save team
                          </button>
                          <button
                            className={styles.secondaryBtn}
                            type="button"
                            onClick={() => {
                              setNewTeamChildId(null);
                              setNewTeamName("");
                              setNewTeamSport("");
                              setNewTeamSeason("");
                            }}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.eventActions}>
                        <button
                          className={styles.secondaryBtn}
                          type="button"
                          onClick={() => {
                            setNewTeamChildId(child.id);
                            setNewTeamName("");
                            setNewTeamSport("");
                            setNewTeamSeason("");
                          }}
                          disabled={saving}
                        >
                          Add team
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          ) : null}

          {showArchived && archivedChildren.length ? (
            <div className={styles.profileSection}>
              <div className={styles.profileSectionTitle}>Archived</div>
              <div className={styles.profileList}>
                {archivedChildren.map((child) => (
                  <div key={child.id} className={styles.profileCard}>
                    <div className={styles.profileHeader}>
                      <div>
                        <div className={styles.profileName}>{child.display_name}</div>
                        <div className={styles.eventMeta}>Archived child profile</div>
                      </div>
                      <div className={styles.eventActions}>
                        <button className={styles.secondaryBtn} type="button" onClick={() => void onToggleChildArchive(child, false)} disabled={saving}>
                          Restore child
                        </button>
                      </div>
                    </div>
                    {child.teams.filter((team) => team.is_archived).length ? (
                      <div className={styles.profileTeamList}>
                        {child.teams
                          .filter((team) => team.is_archived)
                          .map((team) => (
                            <div key={team.id} className={styles.profileTeamRow}>
                              <div>
                                <div className={styles.profileTeamName}>{team.display_name}</div>
                                <div className={styles.eventMeta}>
                                  {titleCaseSport(team.sport)}
                                  {team.season_label ? ` · ${team.season_label}` : ""}
                                </div>
                              </div>
                              <button className={styles.secondaryBtn} type="button" onClick={() => void onToggleTeamArchive(team, false)} disabled={saving}>
                                Restore team
                              </button>
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
