import { NextResponse } from "next/server";
import { createSheetsClient, getSpreadsheetConfig } from "@/lib/googleSheets";

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

  try {
    const sheets = createSheetsClient();
    const { spreadsheetId, tabName } = getSpreadsheetConfig();
    if (!spreadsheetId) {
      throw new Error("Missing GOOGLE_SHEETS_SPREADSHEET_ID");
    }

    const values = [
      [
        new Date().toISOString(),
        payload.type,
        payload?.message?.trim(),
        payload.email?.trim() ?? "",
        payload.page_url ?? "",
        payload.user_agent ?? "",
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tabName || "feedback"}!A:F`,
      valueInputOption: "RAW",
      requestBody: { values },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Failed to write feedback", error);
    return NextResponse.json(
      { ok: false, error: "Unable to save feedback at this time." },
      { status: 500 }
    );
  }
}
