import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function getConfiguredAdminEmails() {
  const raw = process.env.TI_ADMIN_EMAILS || process.env.RI_ADMIN_EMAIL || "";
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

async function getTiOutreachAdminState() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.trim().toLowerCase() || "";
  const adminEmails = getConfiguredAdminEmails();
  const isDevelopment = process.env.NODE_ENV !== "production";
  const isAllowed = !!user && (adminEmails.length > 0 ? adminEmails.includes(email) : isDevelopment);

  return { user, isAllowed };
}

export async function requireTiOutreachAdmin() {
  const { user, isAllowed } = await getTiOutreachAdminState();

  if (!user) {
    redirect("/login");
  }

  if (!isAllowed) {
    redirect("/");
  }

  return user;
}

export async function getTiOutreachAdminUser() {
  const { user, isAllowed } = await getTiOutreachAdminState();
  return isAllowed ? user : null;
}
