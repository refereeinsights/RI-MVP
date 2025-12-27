import { NextResponse } from "next/server";

const backendUrl = process.env.RI_BACKEND_URL ?? process.env.NEXT_PUBLIC_RI_BACKEND_URL;
const adminToken = process.env.OWLS_EYE_ADMIN_TOKEN;

export async function POST(request: Request) {
  if (!backendUrl || !adminToken) {
    return NextResponse.json({ error: "missing_backend_config" }, { status: 500 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const resp = await fetch(new URL("/admin/owls-eye/run", backendUrl).toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": adminToken,
      },
      body: JSON.stringify(body),
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
