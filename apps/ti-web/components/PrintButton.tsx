"use client";

export default function PrintButton(props: { label?: string; className?: string }) {
  const label = props.label ?? "Print weekend plan";
  return (
    <button
      type="button"
      className={props.className}
      onClick={() => window.print()}
      style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}
    >
      {label}
    </button>
  );
}

