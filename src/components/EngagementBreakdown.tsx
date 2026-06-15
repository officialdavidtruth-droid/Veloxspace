import React from "react";
import type { SocialMetric } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { PieChart as PieIcon } from "lucide-react";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

const COLORS = ["var(--danger)", "var(--info)", "#9333ea"];

/**
 * Mimics the "engagement breakdown" panel native insights show —
 * likes / comments / shares side by side, plus reach vs impressions.
 */
export function EngagementBreakdown({ metric }: { metric: SocialMetric }) {
  const engagementData = [
    { name: "Likes", value: metric.likes },
    { name: "Comments", value: metric.comments },
    { name: "Shares", value: metric.shares },
  ].filter(d => d.value > 0);

  const reachData = [
    { name: "Reach", value: metric.reach },
    { name: "Impressions", value: metric.impressions },
  ].filter(d => d.value > 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="glow-card rounded-2xl p-5">
        <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text)" }}>
          <div className="p-1.5 rounded-lg" style={{ background: "var(--primary-soft)" }}><PieIcon size={14} style={{ color: "var(--primary)" }} /></div>
          Engagement breakdown
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>How your audience is interacting with your content</p>
        {engagementData.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagementData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={fmtNum} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} formatter={(v: any) => fmtNum(v)} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  {engagementData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm py-10 text-center" style={{ color: "var(--muted)" }}>No engagement data yet</p>
        )}
      </div>

      <div className="glow-card rounded-2xl p-5">
        <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text)" }}>
          <div className="p-1.5 rounded-lg" style={{ background: "var(--primary-soft)" }}><PieIcon size={14} style={{ color: "var(--primary)" }} /></div>
          Reach vs Impressions
        </h3>
        <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>Reach is unique accounts seen · impressions includes repeat views</p>
        {reachData.length > 0 ? (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reachData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={fmtNum} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} formatter={(v: any) => fmtNum(v)} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  <Cell fill="var(--info)" />
                  <Cell fill="#9333ea" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm py-10 text-center" style={{ color: "var(--muted)" }}>No reach/impressions data yet for this platform</p>
        )}
      </div>
    </div>
  );
}