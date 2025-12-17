"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";

const FEEDBACK_TYPES = [
  "Bug",
  "Feature Request",
  "Content Issue",
  "Safety/Trust",
  "Other",
] as const;

type SubmitState = "idle" | "submitting" | "success" | "error";

export default function FeedbackForm() {
  const [pageUrl, setPageUrl] = useState("");
  const [userAgent, setUserAgent] = useState("");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(window.location.href);
      setUserAgent(window.navigator.userAgent);
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload = {
      type: formData.get("type"),
      message: formData.get("message"),
      email: formData.get("email"),
      page_url: formData.get("page_url"),
      user_agent: formData.get("user_agent"),
    };

    setStatus("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const rawText = await res.text();
      let json: any = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        // ignore JSON parse errors; we'll report below via Sentry
      }
      if (!res.ok || !json?.ok) {
        Sentry.captureMessage("Feedback submission failed", {
          level: "error",
          extra: {
            status: res.status,
            statusText: res.statusText,
            responseBody: rawText?.slice(0, 2000) ?? "",
          },
        });
        throw new Error(json?.error ?? `Unable to send feedback (HTTP ${res.status}).`);
      }
      setStatus("success");
      formElement?.reset();
    } catch (error: any) {
      Sentry.captureException(error, {
        extra: {
          type: payload.type,
          page_url: payload.page_url,
        },
      });
      setStatus("error");
      setErrorMessage(error?.message ?? "Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return <p className="successMessage">Thanks — we read every submission.</p>;
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="feedbackForm" noValidate>
        <label>
          <span>Feedback type</span>
          <select name="type" required defaultValue={FEEDBACK_TYPES[0]}>
            {FEEDBACK_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Message</span>
          <textarea
            name="message"
            minLength={20}
            maxLength={2000}
            required
            placeholder="Explain the bug, request, or concern..."
          />
          <small>Minimum 20 characters.</small>
        </label>

        <label>
          <span>Email (optional)</span>
          <input type="email" name="email" placeholder="you@example.com" />
        </label>

        <input type="hidden" name="page_url" value={pageUrl} />
        <input type="hidden" name="user_agent" value={userAgent} />

        {status === "error" && errorMessage && (
          <p className="errorMessage">{errorMessage}</p>
        )}

        <button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "Sending…" : "Send feedback"}
        </button>
      </form>
      <style jsx>{`
        .feedbackForm {
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          color: #102213;
          font-weight: 600;
          font-size: 0.95rem;
        }
        select,
        textarea,
        input[type="email"] {
          border-radius: 12px;
          border: 1px solid rgba(0, 0, 0, 0.15);
          padding: 0.65rem 0.75rem;
          font-size: 1rem;
          font-family: inherit;
        }
        textarea {
          min-height: 160px;
          resize: vertical;
        }
        small {
          color: #6a7469;
          font-weight: 400;
        }
        button {
          border: none;
          border-radius: 999px;
          padding: 0.9rem 1.5rem;
          font-weight: 700;
          font-size: 1rem;
          background: #0f3d2e;
          color: #fff;
          cursor: pointer;
          transition: opacity 0.2s ease;
        }
        button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .successMessage {
          background: #eaf5ec;
          border: 1px solid #b4d7ba;
          padding: 1rem;
          border-radius: 12px;
          color: #204528;
          font-weight: 600;
        }
        .errorMessage {
          color: #b00020;
          font-weight: 600;
          margin: 0;
        }
      `}</style>
    </>
  );
}
