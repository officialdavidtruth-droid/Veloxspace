import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { PLATFORMS, METRIC_DEFINITIONS } from "../lib/platforms";
import { CURRENCIES, fmtCurrency } from "../lib/currency";
import type { AppUser } from "../lib/supabase";
import type { SocialMetric, AdMetric } from "../types";
import { FileText, Download, Loader2, BarChart3, TrendingUp, Users, Eye } from "lucide-react";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString();
}


export function Reports({ user }: { user: AppUser }) {
  const [socialMetrics, setSocialMetrics] = useState<SocialMetric[]>([]);
  const { workspace } = useWorkspace();
  const [adMetrics,     setAdMetrics]     = useState<AdMetric[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [exporting,     setExporting]     = useState(false);
  const [currency,      setCurrency]      = useState("USD");
  const [reportTitle,   setReportTitle]   = useState("Social Media Analytics Report");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("social_metrics").select("*").eq("workspace_id", workspace?.id ?? ""),
      supabase.from("ad_metrics").select("*").eq("workspace_id", workspace?.id ?? "").order("recorded_at", { ascending: false }).limit(5),
    ]).then(([s, a]) => {
      setSocialMetrics((s.data as SocialMetric[]) ?? []);
      setAdMetrics((a.data as AdMetric[]) ?? []);
      setLoading(false);
    });
  }, [user.uid]);

  const exportPDF = async () => {
    if (!reportRef.current) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const { default: jsPDF } = await import("jspdf");
      const canvas = await html2canvas(reportRef.current, {
        scale: 2, useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pageW, imgH);
        heightLeft -= pageH;
      }
      pdf.save(`${reportTitle.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  const totalFollowers = socialMetrics.reduce((s, m) => s + m.followers, 0);
  const totalReach     = socialMetrics.reduce((s, m) => s + m.reach, 0);
  const avgEngagement  = socialMetrics.length ? socialMetrics.reduce((s, m) => s + m.engagement_rate, 0) / socialMetrics.length : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 size={22} className="animate-spin gradient-text" />
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Controls */}
      <div className="rounded-2xl p-5 border shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h1 className="font-display text-xl font-semibold mb-4" style={{ color: "var(--text)" }}>Reports</h1>
        <div className="flex flex-col md:flex-row gap-3">
          <input value={reportTitle} onChange={(e) => setReportTitle(e.target.value)}
            className="flex-1 text-sm rounded-xl px-3 py-2.5 border outline-none"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
            placeholder="Report title" />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="text-sm rounded-xl px-3 py-2.5 border outline-none cursor-pointer"
            style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>)}
          </select>
          <button onClick={exportPDF} disabled={exporting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-60 shrink-0">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? "Generating PDF…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* Report preview */}
      <div ref={reportRef} style={{ background: "#ffffff", color: "#0f172a", padding: "40px", borderRadius: "12px" }}>
        {/* Report header */}
        <div style={{ borderBottom: "2px solid #4f46e5", paddingBottom: "20px", marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <div style={{ width: "36px", height: "36px", background: "#4f46e5", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontSize: "18px" }}>⚡</span>
            </div>
            <div>
              <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: "20px", color: "#0f172a" }}>VeloxSpace</div>
              <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Analytics Platform</div>
            </div>
          </div>
          <h2 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "24px", fontWeight: 600, color: "#0f172a", margin: "12px 0 4px" }}>{reportTitle}</h2>
          <p style={{ fontSize: "13px", color: "#64748b" }}>Generated on {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} · Currency: {currency}</p>
        </div>

        {/* Summary KPIs */}
        <div style={{ marginBottom: "28px" }}>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>Performance Summary</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
            {[
              { label: "Total Followers", value: fmtNum(totalFollowers), icon: "👥" },
              { label: "Monthly Reach",   value: fmtNum(totalReach),     icon: "👁" },
              { label: "Avg Engagement",  value: `${avgEngagement.toFixed(1)}%`, icon: "📈" },
            ].map(({ label, value, icon }) => (
              <div key={label} style={{ background: "#f8fafc", borderRadius: "12px", padding: "16px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "20px", marginBottom: "8px" }}>{icon}</div>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
                <div style={{ fontFamily: "monospace", fontSize: "22px", fontWeight: 700, color: "#0f172a" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Platform breakdown */}
        {socialMetrics.length > 0 && (
          <div style={{ marginBottom: "28px" }}>
            <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>Platform Breakdown</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f1f5f9" }}>
                  {["Platform", "Followers", "Reach", "Impressions", "Engagement", "Posts"].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {socialMetrics.map((m, i) => {
                  const p = PLATFORMS.find((pl) => pl.id === m.platform);
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#ffffff" : "#fafafa" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: p?.color ?? "#4f46e5", display: "inline-block" }} />
                          {p?.name ?? m.platform}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmtNum(m.followers)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmtNum(m.reach)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmtNum(m.impressions)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: "#059669" }}>{m.engagement_rate.toFixed(2)}%</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{m.posts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Metrics glossary */}
        <div>
          <h3 style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: "14px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px" }}>Metrics Glossary</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
            {METRIC_DEFINITIONS.slice(0, 6).map((def) => (
              <div key={def.abbr} style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px", border: `1px solid ${def.color}20` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontWeight: 700, color: def.color, fontSize: "14px" }}>{def.abbr}</span>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>— {def.full}</span>
                </div>
                <p style={{ fontSize: "11px", color: "#374151", lineHeight: 1.5, margin: 0 }}>{def.description.slice(0, 100)}…</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: "28px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8" }}>
          <span>Generated by VeloxSpace Analytics Platform</span>
          <span>{new Date().toISOString().slice(0, 10)}</span>
        </div>
      </div>
    </div>
  );
}