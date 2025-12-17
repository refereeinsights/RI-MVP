import { NextResponse } from "next/server";
import { searchSchools } from "@/lib/googlePlaces";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query : "";
    if (!query.trim()) {
      return NextResponse.json({ ok: true, results: [] });
    }

    const results = await searchSchools(query);
    return NextResponse.json({ ok: true, results });
  } catch (error: any) {
    console.error("School search failed", error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? "Unable to search schools." },
      { status: 500 }
    );
  }
}
