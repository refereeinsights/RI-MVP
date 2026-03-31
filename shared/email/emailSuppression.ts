export type EmailSendKind = "transactional" | "marketing";

export type EmailSuppressionRow = {
  email: string;
  suppress_marketing: boolean;
  suppress_all: boolean;
  reason: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

// Keep this intentionally lightweight (provider-level validation happens elsewhere).
export function isPlausibleEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export async function loadEmailSuppressionsByEmail(params: {
  supabaseAdmin: any;
  emails: string[];
}): Promise<Map<string, EmailSuppressionRow>> {
  const map = new Map<string, EmailSuppressionRow>();
  const unique = Array.from(new Set(params.emails.map(normalizeEmail))).filter(Boolean);
  if (!unique.length) return map;

  // Small batches to stay under URL length limits in PostgREST.
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const batch = unique.slice(i, i + chunkSize);
    const { data, error } = await (params.supabaseAdmin.from("email_suppressions" as any) as any)
      .select("email,suppress_marketing,suppress_all,reason")
      .in("email", batch);
    if (error) throw error;
    for (const row of ((data ?? []) as EmailSuppressionRow[])) {
      if (!row?.email) continue;
      map.set(normalizeEmail(row.email), {
        email: normalizeEmail(row.email),
        suppress_marketing: Boolean((row as any).suppress_marketing),
        suppress_all: Boolean((row as any).suppress_all),
        reason: (row as any).reason ?? null,
      });
    }
  }

  return map;
}

export function isSuppressed(params: {
  kind: EmailSendKind;
  suppression: EmailSuppressionRow | null;
}) {
  const s = params.suppression;
  if (!s) return false;
  if (s.suppress_all) return true;
  if (params.kind === "marketing" && s.suppress_marketing) return true;
  return false;
}

export async function filterSuppressedRecipients(params: {
  supabaseAdmin: any;
  kind: EmailSendKind;
  recipients: string[];
}): Promise<{
  allowed: string[];
  suppressed: Array<{ email: string; reason: string | null }>;
}> {
  const normalized = params.recipients.map(normalizeEmail).filter(Boolean);
  const suppressionMap = await loadEmailSuppressionsByEmail({
    supabaseAdmin: params.supabaseAdmin,
    emails: normalized,
  });

  const allowed: string[] = [];
  const suppressed: Array<{ email: string; reason: string | null }> = [];

  for (const email of normalized) {
    const row = suppressionMap.get(email) ?? null;
    if (isSuppressed({ kind: params.kind, suppression: row })) {
      suppressed.push({ email, reason: row?.reason ?? null });
    } else {
      allowed.push(email);
    }
  }

  return { allowed, suppressed };
}

