"use client";

import { useFormStatus } from "react-dom";

export function FormSubmitButton({ idle, pending }: { idle: string; pending: string }) {
  const status = useFormStatus();
  return (
    <button className="primaryButton" type="submit" disabled={status.pending}>
      {status.pending ? pending : idle}
    </button>
  );
}
