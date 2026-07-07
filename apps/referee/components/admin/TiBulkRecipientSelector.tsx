"use client";

import { useMemo, useState } from "react";

type RecipientOption = {
  id: string;
  email: string;
  label: string;
  meta: string;
  sentAt: string | null;
};

export default function TiBulkRecipientSelector({
  campaignLabel,
  recipients,
}: {
  campaignLabel: string | null;
  recipients: RecipientOption[];
}) {
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);

  const duplicateEmails = useMemo(
    () => recipients.filter((recipient) => Boolean(recipient.sentAt)).map((recipient) => recipient.email),
    [recipients],
  );
  const eligibleEmails = useMemo(
    () => recipients.filter((recipient) => !recipient.sentAt).map((recipient) => recipient.email),
    [recipients],
  );
  const duplicateEmailSet = useMemo(() => new Set(duplicateEmails), [duplicateEmails]);
  const selectedDuplicateCount = useMemo(
    () => selectedEmails.filter((email) => duplicateEmailSet.has(email)).length,
    [duplicateEmailSet, selectedEmails],
  );

  const setSelected = (emails: string[]) => {
    setSelectedEmails(Array.from(new Set(emails)));
  };

  const toggleSelected = (email: string, checked: boolean) => {
    setSelectedEmails((current) => {
      if (checked) return Array.from(new Set([...current, email]));
      return current.filter((value) => value !== email);
    });
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" onClick={() => setSelected(eligibleEmails)} style={{ padding: "6px 10px", fontWeight: 700 }}>
          Select all eligible
        </button>
        <button type="button" onClick={() => setSelected(recipients.map((recipient) => recipient.email))} style={{ padding: "6px 10px", fontWeight: 700 }}>
          Select all loaded
        </button>
        <button type="button" onClick={() => setSelected([])} style={{ padding: "6px 10px", fontWeight: 700 }}>
          Clear all
        </button>
        <div style={{ fontSize: 12, color: "#64748b" }}>
          {selectedEmails.length} selected
          {campaignLabel ? ` · ${eligibleEmails.length} eligible for ${campaignLabel}` : ""}
        </div>
      </div>

      {campaignLabel && duplicateEmails.length ? (
        <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 10, padding: 10, fontSize: 12, color: "#92400e" }}>
          <div style={{ fontWeight: 800 }}>
            {duplicateEmails.length} loaded users already received {campaignLabel}.
          </div>
          <div>
            Use <strong>Select all eligible</strong> to avoid resending, or check the override below if you intentionally want duplicates.
          </div>
        </div>
      ) : null}

      <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 10, maxHeight: 220, overflow: "auto", background: "#f8fafc" }}>
        {recipients.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {recipients.map((recipient) => {
              const checked = selectedEmails.includes(recipient.email);
              const duplicate = Boolean(recipient.sentAt);
              return (
                <label
                  key={recipient.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12,
                    color: duplicate ? "#92400e" : "#0f172a",
                    background: duplicate ? "#fff7ed" : "transparent",
                    borderRadius: 8,
                    padding: duplicate ? "4px 6px" : 0,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => toggleSelected(recipient.email, event.target.checked)}
                  />
                  <span style={{ fontWeight: 700 }}>{recipient.label}</span>
                  <span style={{ color: duplicate ? "#b45309" : "#64748b" }}>
                    {recipient.meta}
                    {duplicate ? ` · already sent ${recipient.sentAt}` : ""}
                  </span>
                </label>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#64748b", fontSize: 12 }}>No users loaded.</div>
        )}
      </div>

      {selectedDuplicateCount ? (
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontSize: 12, color: "#92400e" }}>
          <input type="checkbox" name="include_duplicate_recipients" value="on" />
          Allow {selectedDuplicateCount} selected recipients who already received this campaign
        </label>
      ) : null}

      {selectedEmails.map((email) => (
        <input key={email} type="hidden" name="recipient_email" value={email} />
      ))}
    </div>
  );
}
