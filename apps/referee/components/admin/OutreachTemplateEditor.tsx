"use client";

import { useMemo, useState } from "react";

type Template = {
  key: string;
  name: string;
  subject_template: string;
  body_template: string;
};

type Props = {
  initialTemplate: Template;
  followupTemplate: Template;
  defaultInitial: Template;
  defaultFollowup: Template;
  onSave: (formData: FormData) => void;
};

const DEFAULT_SENDER_NAME = "Rod";
const DEFAULT_SENDER_EMAIL = "rod@refereeinsights.com";

function renderPreview(template: Template) {
  const replacements: Record<string, string> = {
    "{{tournament_name}}": "Sample Tournament",
    "{{tournament_url}}": "https://www.refereeinsights.com/tournaments/sample-tournament",
    "{{city_state_parens}}": " (Seattle, WA)",
    "{{first_name_or_there}}": "there",
    "{{sender_name}}": DEFAULT_SENDER_NAME,
    "{{sender_email}}": DEFAULT_SENDER_EMAIL,
  };

  const apply = (text: string) =>
    Object.entries(replacements).reduce(
      (acc, [token, value]) => acc.split(token).join(value),
      text
    );

  return {
    subject: apply(template.subject_template),
    body: apply(template.body_template),
  };
}

export default function OutreachTemplateEditor({
  initialTemplate,
  followupTemplate,
  defaultInitial,
  defaultFollowup,
  onSave,
}: Props) {
  const templates = useMemo(
    () => ({
      tournament_initial: initialTemplate,
      tournament_followup: followupTemplate,
    }),
    [initialTemplate, followupTemplate]
  );
  const defaults = useMemo(
    () => ({
      tournament_initial: defaultInitial,
      tournament_followup: defaultFollowup,
    }),
    [defaultInitial, defaultFollowup]
  );

  const [selectedKey, setSelectedKey] = useState<"tournament_initial" | "tournament_followup">(
    "tournament_initial"
  );
  const [subject, setSubject] = useState(templates[selectedKey].subject_template);
  const [body, setBody] = useState(templates[selectedKey].body_template);

  const selectedTemplate = templates[selectedKey];
  const preview = renderPreview({
    key: selectedKey,
    name: selectedTemplate.name,
    subject_template: subject,
    body_template: body,
  });

  const resetToDefault = () => {
    setSubject(defaults[selectedKey].subject_template);
    setBody(defaults[selectedKey].body_template);
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ fontSize: 12, fontWeight: 700 }}>
        Template
        <select
          value={selectedKey}
          onChange={(e) => {
            const nextKey = e.target.value as "tournament_initial" | "tournament_followup";
            setSelectedKey(nextKey);
            setSubject(templates[nextKey].subject_template);
            setBody(templates[nextKey].body_template);
          }}
          style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
        >
          <option value="tournament_initial">Initial outreach</option>
          <option value="tournament_followup">Follow-up</option>
        </select>
      </label>

      <form action={onSave} style={{ display: "grid", gap: 10 }}>
        <input type="hidden" name="template_key" value={selectedKey} />
        <input type="hidden" name="template_name" value={selectedTemplate.name} />
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Subject
          <input
            type="text"
            name="subject_template"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ fontSize: 12, fontWeight: 700 }}>
          Body
          <textarea
            name="body_template"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc", fontFamily: "inherit" }}
          />
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            type="submit"
            style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111", color: "#fff", fontWeight: 800 }}
          >
            Save template
          </button>
          <button
            type="button"
            onClick={resetToDefault}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #111", background: "#fff", color: "#111", fontWeight: 800 }}
          >
            Reset to default
          </button>
        </div>
      </form>

      <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Preview (sample tournament)</div>
        <div style={{ fontSize: 12, color: "#111" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{preview.subject}</div>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{preview.body}</pre>
        </div>
      </div>
    </div>
  );
}
