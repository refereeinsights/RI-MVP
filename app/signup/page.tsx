"use client";

import { useState } from "react";
import { signUpUser, isHandleAvailable, normalizeHandle } from "@/lib/auth";
import SportsPickerClient from "@/components/SportsPickerClient";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [realName, setRealName] = useState("");
  const [yearsRefereeing, setYearsRefereeing] = useState("");

  const [sportsCsv, setSportsCsv] = useState("");

  const [checkingHandle, setCheckingHandle] = useState(false);
  const [handleAvailable, setHandleAvailable] = useState<boolean | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function checkHandle(value: string) {
    const normalized = normalizeHandle(value);
    setHandle(normalized);

    if (normalized.length < 3) {
      setHandleAvailable(null);
      return;
    }

    setCheckingHandle(true);
    setError(null);

    try {
      const available = await isHandleAvailable(normalized);
      setHandleAvailable(available);
    } catch {
      setError("Unable to check handle availability");
      setHandleAvailable(null);
    } finally {
      setCheckingHandle(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const sports = sportsCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const years = yearsRefereeing.trim()
      ? Number(yearsRefereeing)
      : null;

    try {
      await signUpUser({
        email,
        password,
        handle,
        realName,
        yearsRefereeing: years,
        sports,
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err?.message ?? "Signup failed");
    }
  }

  if (success) {
    return (
      <div className="flex justify-center py-16 px-4">
        <div className="w-full max-w-md p-6 border rounded text-center bg-white">
          <h1 className="text-xl font-semibold mb-2">Check your email</h1>
          <p className="text-sm text-gray-600">
            We’ve sent a verification link to <strong>{email}</strong>.
            <br />
            You must verify your email before posting reviews.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center py-16 px-4">
      <div className="w-full max-w-md bg-white border rounded-xl shadow-md p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Create your account</h1>

        {error && (
          <div className="mb-3 text-sm text-red-600 border border-red-200 p-2 rounded">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
          onChange={() => {
            const el = document.querySelector<HTMLInputElement>(
              'input[name="sports"]'
            );
            if (el) setSportsCsv(el.value || "");
          }}
        >
          {/* Email */}
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded px-3 py-2 text-center"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">At least 8 characters</p>
          </div>

          {/* Handle */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Public handle
            </label>
            <input
              type="text"
              required
              value={handle}
              onChange={(e) => checkHandle(e.target.value)}
              className="w-full border rounded px-3 py-2 text-center"
            />
            <div className="mt-1 text-xs">
              {checkingHandle && (
                <span className="text-gray-500">Checking availability…</span>
              )}
              {!checkingHandle && handleAvailable === true && (
                <span className="text-green-600">Handle is available</span>
              )}
              {!checkingHandle && handleAvailable === false && (
                <span className="text-red-600">Handle is already taken</span>
              )}
              {!checkingHandle && handleAvailable === null && (
                <span className="text-gray-500">
                  3–20 characters: lowercase letters, numbers, underscores
                </span>
              )}
            </div>
          </div>

          {/* Real name */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Real name (private)
            </label>
            <input
              type="text"
              required
              value={realName}
              onChange={(e) => setRealName(e.target.value)}
              className="w-full border rounded px-3 py-2 text-center"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for verification and moderation. Never shown publicly.
            </p>
          </div>

          {/* Years */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Years as a referee
            </label>
            <input
              type="number"
              min={0}
              max={80}
              value={yearsRefereeing}
              onChange={(e) => setYearsRefereeing(e.target.value)}
              className="w-full border rounded px-3 py-2 text-center"
              placeholder="e.g. 5"
            />
          </div>

          {/* Sports picker */}
          <SportsPickerClient name="sports" label="Sports" />

          {/* Create account */}
          <button
            type="submit"
            disabled={checkingHandle || handleAvailable === false}
            className="w-full mt-2 px-4 py-2 rounded-lg font-semibold text-white bg-black disabled:opacity-60"
          >
            Create account
          </button>

          <p className="text-xs text-gray-500">
            By creating an account, you agree to follow the Referee Insights
            community guidelines.
          </p>
        </form>
      </div>
    </div>
  );
}
