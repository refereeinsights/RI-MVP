"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({
  idle,
  pending,
  variant = "primary",
}: {
  idle: string;
  pending: string;
  variant?: "primary" | "secondary";
}) {
  const status = useFormStatus();
  return (
    <button className={variant === "primary" ? "primaryButton" : "secondaryButton"} type="submit" disabled={status.pending}>
      {status.pending ? pending : idle}
    </button>
  );
}
