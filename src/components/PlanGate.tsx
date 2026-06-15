import React from "react";
import { useWorkspace } from "../lib/workspace";
import { PLANS, type PlanConfig } from "../lib/plans";
import { Lock, Zap } from "lucide-react";

interface Props {
  feature: keyof PlanConfig;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const UPGRADE_TO: Record<string, string> = {
  adsAnalytics: "pro", composerScheduling: "pro", approvalWorkflow: "pro",
  contentLibrary: "pro", pdfReports: "pro", clientViewer: "agency", multiWorkspace: "agency",
};

export function PlanGate({ feature, children, fallback }: Props) {
  const { canUse, workspace } = useWorkspace();
  if (canUse(feature)) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  const neededPlan = UPGRADE_TO[feature as string] ?? "pro";
  const plan = PLANS[neededPlan as keyof typeof PLANS];

  return (
    <div className="glow-card rounded-2xl p-8 text-center">
      <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center gradient-primary shadow-md">
        <Lock size={20} className="text-white" />
      </div>
      <h3 className="font-display text-base font-semibold mb-1" style={{ color: "var(--text)" }}>
        {plan.name} feature
      </h3>
      <p className="text-sm mb-4 max-w-xs mx-auto" style={{ color: "var(--muted)" }}>
        {plan.description}
      </p>
      <button
        onClick={() => {
          const el = document.getElementById("billing-section");
          if (el) el.scrollIntoView({ behavior: "smooth" });
          else window.location.href = "/?page=settings&tab=billing";
        }}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all shadow-md">
        <Zap size={14} /> Upgrade to {plan.name} — ${plan.price}/mo
      </button>
    </div>
  );
}

/** Inline lock badge — overlays on disabled nav items */
export function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className="pill ml-auto shrink-0" style={{ background: "var(--warning-bg)", color: "var(--warning)", fontSize: 9 }}>
      {plan}
    </span>
  );
}