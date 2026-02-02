import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import "../../tournaments/tournaments.css";

type SearchParams = {
  assignor_id?: string;
  submitted?: string;
};

const REQUEST_TYPES = [
  { value: "claim", label: "Claim my listing" },
  { value: "remove", label: "Remove my info" },
  { value: "correction", label: "Request a correction" },
] as const;

async function submitAssignorClaim(formData: FormData) {
  "use server";
  const supabase = createSupabaseServerClient();

  const assignorId = (formData.get("assignor_id") as string | null)?.trim() ?? "";
  const requesterEmail = (formData.get("requester_email") as string | null)?.trim() ?? "";
  const requestType = (formData.get("request_type") as string | null)?.trim() ?? "";
  const message = (formData.get("message") as string | null)?.trim() ?? null;

  if (!assignorId) {
    throw new Error("Missing assignor ID.");
  }
  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    throw new Error("Please enter a valid email address.");
  }
  if (!REQUEST_TYPES.some((t) => t.value === requestType)) {
    throw new Error("Please select a request type.");
  }

  const { error } = await supabase.from("assignor_claim_requests" as any).insert({
    assignor_id: assignorId,
    requester_email: requesterEmail,
    request_type: requestType,
    message,
  });

  if (error) {
    throw error;
  }

  redirect(`/assignors/claim?submitted=1&assignor_id=${encodeURIComponent(assignorId)}`);
}

export default function AssignorClaimPage({ searchParams }: { searchParams?: SearchParams }) {
  const assignorId = (searchParams?.assignor_id ?? "").trim();
  const submitted = searchParams?.submitted === "1";

  return (
    <main className="pitchWrap tournamentsWrap schoolsPage">
      <section className="field tournamentsField">
        <div className="headerBlock schoolsHeader brandedHeader">
          <h1 className="title" style={{ fontSize: "2rem", fontWeight: 600, letterSpacing: "-0.01em" }}>
            Claim / Remove Assignor Info
          </h1>
          <p
            className="subtitle"
            style={{
              marginTop: 8,
              maxWidth: 680,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            Use this form to claim your listing, request removal, or submit corrections.
          </p>
        </div>

        {submitted ? (
          <div
            style={{
              marginTop: 24,
              padding: "18px 20px",
              borderRadius: 16,
              border: "1px solid rgba(15, 23, 42, 0.2)",
              background: "#fff",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Thanks! We received your request.</h2>
            <p style={{ marginBottom: 0 }}>Our team will review it and follow up by email.</p>
            <div style={{ marginTop: 12 }}>
              <Link href="/assignors" style={{ color: "#0f172a", fontWeight: 700 }}>
                Back to Assignors
              </Link>
            </div>
          </div>
        ) : (
          <form
            action={submitAssignorClaim}
            style={{
              marginTop: 24,
              padding: "18px 20px",
              borderRadius: 16,
              border: "1px solid rgba(15, 23, 42, 0.2)",
              background: "#fff",
              display: "grid",
              gap: 14,
              maxWidth: 640,
            }}
          >
            <input type="hidden" name="assignor_id" value={assignorId} />
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Request type</span>
              <select
                name="request_type"
                defaultValue={REQUEST_TYPES[0].value}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                }}
              >
                {REQUEST_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Your email</span>
              <input
                name="requester_email"
                type="email"
                placeholder="you@example.com"
                required
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", fontWeight: 700, color: "#0b1f14" }}>
              <span style={{ marginBottom: 6 }}>Message (optional)</span>
              <textarea
                name="message"
                rows={4}
                placeholder="Share any details that help us verify or correct the listing."
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.2)",
                  background: "#fff",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="submit"
                className="btn"
                style={{
                  padding: "10px 16px",
                  borderRadius: 999,
                  background: "#0f172a",
                  color: "#fff",
                  border: "1px solid #0f172a",
                }}
              >
                Submit request
              </button>
              <Link
                href="/assignors"
                className="btn btnSecondary"
                style={{ background: "#ffffff", color: "#0f172a", border: "1px solid #0f172a" }}
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
