"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function ApiUsageDateFilters({
  rangeLinks,
  activeRange,
  label,
  rpcError,
}: {
  rangeLinks: Array<{ label: string; value: string }>;
  activeRange: string;
  label: string;
  rpcError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [singleDate, setSingleDate] = useState("");

  const current = useMemo(() => new URLSearchParams(searchParams?.toString() ?? ""), [searchParams]);

  function push(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
      {rangeLinks.map((r) => {
        const next = new URLSearchParams(current);
        next.set("range", r.value);
        next.delete("from");
        next.delete("to");
        const href = `${pathname}?${next.toString()}`;
        const isActive = activeRange === r.value;
        return (
          <a
            key={r.value}
            href={href}
            onClick={(e) => {
              e.preventDefault();
              push(next);
            }}
            style={{
              padding: "4px 14px",
              borderRadius: 6,
              fontSize: 13,
              textDecoration: "none",
              background: isActive ? "#1e40af" : "#f3f4f6",
              color: isActive ? "#fff" : "#374151",
              border: "1px solid",
              borderColor: isActive ? "#1e40af" : "#e5e7eb",
            }}
          >
            {r.label}
          </a>
        );
      })}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!singleDate) return;
          const next = new URLSearchParams(current);
          next.set("from", singleDate);
          next.set("to", singleDate);
          next.delete("range");
          push(next);
        }}
        style={{ display: "flex", gap: 6, alignItems: "center" }}
      >
        <input
          type="date"
          value={singleDate}
          onChange={(e) => setSingleDate(e.target.value)}
          style={{
            height: 28,
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            padding: "0 8px",
            fontSize: 13,
            background: "#fff",
            color: "#111827",
          }}
        />
        <button
          type="submit"
          style={{
            height: 28,
            borderRadius: 6,
            border: "1px solid #e5e7eb",
            padding: "0 10px",
            fontSize: 13,
            background: "#fff",
            color: "#111827",
            cursor: "pointer",
          }}
        >
          Go
        </button>
      </form>

      <span style={{ fontSize: 13, color: "#6b7280" }}>{label}</span>
      {rpcError && <span style={{ fontSize: 12, color: "#dc2626" }}>Query error: {rpcError}</span>}
    </div>
  );
}

