import { OWLS_EYE_BRANDING } from "@/lib/owlsEyeBranding";

export function OwlsEyeBrandingOverlay({ showLegend = true }: { showLegend?: boolean }) {
  return (
    <>
      <div
        style={{
          position: "absolute",
          right: 8,
          bottom: 8,
          padding: "4px 8px",
          fontSize: 11,
          lineHeight: 1.35,
          color: "#0f172a",
          background: "rgba(255,255,255,0.68)",
          borderRadius: 6,
          maxWidth: "70%",
          pointerEvents: "none",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          zIndex: 10,
        }}
      >
        {OWLS_EYE_BRANDING.footer}
      </div>
      {showLegend && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: "#4b5563",
            lineHeight: 1.4,
          }}
        >
          {OWLS_EYE_BRANDING.legend}
        </div>
      )}
    </>
  );
}

export default OwlsEyeBrandingOverlay;
