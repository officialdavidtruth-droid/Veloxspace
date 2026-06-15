import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { PLATFORMS, METRIC_DEFINITIONS } from "../lib/platforms";
import { AIInsights } from "./AIInsights";
import { TopPosts } from "./TopPosts";
import { LoadingInline } from "./LoadingScreen";
import { GrowthTrend } from "./GrowthTrend";
import type { AppUser } from "../lib/supabase";
import type { Page } from "../App";
import type { SocialMetric, PlatformPost, AIInsight, AdMetric } from "../types";
import { Users, Eye, TrendingUp, Wifi, WifiOff, ArrowRight, RefreshCw, Sparkles, Loader2, BarChart3, Info } from "lucide-react";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}
const getPlatformEmoji = (id: string) =>
  ({ instagram:"📸",facebook:"👥",linkedin:"💼",twitter:"🐦",tiktok:"🎵",youtube:"▶️",google_ads:"📊" }[id] ?? "📊");

export function Overview({ user, onNavigate }: { user: AppUser; onNavigate: (p: Page) => void }) {
  const [metrics,   setMetrics]   = useState<SocialMetric[]>([]);
  const [topPosts,  setTopPosts]  = useState<PlatformPost[]>([]);
  const [insight,   setInsight]   = useState<AIInsight | null>(null);
  const [adMetrics, setAdMetrics] = useState<AdMetric[]>([]);
  const { workspace } = useWorkspace();
  const [loading,   setLoading]   = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [user.uid]);

  const loadData = async () => {
    const [mRes, pRes, iRes, aRes] = await Promise.all([
      supabase.from("social_metrics").select("*").eq("workspace_id", workspace?.id ?? ""),
      supabase.from("platform_posts").select("*").eq("workspace_id", workspace?.id ?? "").order("engagement_rate",{ascending:false}).limit(9),
      supabase.from("ai_insights").select("*").eq("workspace_id", workspace?.id ?? "").eq("platform","all").order("generated_at",{ascending:false}).limit(1).maybeSingle(),
      supabase.from("ad_metrics").select("*").eq("workspace_id", workspace?.id ?? "").order("recorded_at",{ascending:false}).limit(20),
    ]);
    setMetrics((mRes.data as SocialMetric[]) ?? []);
    setTopPosts((pRes.data as PlatformPost[]) ?? []);
    setInsight(iRes.data as AIInsight ?? null);
    setAdMetrics((aRes.data as AdMetric[]) ?? []);
    setLoading(false);
  };

  const syncAll = async () => {
    setSyncing(true);
    const { data: conns } = await supabase.from("platform_connections").select("*").eq("workspace_id", workspace?.id ?? "").eq("connected", true);
    if (!conns?.length) { setSyncing(false); return; }

    for (const conn of conns) {
      try {
        const res = await fetch("/api/sync-platform", {
          method:"POST", headers:{"Content-Type":"application/json"},
          body: JSON.stringify({ platform: conn.platform, account_id: conn.account_id, access_token: conn.access_token }),
        });
        const data = await res.json();
        if (data.metrics) {
          const row = { uid: user.uid, platform: conn.platform, workspace_id: workspace?.id, ...data.metrics, synced_at: new Date().toISOString() };
          await supabase.from("social_metrics").upsert({ ...row, id: `${workspace?.id}_${conn.platform}` });

          const today = new Date().toISOString().split("T")[0];
          await supabase.from("metric_history").upsert({
            id: `${workspace?.id}_${conn.platform}_${today}`, uid: user.uid, workspace_id: workspace?.id, platform: conn.platform, date: today,
            followers: data.metrics.followers ?? 0, following: data.metrics.following ?? 0, posts: data.metrics.posts ?? 0,
            likes: data.metrics.likes ?? 0, comments: data.metrics.comments ?? 0, shares: data.metrics.shares ?? 0,
            reach: data.metrics.reach ?? 0, impressions: data.metrics.impressions ?? 0,
            engagement_rate: data.metrics.engagement_rate ?? 0, profile_views: data.metrics.profile_views ?? 0,
            recorded_at: new Date().toISOString(),
          });
        }
        if (data.posts?.length) {
          const rows = data.posts.map((p: any, i: number) => ({ ...p, id:`${user.uid}_${conn.platform}_${p.post_id ?? i}`, uid:user.uid, platform:conn.platform, synced_at:new Date().toISOString() }));
          await supabase.from("platform_posts").delete().eq("uid",user.uid).eq("platform",conn.platform);
          await supabase.from("platform_posts").upsert(rows);
        }
        if (data.ad_metrics) {
          await supabase.from("ad_metrics").insert({
            uid: user.uid, platform: conn.platform, period_label: "Last 30 days",
            ...data.ad_metrics, recorded_at: new Date().toISOString(),
          });
        }
      } catch {}
    }
    await loadData();
    await generateOverallInsights();
    setSyncing(false);
  };

  const generateOverallInsights = async () => {
    setAiLoading(true);
    try {
      const { data: m } = await supabase.from("social_metrics").select("*").eq("workspace_id", workspace?.id ?? "");
      const { data: p } = await supabase.from("platform_posts").select("*").eq("workspace_id", workspace?.id ?? "").order("engagement_rate",{ascending:false}).limit(12);
      const { data: ad } = await supabase.from("ad_metrics").select("*").eq("workspace_id", workspace?.id ?? "").order("recorded_at",{ascending:false}).limit(10);
      if (!m?.length) return;
      const res = await fetch("/api/ai-insights", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ metrics: m, posts: p ?? [], ad_metrics: ad ?? [] }),
      });
      const data = await res.json();
      if (data.overall_score !== undefined) {
        const row = { id:`${user.uid}_all`, uid:user.uid, platform:"all", ...data };
        await supabase.from("ai_insights").upsert(row);
        setInsight(row as AIInsight);
      }
    } catch {}
    finally { setAiLoading(false); }
  };

  const totalFollowers   = metrics.reduce((s, m) => s + m.followers, 0);
  const totalReach       = metrics.reduce((s, m) => s + m.reach, 0);
  const totalImpressions = metrics.reduce((s, m) => s + m.impressions, 0);
  const avgEngagement    = metrics.length ? metrics.reduce((s, m) => s + m.engagement_rate, 0) / metrics.length : 0;
  const connectedCount   = metrics.length;

  // Aggregate ad metrics for marketing performance
  const adTotals = adMetrics.reduce((acc, a) => ({
    spend: acc.spend + Number(a.ad_spend ?? 0),
    revenue: acc.revenue + Number(a.revenue ?? 0),
    clicks: acc.clicks + Number(a.clicks ?? 0),
    impressions: acc.impressions + Number(a.impressions ?? 0),
    conversions: acc.conversions + Number(a.conversions ?? 0),
    leads: acc.leads + Number(a.leads ?? 0),
  }), { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0, leads: 0 });

  const hasAdData = adMetrics.length > 0 && adTotals.spend > 0;
  const roas = adTotals.spend > 0 ? adTotals.revenue / adTotals.spend : 0;
  const roi  = adTotals.spend > 0 ? ((adTotals.revenue - adTotals.spend) / adTotals.spend) * 100 : 0;
  const ctr  = adTotals.impressions > 0 ? (adTotals.clicks / adTotals.impressions) * 100 : 0;
  const cpa  = adTotals.conversions > 0 ? adTotals.spend / adTotals.conversions : 0;
  const cpm  = adTotals.impressions > 0 ? (adTotals.spend / adTotals.impressions) * 1000 : 0;
  const cpc  = adTotals.clicks > 0 ? adTotals.spend / adTotals.clicks : 0;

  const marketingValues: Record<string, { value: number; display: string }> = {
    ROAS: { value: roas, display: `${roas.toFixed(2)}×` },
    ROI:  { value: roi,  display: `${roi.toFixed(1)}%` },
    CTR:  { value: ctr,  display: `${ctr.toFixed(2)}%` },
    CPA:  { value: cpa,  display: fmtCurrency(cpa) },
    CPM:  { value: cpm,  display: fmtCurrency(cpm) },
    CPC:  { value: cpc,  display: fmtCurrency(cpc) },
  };

  if (loading) return <LoadingInline />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1" style={{ color:"var(--text)" }}>
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {user.name.split(" ")[0]} 👋
          </h1>
          <p className="text-sm" style={{ color:"var(--muted)" }}>Real-time performance across all your connected accounts</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="pill pill-neutral">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background:"var(--success)" }}/>
            {connectedCount} platform{connectedCount !== 1 ? "s" : ""} synced
          </div>
          <button onClick={syncAll} disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 gradient-primary hover:opacity-90">
            {syncing ? <Loader2 size={13} className="animate-spin"/> : <RefreshCw size={13}/>}
            {syncing ? "Syncing…" : "Sync all"}
          </button>
          <button onClick={generateOverallInsights} disabled={aiLoading || !metrics.length}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all disabled:opacity-50"
            style={{ borderColor:"var(--border)", color:"var(--text)", background:"var(--card)" }}>
            {aiLoading ? <Loader2 size={13} className="animate-spin"/> : <Sparkles size={13} style={{ color:"var(--primary)" }}/>}
            AI analysis
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:"Total Followers",   value:fmtNum(totalFollowers),   Icon:Users,      color:"var(--primary)" },
          { label:"Avg Engagement",    value:`${avgEngagement.toFixed(1)}%`, Icon:TrendingUp, color:"var(--success)" },
          { label:"Monthly Reach",     value:fmtNum(totalReach),       Icon:Eye,        color:"var(--info)"    },
          { label:"Total Impressions", value:fmtNum(totalImpressions), Icon:BarChart3,  color:"#9333ea"        },
        ].map(({ label, value, Icon, color }) => (
          <div key={label} className="glow-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color:"var(--muted)" }}>{label}</p>
              <div className="p-2 rounded-xl" style={{ background:`${color}15`, color }}><Icon size={15}/></div>
            </div>
            <p className="text-2xl font-mono font-semibold tabular-nums" style={{ color:"var(--text)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Marketing Performance */}
      <div className="glow-card rounded-2xl overflow-hidden">
        <div className="p-5 border-b flex items-center justify-between flex-wrap gap-2" style={{ borderColor:"var(--border)" }}>
          <div>
            <h2 className="font-display text-base font-semibold flex items-center gap-2" style={{ color:"var(--text)" }}>
              <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><TrendingUp size={14} style={{ color:"var(--primary)" }}/></div>
              Marketing Performance
            </h2>
            <p className="text-xs mt-1" style={{ color:"var(--muted)" }}>
              {hasAdData ? "From your connected ad accounts, last 30 days" : "Connect Google Ads to see real ROAS, ROI, CTR & CPA"}
            </p>
          </div>
          {!hasAdData && (
            <button onClick={() => onNavigate("google_ads" as Page)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:opacity-90"
              style={{ background:"var(--primary-soft)", color:"var(--primary)" }}>
              Connect Google Ads →
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y md:divide-y-0" style={{ borderColor:"var(--border)" }}>
          {METRIC_DEFINITIONS.filter(d => ["ROAS","ROI","CTR","CPA","CPM","CPC"].includes(d.abbr)).map((def) => {
            const data = marketingValues[def.abbr];
            const isHovered = hoveredMetric === def.abbr;
            return (
              <div key={def.abbr}
                className="relative p-4 transition-colors cursor-default"
                style={{ borderColor:"var(--border)" }}
                onMouseEnter={() => setHoveredMetric(def.abbr)}
                onMouseLeave={() => setHoveredMetric(null)}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: def.color }}>{def.abbr}</span>
                  <Info size={10} style={{ color:"var(--muted)" }} />
                </div>
                {hasAdData ? (
                  <p className="text-xl font-mono font-bold tabular-nums" style={{ color:"var(--text)" }}>{data.display}</p>
                ) : (
                  <p className="text-xl font-mono font-bold tabular-nums" style={{ color:"var(--muted)" }}>—</p>
                )}
                <p className="text-[10px] mt-1 truncate" style={{ color:"var(--muted)" }}>{def.full}</p>

                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute z-20 left-0 top-full mt-2 w-64 p-3 rounded-xl shadow-lg text-left"
                    style={{ background:"var(--card)", border:"1px solid var(--border)", boxShadow:"var(--shadow-lg)" }}>
                    <p className="text-xs font-semibold mb-1" style={{ color:"var(--text)" }}>{def.full}</p>
                    <p className="text-[11px] font-mono mb-2" style={{ color:"var(--primary)" }}>{def.formula}</p>
                    <p className="text-[11px] leading-relaxed mb-2" style={{ color:"var(--text-soft)" }}>{def.description}</p>
                    <p className="text-[10px]" style={{ color:"var(--muted)" }}>{def.benchmark}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Aggregate growth trend */}
      <GrowthTrend workspaceId={workspace?.id ?? ""} platform="all" title="Overall growth across all platforms" />

      {/* Platform cards */}
      <div>
        <h2 className="font-display text-sm font-semibold uppercase tracking-wider mb-3" style={{ color:"var(--muted)" }}>Platform status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {PLATFORMS.filter(p => p.id !== "google_ads").map((platform) => {
            const m = metrics.find((x) => x.platform === platform.id);
            return (
              <div key={platform.id}
                className="glow-card rounded-2xl p-5 cursor-pointer group"
                onClick={() => onNavigate(platform.id as Page)}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {m?.profile_picture_url ? (
                      <img src={m.profile_picture_url} alt={platform.name} className="w-10 h-10 rounded-full object-cover avatar-ring" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background:`${platform.color}15` }}>
                        {getPlatformEmoji(platform.id)}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold" style={{ color:"var(--text)" }}>{platform.name}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {m ? <span className="pill pill-success"><Wifi size={9}/> Live data</span>
                           : <span className="pill pill-neutral"><WifiOff size={9}/> Not connected</span>}
                      </div>
                    </div>
                  </div>
                  <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-all" style={{ color:"var(--muted)" }}/>
                </div>
                {m ? (
                  <div className="grid grid-cols-3 gap-3">
                    {[[fmtNum(m.followers),"Followers"],[fmtNum(m.reach),"Reach"],[`${m.engagement_rate.toFixed(1)}%`,"ER"]].map(([v,l]) => (
                      <div key={l}><p className="text-[10px] uppercase tracking-wide mb-0.5" style={{ color:"var(--muted)" }}>{l}</p><p className="text-sm font-semibold font-mono tabular-nums" style={{ color:"var(--text)" }}>{v}</p></div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color:"var(--muted)" }}>Connect in Settings → Sync to see live metrics</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Insights + Top Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AIInsights insight={insight} loading={aiLoading} onRefresh={generateOverallInsights}/>
        <TopPosts posts={topPosts} title="Top posts across all platforms"/>
      </div>
    </div>
  );
}