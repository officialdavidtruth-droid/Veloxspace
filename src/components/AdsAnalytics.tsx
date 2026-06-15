import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { LoadingInline } from "./LoadingScreen";
import type { AppUser } from "../lib/supabase";
import type { AdMetric, AdBreakdown, AdCampaign } from "../types";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { RefreshCw, DollarSign, MousePointerClick, Eye, Target, Loader2, Globe2, Users2, TrendingUp, Smartphone, LayoutGrid, AlertCircle } from "lucide-react";

const PLATFORM_META: Record<string, { name: string; color: string; emoji: string }> = {
  meta_ads:   { name: "Meta Ads",   color: "#0668E1", emoji: "📘" },
  google_ads: { name: "Google Ads", color: "#4285F4", emoji: "🔍" },
  tiktok:     { name: "TikTok Ads", color: "#69C9D0", emoji: "🎵" },
};

function fmtCurrency(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n/1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}
function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

const GENDER_LABELS: Record<string, string> = { male: "Male", female: "Female", unknown: "Unknown", undetermined: "Unknown" };

export function AdsAnalytics({ user }: { user: AppUser }) {
  const [adMetrics,  setAdMetrics]  = useState<AdMetric[]>([]);
  const [breakdowns, setBreakdowns] = useState<AdBreakdown[]>([]);
  const { workspace } = useWorkspace();
  const [campaigns,  setCampaigns]  = useState<AdCampaign[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [syncing,    setSyncing]    = useState(false);
  const [syncNote,   setSyncNote]   = useState("");
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
  const [rangeDays,  setRangeDays]  = useState(30);

  useEffect(() => { load(); }, [user.uid]);

  const load = async () => {
    const [mRes, bRes, cRes] = await Promise.all([
      supabase.from("ad_metrics").select("*").eq("workspace_id", workspace?.id ?? "").order("recorded_at", { ascending: true }),
      supabase.from("ad_breakdowns").select("*").eq("workspace_id", workspace?.id ?? ""),
      supabase.from("ad_campaigns").select("*").eq("workspace_id", workspace?.id ?? "").order("spend", { ascending: false }),
    ]);
    setAdMetrics((mRes.data as AdMetric[]) ?? []);
    setBreakdowns((bRes.data as AdBreakdown[]) ?? []);
    setCampaigns((cRes.data as AdCampaign[]) ?? []);
    setLoading(false);
  };

  const syncAll = async () => {
    setSyncing(true); setSyncNote("");
    try {
      const res = await fetch("/api/sync-ads-breakdowns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid }),
      });
      const data = await res.json();
      const connected = (data.results ?? []).filter((r: any) => r.status !== "not_connected");
      if (!connected.length) setSyncNote("No ad accounts connected yet — connect Meta, Google, or TikTok in Settings.");
      else {
        const errors = connected.filter((r: any) => r.status === "error");
        if (errors.length) setSyncNote(`Some platforms had issues: ${errors.map((e: any) => `${PLATFORM_META[e.platform]?.name ?? e.platform} (${e.error})`).join(", ")}`);
      }
    } catch (e: any) { setSyncNote(e.message); }
    await load();
    setSyncing(false);
  };

  const cutoff = Date.now() - rangeDays * 24 * 60 * 60 * 1000;
  const filteredMetrics = useMemo(() =>
    adMetrics.filter(m => new Date(m.recorded_at).getTime() >= cutoff && (platformFilter.size === 0 || platformFilter.has(m.platform))),
    [adMetrics, cutoff, platformFilter]
  );
  const filteredBreakdowns = useMemo(() =>
    breakdowns.filter(b => platformFilter.size === 0 || platformFilter.has(b.platform)),
    [breakdowns, platformFilter]
  );
  const filteredCampaigns = useMemo(() =>
    campaigns.filter(c => platformFilter.size === 0 || platformFilter.has(c.platform)),
    [campaigns, platformFilter]
  );

  const latestByPlatform = useMemo(() => {
    const map = new Map<string, AdMetric>();
    for (const m of filteredMetrics) map.set(m.platform, m);
    return Array.from(map.values());
  }, [filteredMetrics]);

  const totals = latestByPlatform.reduce((acc, m) => ({
    spend: acc.spend + Number(m.ad_spend ?? 0),
    revenue: acc.revenue + Number(m.revenue ?? 0),
    clicks: acc.clicks + Number(m.clicks ?? 0),
    impressions: acc.impressions + Number(m.impressions ?? 0),
    conversions: acc.conversions + Number(m.conversions ?? 0),
  }), { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 });

  const cpc  = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
  const ctr  = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const cpm  = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
  const roas = totals.spend > 0 ? totals.revenue / totals.spend : 0;

  const trendData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const m of filteredMetrics) {
      const day = new Date(m.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      byDate.set(day, (byDate.get(day) ?? 0) + Number(m.ad_spend ?? 0));
    }
    return Array.from(byDate.entries()).map(([date, spend]) => ({ date, spend: parseFloat(spend.toFixed(2)) }));
  }, [filteredMetrics]);

  const platformCompare = latestByPlatform.map(m => ({
    name: PLATFORM_META[m.platform]?.name ?? m.platform,
    spend: Number(m.ad_spend ?? 0), impressions: Number(m.impressions ?? 0), clicks: Number(m.clicks ?? 0),
    color: PLATFORM_META[m.platform]?.color ?? "#888",
  }));

  function groupSpend(dimension: string, labelMap?: Record<string,string>) {
    const map = new Map<string, number>();
    for (const b of filteredBreakdowns) if (b.dimension === dimension) {
      const label = labelMap?.[b.dimension_value.toLowerCase()] ?? b.dimension_value;
      map.set(label, (map.get(label) ?? 0) + b.spend);
    }
    return Array.from(map.entries()).map(([key, spend]) => ({ key, spend: parseFloat(spend.toFixed(2)) }));
  }

  const ageData      = useMemo(() => groupSpend("age").sort((a,b) => a.key.localeCompare(b.key)), [filteredBreakdowns]);
  const genderData   = useMemo(() => groupSpend("gender", GENDER_LABELS), [filteredBreakdowns]);
  const deviceData   = useMemo(() => groupSpend("device").sort((a,b) => b.spend - a.spend), [filteredBreakdowns]);
  const placementData = useMemo(() => groupSpend("placement").sort((a,b) => b.spend - a.spend).slice(0, 8), [filteredBreakdowns]);

  const countryData = useMemo(() => {
    const map = new Map<string, { spend: number; clicks: number; impressions: number }>();
    for (const b of filteredBreakdowns) if (b.dimension === "country") {
      const cur = map.get(b.dimension_value) ?? { spend: 0, clicks: 0, impressions: 0 };
      map.set(b.dimension_value, { spend: cur.spend + b.spend, clicks: cur.clicks + b.clicks, impressions: cur.impressions + b.impressions });
    }
    return Array.from(map.entries()).map(([country, v]) => ({ country, ...v })).sort((a,b) => b.spend - a.spend).slice(0, 8);
  }, [filteredBreakdowns]);

  const connectedAdPlatforms = Array.from(new Set([...adMetrics.map(m => m.platform), ...breakdowns.map(b => b.platform), ...campaigns.map(c => c.platform)]));

  if (loading) return <LoadingInline label="Loading ads analytics…" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1" style={{ color:"var(--text)" }}>Ads Analytics</h1>
          <p className="text-sm" style={{ color:"var(--muted)" }}>Everything from Meta, Google &amp; TikTok Ads Manager — in one place</p>
        </div>
        <button onClick={syncAll} disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 gradient-primary hover:opacity-90">
          {syncing ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
          {syncing ? "Syncing…" : "Sync ad accounts"}
        </button>
      </div>

      {syncNote && (
        <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3" style={{ background:"var(--warning-bg)", color:"var(--warning)" }}>
          <AlertCircle size={15} className="shrink-0 mt-0.5"/> {syncNote}
        </div>
      )}

      {/* Filters */}
      <div className="glow-card rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color:"var(--muted)" }}>Filters</span>

        <div className="flex items-center gap-1 rounded-xl p-1" style={{ background:"var(--surface)" }}>
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setRangeDays(d)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
              style={rangeDays === d ? { background:"var(--primary)", color:"#fff" } : { color:"var(--muted)" }}>
              {d}d
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {Object.entries(PLATFORM_META).filter(([id]) => connectedAdPlatforms.includes(id)).map(([id, meta]) => {
            const active = platformFilter.size === 0 || platformFilter.has(id);
            return (
              <button key={id} onClick={() => setPlatformFilter(prev => {
                  if (prev.size === 0) return new Set([id]);
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  if (next.size === connectedAdPlatforms.length || next.size === 0) return new Set();
                  return next;
                })}
                className="pill transition-all"
                style={active ? { background:`${meta.color}15`, color: meta.color, border:`1px solid ${meta.color}40` } : { background:"var(--surface)", color:"var(--muted)", border:"1px solid var(--border)" }}>
                {meta.emoji} {meta.name}
              </button>
            );
          })}
          {connectedAdPlatforms.length === 0 && (
            <span className="text-xs" style={{ color:"var(--muted)" }}>No ad accounts synced yet — click "Sync ad accounts" above</span>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label:"Total Spend",  value:fmtCurrency(totals.spend),  Icon:DollarSign,        color:"var(--primary)" },
          { label:"Impressions",  value:fmtNum(totals.impressions), Icon:Eye,               color:"var(--info)"    },
          { label:"Clicks",       value:fmtNum(totals.clicks),      Icon:MousePointerClick, color:"#9333ea"        },
          { label:"CTR",          value:`${ctr.toFixed(2)}%`,       Icon:TrendingUp,        color:"var(--success)" },
          { label:"CPC / CPM",    value:`${fmtCurrency(cpc)} / ${fmtCurrency(cpm)}`, Icon:Target, color:"var(--warning)" },
          { label:"ROAS",         value:`${roas.toFixed(2)}×`,      Icon:TrendingUp,        color:"var(--danger)"  },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="glow-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color:"var(--muted)" }}>{label}</p>
              <div className="p-1.5 rounded-lg" style={{ background:`${color}15`, color }}><Icon size={12}/></div>
            </div>
            <p className="text-lg font-mono font-semibold tabular-nums" style={{ color:"var(--text)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Spend trend */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
          <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><TrendingUp size={14} style={{ color:"var(--primary)" }}/></div>
          Spend over time
        </h3>
        <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Each sync records a snapshot — line shows total spend across syncs within the selected range</p>
        {trendData.length > 0 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} />
                <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} formatter={(v: any) => fmtCurrency(v)} />
                <Line type="monotone" dataKey="spend" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>Sync your ad accounts a few times to build a spend trend</p>
        )}
      </div>

      {/* Platform comparison */}
      <div className="glow-card rounded-2xl p-5">
        <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
          <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><Target size={14} style={{ color:"var(--primary)" }}/></div>
          Platform comparison
        </h3>
        <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Spend across platforms — last 30 days</p>
        {platformCompare.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformCompare} margin={{ top:5, right:10, left:-10, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} />
                <YAxis stroke="var(--muted)" fontSize={11} />
                <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="spend" name="Spend ($)" radius={[6,6,0,0]}>
                  {platformCompare.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>Connect and sync at least one ad account to compare platforms</p>
        )}
      </div>

      {/* Campaign table */}
      <div className="glow-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor:"var(--border)" }}>
          <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
            <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><LayoutGrid size={14} style={{ color:"var(--primary)" }}/></div>
            Campaigns
          </h3>
          <p className="text-xs" style={{ color:"var(--muted)" }}>Campaign-level performance — last 30 days, sorted by spend</p>
        </div>
        {filteredCampaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Campaign","Platform","Spend","Impressions","Clicks","CTR","CPC","CPM","ROAS"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color:"var(--muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor:"var(--border)" }}>
                {filteredCampaigns.slice(0, 25).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 max-w-[220px] truncate font-medium" style={{ color:"var(--text)" }}>{c.campaign_name}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className="pill pill-neutral">{PLATFORM_META[c.platform]?.emoji} {PLATFORM_META[c.platform]?.name ?? c.platform}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{fmtCurrency(c.spend)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{fmtNum(c.impressions)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{fmtNum(c.clicks)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{c.ctr.toFixed(2)}%</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{fmtCurrency(c.cpc)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{fmtCurrency(c.cpm)}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums" style={{ color:"var(--text)" }}>{c.roas > 0 ? `${c.roas.toFixed(2)}×` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>No campaign data yet — sync your ad accounts above</p>
        )}
      </div>

      {/* Demographics: age + gender */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glow-card rounded-2xl p-5">
          <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
            <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><Users2 size={14} style={{ color:"var(--primary)" }}/></div>
            Spend by age group
          </h3>
          <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Where your ad budget is going by audience age</p>
          {ageData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="key" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} />
                  <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} formatter={(v: any) => fmtCurrency(v)} />
                  <Bar dataKey="spend" fill="var(--primary)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>No age breakdown data yet</p>}
        </div>

        <div className="glow-card rounded-2xl p-5">
          <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
            <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><Users2 size={14} style={{ color:"var(--primary)" }}/></div>
            Spend by gender
          </h3>
          <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Audience gender split for your ad spend</p>
          {genderData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={genderData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="key" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} />
                  <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} formatter={(v: any) => fmtCurrency(v)} />
                  <Bar dataKey="spend" fill="#9333ea" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>No gender breakdown data yet</p>}
        </div>
      </div>

      {/* Device + Placement/Network */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glow-card rounded-2xl p-5">
          <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
            <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><Smartphone size={14} style={{ color:"var(--primary)" }}/></div>
            Spend by device
          </h3>
          <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Mobile, desktop, and tablet split</p>
          {deviceData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deviceData} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="key" stroke="var(--muted)" fontSize={11} />
                  <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} />
                  <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} formatter={(v: any) => fmtCurrency(v)} />
                  <Bar dataKey="spend" fill="var(--info)" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>No device breakdown data yet</p>}
        </div>

        <div className="glow-card rounded-2xl p-5">
          <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
            <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><LayoutGrid size={14} style={{ color:"var(--primary)" }}/></div>
            Spend by placement / network
          </h3>
          <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Meta: Facebook / Instagram / Audience Network · Google: Search / Display / YouTube · TikTok: TikTok / Pangle</p>
          {placementData.length > 0 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={placementData} layout="vertical" margin={{ top:5, right:20, left:10, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtCurrency(v)} />
                  <YAxis type="category" dataKey="key" stroke="var(--muted)" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} formatter={(v: any) => fmtCurrency(v)} />
                  <Bar dataKey="spend" fill="#9333ea" radius={[0,6,6,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>No placement breakdown data yet</p>}
        </div>
      </div>

      {/* Geography */}
      <div className="glow-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b" style={{ borderColor:"var(--border)" }}>
          <h3 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color:"var(--text)" }}>
            <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><Globe2 size={14} style={{ color:"var(--primary)" }}/></div>
            Top countries by spend
          </h3>
          <p className="text-xs" style={{ color:"var(--muted)" }}>Where your ad spend is reaching audiences geographically</p>
        </div>
        {countryData.length > 0 ? (
          <div className="divide-y" style={{ borderColor:"var(--border)" }}>
            {countryData.map((c) => {
              const pct = totals.spend > 0 ? (c.spend / totals.spend) * 100 : 0;
              return (
                <div key={c.country} className="p-4 flex items-center gap-4">
                  <div className="w-32 shrink-0 text-sm font-medium truncate" style={{ color:"var(--text)" }}>{c.country}</div>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background:"var(--surface)" }}>
                    <div className="h-full rounded-full gradient-primary" style={{ width:`${Math.max(pct, 2)}%` }} />
                  </div>
                  <div className="w-20 shrink-0 text-right text-sm font-mono tabular-nums" style={{ color:"var(--text)" }}>{fmtCurrency(c.spend)}</div>
                  <div className="w-16 shrink-0 text-right text-xs font-mono tabular-nums" style={{ color:"var(--muted)" }}>{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm py-10 text-center" style={{ color:"var(--muted)" }}>No geographic breakdown data yet — sync your ad accounts above</p>
        )}
      </div>
    </div>
  );
}