import { NextResponse, type NextRequest } from "next/server";
import { USERNAME_PATTERN, normalizeUsername } from "@/lib/tiProfile";
import { isUsernameTaken } from "@/lib/tiUserProfileServer";

export async function GET(req: NextRequest) {
  const username = normalizeUsername(new URL(req.url).searchParams.get("username"));

  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: "Username must be 3-20 characters using letters, numbers, or underscores.",
      },
      { status: 400 }
    );
  }

  try {
    const taken = await isUsernameTaken(username);
    return NextResponse.json({ ok: true, available: !taken });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        error: error instanceof Error ? error.message : "Unable to check username availability.",
      },
      { status: 500 }
    );
  }
}
