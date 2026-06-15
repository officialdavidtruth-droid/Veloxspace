import React from "react";
import { VeloxMark } from "./VeloxLogo";

/** Full-page loading state (initial app load / auth check) */
export function LoadingScreen({ label = "Loading VeloxSpace…" }: { label?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4" style={{ background: "var(--bg)" }}>
      <VeloxMark size={56} animate />
      <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}

/** Inline loading state for page sections (data fetch, sync, account switch) */
export function LoadingInline({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <VeloxMark size={40} animate />
      <p className="text-xs font-medium" style={{ color: "var(--muted)" }}>{label}</p>
    </div>
  );
}