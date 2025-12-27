import { NextResponse } from "next/server";

const backendUrl = process.env.RI_BACKEND_URL ?? process.env.NEXT_PUBLIC_RI_BACKEND_URL;
const adminToken = process.env.OWLS_EYE_ADMIN_TOKEN;

export async function GET(_request: Request, context: { params: { runId: string } }) {
  if (!backendUrl || !adminToken) {
    return NextResponse.json({ error: "missing_backend_config" }, { status: 500 });
  }

  const runId = context.params.runId;
  if (!runId) {
    return NextResponse.json({ error: "missing_run_id" }, { status: 400 });
  }

  try {
    const resp = await fetch(new URL(`/admin/owls-eye/run/${runId}`, backendUrl).toString(), {
      headers: { "x-admin-token": adminToken },
    });
    const json = await resp.json().catch(() => ({}));
    return NextResponse.json(json, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { error: "proxy_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
