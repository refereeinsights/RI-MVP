import { ImageResponse } from "next/og";
import { PwaIconMarkup } from "@/lib/pwaIcon";

export const runtime = "nodejs";

export async function GET() {
  return new ImageResponse(<PwaIconMarkup size={180} />, {
    width: 180,
    height: 180,
  });
}
