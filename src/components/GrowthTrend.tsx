import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import type { MetricHistory, PlatformId } from "../types";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

type MetricKey = "followers" | "reach" | "impressions" | "engagement_rate";

const METRIC_LABELS: Record<MetricKey, string> = {
  followers: "Followers", reach: "Reach", impressions: "Impressions", engagement_rate: "Engagement Rate",
};

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
function fmtVal(key: MetricKey, n: number): string {
  return key === "engagement_rate" ? `${n.toFixed(2)}%` : fmtNum(n);
}

interface Props {
  workspaceId: string;
  platform: PlatformId | "all";
  color?: string;
  title?: string;
}

/**
 * Real day-to-day trend chart. Pulls from metric_history (written on every sync).
 * For platform="all", aggregates across all platforms per day.
 */
export function GrowthTrend({ workspaceId, platform, color = "var(--primary)", title = "Growth over time" }: Props) {
  const [history, setHistory] = useState<MetricHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric]   = useState<MetricKey>("followers");
  const [rangeDays, setRangeDays] = useState(30);

  useEffect(() => { load(); }, [workspaceId, platform]);

  const load = async () => {
    let query = supabase.from("metric_history").select("*").eq("workspace_id", workspaceId).order("date", { ascending: true });
    if (platform !== "all") query = query.eq("platform", platform);
    const { data } = await query;
    setHistory((data as MetricHistory[]) ?? []);
    setLoading(false);
  };

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    return d.toISOString().split("T")[0];
  }, [rangeDays]);

  const chartData = useMemo(() => {
    const filtered = history.filter(h => h.date >= cutoff);
    if (platform === "all") {
      const byDate = new Map<string, { sum: number; count: number }>();
      for (const h of filtered) {
        const cur = byDate.get(h.date) ?? { sum: 0, count: 0 };
        const val = h[metric] ?? 0;
        byDate.set(h.date, { sum: cur.sum + Number(val), count: cur.count + (metric === "engagement_rate" ? 1 : 0) });
      }
      return Array.from(byDate.entries()).map(([date, v]) => ({
        date: new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: metric === "engagement_rate" && v.count > 0 ? v.sum / v.count : v.sum,
      }));
    }
    return filtered.map(h => ({
      date: new Date(h.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      value: Number(h[metric] ?? 0),
    }));
  }, [history, cutoff, metric, platform]);

  const delta = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].value;
    const last  = chartData[chartData.length - 1].value;
    const diff  = last - first;
    const pct   = first !== 0 ? (diff / first) * 100 : 0;
    return { diff, pct };
  }, [chartData]);

  if (loading) return null;

  if (history.length < 2) {
    return (
      <div className="glow-card rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg" style={{ background: "var(--primary-soft)" }}><Activity size={14} style={{ color: "var(--primary)" }} /></div>
          <h3 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        </div>
        <p className="text-sm py-8 text-center" style={{ color: "var(--muted)" }}>
          Sync this platform on different days to start building a real day-to-day trend — each sync records a snapshot of your numbers.
        </p>
      </div>
    );
  }

  return (
    <div className="glow-card rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ background: "var(--primary-soft)" }}><Activity size={14} style={{ color: "var(--primary)" }} /></div>
          <h3 className="font-display text-base font-semibold" style={{ color: "var(--text)" }}>{title}</h3>
        </div>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "var(--surface)" }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setRangeDays(d)}
              className="text-xs font-medium px-2.5 py-1 rounded-lg transition-all"
              style={rangeDays === d ? { background: "var(--primary)", color: "#fff" } : { color: "var(--muted)" }}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Metric selector */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        {(Object.keys(METRIC_LABELS) as MetricKey[]).map(key => (
          <button key={key} onClick={() => setMetric(key)}
            className="pill transition-all"
            style={metric === key ? { background: "var(--primary-soft)", color: "var(--primary)", border: "1px solid var(--primary)40" } : { background: "var(--surface)", color: "var(--muted)", border: "1px solid var(--border)" }}>
            {METRIC_LABELS[key]}
          </button>
        ))}
        {delta && (
          <span className="pill ml-auto" style={delta.diff > 0 ? { background: "var(--success-bg)", color: "var(--success)" } : delta.diff < 0 ? { background: "var(--danger-bg)", color: "var(--danger)" } : { background: "var(--card-alt)", color: "var(--muted)" }}>
            {delta.diff > 0 ? <TrendingUp size={11}/> : delta.diff < 0 ? <TrendingDown size={11}/> : <Minus size={11}/>}
            {delta.diff > 0 ? "+" : ""}{fmtVal(metric, delta.diff)} ({delta.pct > 0 ? "+" : ""}{delta.pct.toFixed(1)}%) over {rangeDays}d
          </span>
        )}
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} />
            <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtVal(metric, v)} />
            <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "10px", fontSize: "12px" }} formatter={(v: any) => fmtVal(metric, v)} />
            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill="url(#growthGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}