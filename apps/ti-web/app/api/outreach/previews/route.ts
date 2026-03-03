import { NextRequest, NextResponse } from "next/server";
import { getTiOutreachAdminUser } from "@/lib/outreachAdmin";
import { getOutreachGuardSecret } from "@/lib/outreach";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DeletePreviewBody = {
  id?: string;
  campaign_id?: string;
  sport?: string;
};

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("X-OUTREACH-KEY") || "";
  const expected = getOutreachGuardSecret();
  if (expected && headerKey === expected) {
    return true;
  }

  const user = await getTiOutreachAdminUser();
  return !!user;
}

export async function DELETE(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: DeletePreviewBody;
  try {
    body = (await request.json()) as DeletePreviewBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const previewId = (body.id || "").trim();
  const campaignId = (body.campaign_id || "").trim();
  const sport = (body.sport || "").trim().toLowerCase();

  let query = (supabaseAdmin.from("email_outreach_previews" as any) as any).delete().select("id");

  if (previewId) {
    query = query.eq("id", previewId);
  } else if (campaignId) {
    query = query.eq("campaign_id", campaignId);
    if (sport) query = query.eq("sport", sport);
  } else {
    return NextResponse.json({ error: "Provide id or campaign_id." }, { status: 400 });
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deleted: Array.isArray(data) ? data.length : 0 }, { status: 200 });
}
