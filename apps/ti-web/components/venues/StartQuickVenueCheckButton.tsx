"use client";

type Props = {
  className?: string;
  children?: React.ReactNode;
};

export default function StartQuickVenueCheckButton({ className, children }: Props) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (typeof window === "undefined") return;
        try {
          if (window.location.hash !== "#quick-venue-check") {
            window.location.hash = "quick-venue-check";
          }
        } catch {
          // ignore
        }
        try {
          window.dispatchEvent(new CustomEvent("ti:qvc:open"));
        } catch {
          // ignore
        }
        const el = window.document.getElementById("quick-venue-check");
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }}
    >
      {children ?? "Start quick venue check"}
    </button>
  );
}

