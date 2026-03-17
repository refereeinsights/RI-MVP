type BuildStampProps = {
  label?: string;
};

export default function BuildStamp({ label = "Build" }: BuildStampProps) {
  const buildStamp =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_BUILD_ID ??
    null;
  const buildShort = buildStamp ? buildStamp.slice(0, 7) : null;

  const vercelEnv = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "";
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID ?? null;
  const deploymentShort = deploymentId ? deploymentId.replace(/^dpl_/, "").slice(0, 7) : null;
  const vercelRegion = process.env.VERCEL_REGION ?? "";
  const vercelUrl = process.env.VERCEL_URL ?? "";

  if (!buildShort) return null;

  return (
    <div
      style={{
        fontSize: 11,
        color: "#6b7280",
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(229,231,235,0.9)",
        borderRadius: 10,
        padding: "6px 10px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        backdropFilter: "blur(6px)",
      }}
      title={[
        buildStamp ? `commit: ${buildStamp}` : null,
        vercelEnv ? `env: ${vercelEnv}` : null,
        deploymentId ? `deployment: ${deploymentId}` : null,
        vercelRegion ? `region: ${vercelRegion}` : null,
        vercelUrl ? `url: ${vercelUrl}` : null,
      ]
        .filter(Boolean)
        .join("\n")}
    >
      {label} {buildShort}
      {vercelEnv ? ` • ${vercelEnv}` : ""}
      {deploymentShort ? ` • dpl ${deploymentShort}` : ""}
    </div>
  );
}

