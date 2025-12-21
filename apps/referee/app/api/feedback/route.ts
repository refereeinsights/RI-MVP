import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ALLOWED_TYPES = ["Bug", "Feature Request", "Content Issue", "Safety/Trust", "Other"] as const;
const MAX_MESSAGE_LENGTH = 2000;
const MIN_MESSAGE_LENGTH = 20;

type FeedbackPayload = {
  type?: string;
  message?: string;
  email?: string | null;
  page_url?: string | null;
  user_agent?: string | null;
};

function validate(payload: FeedbackPayload) {
  if (!payload || typeof payload !== "object") {
    return "Invalid payload.";
  }

  const { type, message, email } = payload;

  if (!type || !ALLOWED_TYPES.includes(type as (typeof ALLOWED_TYPES)[number])) {
    return "Invalid feedback type.";
  }

  if (typeof message !== "string") {
    return "Message is required.";
  }

  const trimmed = message.trim();
  if (trimmed.length < MIN_MESSAGE_LENGTH) {
    return `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`;
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    return `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }

  if (email && typeof email === "string") {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (!validEmail) {
      return "Email address is invalid.";
    }
  }

  return null;
}

export async function POST(request: Request) {
  let payload: FeedbackPayload;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const errorMessage = validate(payload);
  if (errorMessage) {
    return NextResponse.json({ ok: false, error: errorMessage }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server is missing Supabase credentials." },
      { status: 500 }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const trimmedMessage = payload.message?.trim() ?? "";

    const { error } = await supabase.from("feedback").insert({
      type: payload.type,
      message: trimmedMessage,
      email: payload.email?.trim() || null,
      page_url: payload.page_url || null,
      user_agent: payload.user_agent || null,
      status: "new",
      source: "web",
    });

    if (error) {
      throw error;
    }

    // Best-effort GitHub issue creation (optional, never blocks user)
    const ghToken = process.env.GITHUB_TOKEN;
    const ghOwner = process.env.GITHUB_OWNER;
    const ghRepo = process.env.GITHUB_REPO;
    if (ghToken && ghOwner && ghRepo) {
      const issueTitle = `[Feedback] ${payload.type} - ${trimmedMessage.slice(0, 60)}…`;
      const issueBody = [
        `**Type:** ${payload.type}`,
        `**Message:**`,
        trimmedMessage,
        ``,
        `**Email:** ${payload.email?.trim() || "N/A"}`,
        `**Page:** ${payload.page_url || "N/A"}`,
        `**User agent:** ${payload.user_agent || "N/A"}`,
      ].join("\n");

      try {
        await fetch(`https://api.github.com/repos/${ghOwner}/${ghRepo}/issues`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ghToken}`,
            "Content-Type": "application/json",
            "User-Agent": "feedback-hook",
          },
          body: JSON.stringify({
            title: issueTitle,
            body: issueBody,
            labels: ["feedback"],
          }),
        });
      } catch (err) {
        console.error("GitHub issue creation failed", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Failed to write feedback", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save feedback at this time." },
      { status: 500 }
    );
  }
}
