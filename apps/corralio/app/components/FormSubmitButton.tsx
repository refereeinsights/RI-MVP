"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({
  idle,
  pending,
  variant = "primary",
}: {
  idle: string;
  pending: string;
  variant?: "primary" | "secondary" | "destructive";
}) {
  const status = useFormStatus();
  const className = variant === "primary"
    ? "primaryButton"
    : variant === "destructive"
      ? "destructiveButton"
      : "secondaryButton";
  return (
    <button className={className} type="submit" disabled={status.pending}>
      {status.pending ? pending : idle}
    </button>
  );
}
