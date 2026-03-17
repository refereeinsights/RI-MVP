import type { ReactNode } from "react";
import BuildStamp from "@/components/admin/BuildStamp";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 50 }}>
        <BuildStamp />
      </div>
    </>
  );
}
