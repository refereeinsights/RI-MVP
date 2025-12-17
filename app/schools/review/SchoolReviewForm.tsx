"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  canSubmit: boolean;
  disabledMessage?: string;
};

type SubmitState = "idle" | "saving" | "success" | "error";

type SchoolSuggestion = {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function SchoolReviewForm({ canSubmit, disabledMessage }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SchoolSuggestion[]>([]);
  const [selected, setSelected] = useState<SchoolSuggestion | null>(null);
  const [searching, setSearching] = useState(false);
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    async function runSearch() {
      setSearching(true);
      try {
        const res = await fetch("/api/schools/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (res.ok) setSuggestions(data.results ?? []);
      } finally {
        setSearching(false);
      }
    }
    const timeout = setTimeout(runSearch, 350);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  function handleSelect(suggestion: SchoolSuggestion) {
    setSelected(suggestion);
    setQuery(`${suggestion.name} – ${suggestion.formattedAddress}`);
    setSuggestions([]);
  }

  const placeSummary = useMemo(() => {
    if (!selected) return null;
    return `${selected.name}${selected.formattedAddress ? ` • ${selected.formattedAddress}` : ""}`;
  }, [selected]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || state === "saving") return;

    if (!selected?.name || !selected.city || !selected.state) {
      setErrorMessage("Select a school from the list before submitting.");
      setState("error");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      school: selected,
      overall_score: Number(formData.get("overall_score") ?? 0),
      logistics_score: Number(formData.get("logistics_score") ?? 0),
      facilities_score: Number(formData.get("facilities_score") ?? 0),
      pay_score: Number(formData.get("pay_score") ?? 0),
      support_score: Number(formData.get("support_score") ?? 0),
      worked_games: formData.get("worked_games")
        ? Number(formData.get("worked_games"))
        : null,
      shift_detail: String(formData.get("shift_detail") ?? "").trim(),
    };

    if (
      [payload.overall_score, payload.logistics_score, payload.facilities_score, payload.pay_score, payload.support_score].some(
        (value) => Number.isNaN(value) || value < 1 || value > 5
      )
    ) {
      setErrorMessage("Scores must be between 1 and 5 whistles.");
      setState("error");
      return;
    }

    setState("saving");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/schools/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to submit review.");
      }
      form.reset();
      setSelected(null);
      setQuery("");
      setState("success");
    } catch (err: any) {
      setState("error");
      setErrorMessage(err?.message ?? "Unable to submit review.");
    }
  }

  if (!canSubmit) {
    return (
      <div className="schoolReviewDisabled">
        <p>{disabledMessage ?? "You must be a verified referee to submit school reviews."}</p>
        <style jsx>{`
          .schoolReviewDisabled {
            border: 1px dashed rgba(0, 0, 0, 0.25);
            border-radius: 16px;
            padding: 20px;
            color: rgba(0, 0, 0, 0.65);
            background: rgba(0, 0, 0, 0.02);
          }
        `}</style>
      </div>
    );
  }

  return (
    <form className="schoolReviewForm" onSubmit={handleSubmit}>
      <label className="schoolReviewForm__search">
        <span>School name</span>
        <input
          type="text"
          placeholder="Start typing a school name…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
        />
        {searching && <small>Searching…</small>}
        {suggestions.length > 0 && (
          <ul className="suggestions">
            {suggestions.map((suggestion) => (
              <li key={suggestion.placeId}>
                <button
                  type="button"
                  onClick={() => handleSelect(suggestion)}
                >
                  <strong>{suggestion.name}</strong>
                  <span>{suggestion.formattedAddress}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>

      {placeSummary && (
        <div className="selectedSummary">
          <span>Selected school</span>
          <strong>{placeSummary}</strong>
        </div>
      )}

      <p className="instruction">
        Rate each category from 1 to 5 whistles (1 = unacceptable, 5 = outstanding) and give context
        about logistics, crew support, safety, and pay expectations at this school.
      </p>

      <div className="grid">
        <label>
          <span>Overall experience</span>
          <input type="number" name="overall_score" min={1} max={5} step={1} required />
        </label>
        <label>
          <span>Logistics &amp; site access</span>
          <input type="number" name="logistics_score" min={1} max={5} step={1} required />
        </label>
        <label>
          <span>Facilities / fields</span>
          <input type="number" name="facilities_score" min={1} max={5} step={1} required />
        </label>
        <label>
          <span>Pay accuracy / timing</span>
          <input type="number" name="pay_score" min={1} max={5} step={1} required />
        </label>
        <label>
          <span>School support &amp; security</span>
          <input type="number" name="support_score" min={1} max={5} step={1} required />
        </label>
        <label>
          <span>Games worked</span>
          <input type="number" name="worked_games" min={0} max={30} placeholder="e.g. 4" />
        </label>
      </div>

      <label className="textareaField">
        <span>What should other referees know?</span>
        <textarea
          name="shift_detail"
          rows={5}
          maxLength={1200}
          placeholder="Parking, locker rooms, athletic director support, crowd behavior, lighting, etc."
          required
        />
      </label>

      {errorMessage && <p className="errorMessage">{errorMessage}</p>}
      {state === "success" && (
        <p className="successMessage">
          Thanks for sharing. Your school review has been queued for moderator approval.
        </p>
      )}

      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Submitting…" : "Submit school review"}
      </button>

      <style jsx>{`
        .schoolReviewForm {
          display: flex;
          flex-direction: column;
          gap: 1.35rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          font-weight: 600;
          color: #0f241a;
        }
        .schoolReviewForm__search input {
          border: 1px solid rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 0.75rem 0.85rem;
          font-size: 1rem;
        }
        .suggestions {
          list-style: none;
          margin: 0.4rem 0 0;
          padding: 0;
          border: 1px solid rgba(0, 0, 0, 0.15);
          border-radius: 12px;
          max-height: 260px;
          overflow: auto;
          background: #fff;
        }
        .suggestions li + li {
          border-top: 1px solid rgba(0, 0, 0, 0.05);
        }
        .suggestions button {
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          padding: 0.6rem 0.9rem;
          cursor: pointer;
        }
        .suggestions strong {
          display: block;
          color: #102213;
        }
        .suggestions span {
          display: block;
          color: rgba(0, 0, 0, 0.6);
          font-size: 0.85rem;
        }
        .selectedSummary {
          border-left: 4px solid #0f3d2e;
          padding: 0.4rem 0.8rem;
          background: rgba(15, 61, 46, 0.06);
          border-radius: 10px;
          font-size: 0.95rem;
        }
        .instruction {
          color: rgba(0, 0, 0, 0.7);
          margin-top: 0;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 1rem;
        }
        input[type=\"number\"],
        textarea {
          border: 1px solid rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 0.65rem 0.75rem;
          font-size: 1rem;
          font-family: inherit;
        }
        textarea {
          resize: vertical;
        }
        button {
          align-self: flex-start;
          background: #0f3d2e;
          color: #fff;
          border: none;
          border-radius: 999px;
          padding: 0.85rem 1.8rem;
          font-weight: 700;
          font-size: 1rem;
          cursor: pointer;
        }
        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .errorMessage {
          color: #b00020;
          font-weight: 600;
          margin: 0;
        }
        .successMessage {
          color: #0f3d2e;
          background: #e9f5ef;
          border: 1px solid #c6dfd1;
          padding: 0.75rem;
          border-radius: 12px;
          font-weight: 600;
          margin: 0;
        }
      `}</style>
    </form>
  );
}
