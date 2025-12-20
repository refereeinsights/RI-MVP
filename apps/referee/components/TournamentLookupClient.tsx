"use client";

import { useMemo, useState } from "react";

type Result = {
  id: string;
  name: string | null;
  slug: string | null;
  city: string | null;
  state: string | null;
  sport: string | null;
  status: string | null;
};

export default function TournamentLookupClient({
  onSelectFieldName,
  fallbackFieldName,
  description,
  inputId,
}: {
  onSelectFieldName: string;
  fallbackFieldName: string;
  description?: string;
  inputId: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchValue, setLastFetchValue] = useState("");

  const debouncedFetch = useMemo(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    return (value: string) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        const normalized = value.trim();
        if (normalized.length < 2 || normalized === lastFetchValue) return;
        setLastFetchValue(normalized);
        setLoading(true);
        setError(null);
        try {
          const response = await fetch(`/api/admin/tournaments/search?q=${encodeURIComponent(normalized)}`);
          if (!response.ok) throw new Error(`Search failed (${response.status})`);
          const data = await response.json();
          setResults(data.results ?? []);
        } catch (err: any) {
          setError(err?.message ?? "Search failed");
        } finally {
          setLoading(false);
        }
      }, 250);
    };
  }, [lastFetchValue]);

  return (
    <div>
      <input type="hidden" name={onSelectFieldName} value={selected?.id ?? ""} />
      <input
        id={inputId}
        type="text"
        name={fallbackFieldName}
        placeholder="Start typing a slug or name"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          setSelected(null);
          setResults([]);
          setLastFetchValue("");
          const trimmed = value.trim();
          if (trimmed.length >= 2) debouncedFetch(trimmed);
        }}
        style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
      />
      {description && <div style={{ fontSize: 11, color: "#666", marginTop: 4 }}>{description}</div>}
      {loading && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>Searching…</div>}
      {error && <div style={{ fontSize: 12, color: "#b00020", marginTop: 4 }}>{error}</div>}
      {!loading && !error && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Tournament suggestions"
          style={{
            margin: "6px 0 0",
            padding: 0,
            listStyle: "none",
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "#fff",
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {results.map((result) => (
            <li
              role="option"
              aria-selected={selected?.id === result.id}
              key={result.id}
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #eee",
                cursor: "pointer",
                background: selected?.id === result.id ? "#f0f7f4" : "transparent",
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                setSelected(result);
                setQuery(result.slug ?? result.name ?? "");
                setResults([]);
              }}
            >
              <div style={{ fontWeight: 700 }}>
                {result.name ?? "Unnamed"}{" "}
                {result.city && result.state ? (
                  <span style={{ fontWeight: 400, color: "#555" }}>
                    — {result.city}, {result.state}
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: "#555" }}>
                slug: {result.slug ?? "—"} • {result.sport ?? "sport ?"} • {result.status ?? "status ?"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
