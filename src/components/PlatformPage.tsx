import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { getPlatform } from "../lib/platforms";
import { TopPosts } from "./TopPosts";
import { LoadingInline } from "./LoadingScreen";
import { GrowthTrend } from "./GrowthTrend";
import { EngagementBreakdown } from "./EngagementBreakdown";
import { AIInsights } from "./AIInsights";
import type { AppUser } from "../lib/supabase";
import type { PlatformId, SocialMetric, PlatformPost, AIInsight } from "../types";
import { RefreshCw, Wifi, WifiOff, AlertCircle, TrendingUp, Users, Eye, Heart, Loader2 } from "lucide-react";

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n/1_000).toFixed(1)}k`;
  return n.toLocaleString();
}
const getPlatformEmoji = (id: string) =>
  ({ instagram:"📸",facebook:"👥",linkedin:"💼",twitter:"🐦",tiktok:"🎵",youtube:"▶️",google_ads:"📊" }[id] ?? "📊");

export function PlatformPage({ user, platformId }: { user: AppUser; platformId: PlatformId }) {
  const platform   = getPlatform(platformId);
  const [metric,   setMetric]   = useState<SocialMetric | null>(null);
  const [posts,    setPosts]    = useState<PlatformPost[]>([]);
  const [insight,  setInsight]  = useState<AIInsight | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [syncing,  setSyncing]  = useState(false);
  const [aiLoading,setAiLoading]= useState(false);
  const [syncError,setSyncError]= useState("");
  const [connection,setConn]    = useState<{ account_id: string; access_token: string; account_name?: string; profile_picture_url?: string } | null>(null);

  useEffect(() => { loadData(); }, [user.uid, platformId]);

  const loadData = async () => {
    const [mRes, pRes, cRes, iRes] = await Promise.all([
      supabase.from("social_metrics").select("*").eq("uid",user.uid).eq("platform",platformId).maybeSingle(),
      supabase.from("platform_posts").select("*").eq("uid",user.uid).eq("platform",platformId).order("engagement_rate",{ascending:false}).limit(10),
      supabase.from("platform_connections").select("account_id,access_token,account_name,profile_picture_url,connected").eq("uid",user.uid).eq("platform",platformId).maybeSingle(),
      supabase.from("ai_insights").select("*").eq("uid",user.uid).eq("platform",platformId).order("generated_at",{ascending:false}).limit(1).maybeSingle(),
    ]);
    setMetric(mRes.data as SocialMetric ?? null);
    setPosts((pRes.data as PlatformPost[]) ?? []);
    setInsight(iRes.data as AIInsight ?? null);
    if (cRes.data?.access_token && cRes.data?.connected) setConn(cRes.data);
    setLoading(false);
  };

  const syncPlatform = async () => {
    if (!connection?.access_token) { setSyncError("No active connection found. Connect this platform in Settings first."); return; }
    setSyncing(true); setSyncError("");
    try {
      const res = await fetch("/api/sync-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platformId, account_id: connection.account_id, access_token: connection.access_token }),
      });
      const data = await res.json();
      if (data.error && !data.metrics) throw new Error(data.error);

      if (data.metrics) {
        const row = { uid: user.uid, platform: platformId, workspace_id: workspace?.id, ...data.metrics, synced_at: new Date().toISOString() };
        await supabase.from("social_metrics").upsert({ ...row, id: `${workspace?.id}_${platformId}` });
        setMetric({ id: `${workspace?.id}_${platformId}`, ...row } as SocialMetric);

        // Record today's snapshot for day-to-day trend tracking
        const today = new Date().toISOString().split("T")[0];
        await supabase.from("metric_history").upsert({
          id: `${workspace?.id}_${platformId}_${today}`, uid: user.uid, workspace_id: workspace?.id, platform: platformId, date: today,
          followers: data.metrics.followers ?? 0, following: data.metrics.following ?? 0, posts: data.metrics.posts ?? 0,
          likes: data.metrics.likes ?? 0, comments: data.metrics.comments ?? 0, shares: data.metrics.shares ?? 0,
          reach: data.metrics.reach ?? 0, impressions: data.metrics.impressions ?? 0,
          engagement_rate: data.metrics.engagement_rate ?? 0, profile_views: data.metrics.profile_views ?? 0,
          recorded_at: new Date().toISOString(),
        });
      }
      if (data.posts?.length) {
        const rows = data.posts.map((p: any, i: number) => ({ ...p, id: `${user.uid}_${platformId}_${p.post_id ?? i}`, uid: user.uid, platform: platformId, synced_at: new Date().toISOString() }));
        await supabase.from("platform_posts").delete().eq("uid",user.uid).eq("platform",platformId);
        await supabase.from("platform_posts").upsert(rows);
        setPosts(rows);
      }
      if (data.ad_metrics) {
        await supabase.from("ad_metrics").insert({
          uid: user.uid, workspace_id: workspace?.id, platform: platformId, period_label: "Last 30 days",
          ...data.ad_metrics, recorded_at: new Date().toISOString(),
        });
      }
      if (data.metrics) await generateInsights(data.metrics, data.posts ?? []);
    } catch (e: any) { setSyncError(e.message); }
    finally { setSyncing(false); }
  };

  const generateInsights = async (m?: any, rawPosts?: any[]) => {
    setAiLoading(true);
    try {
      const payload = m ? [{ platform: platformId, ...m }] : metric ? [metric] : [];
      if (!payload.length) return;
      const res = await fetch("/api/ai-insights", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ metrics: payload, posts: rawPosts ?? posts }) });
      const data = await res.json();
      if (data.overall_score !== undefined) {
        const row = { id: `${user.uid}_${platformId}`, uid: user.uid, platform: platformId, ...data };
        await supabase.from("ai_insights").upsert(row);
        setInsight(row);
      }
    } catch {}
    finally { setAiLoading(false); }
  };

  if (loading) return <LoadingInline />;

  const isConnected = !!(connection?.access_token);
  const avatarUrl   = metric?.profile_picture_url || connection?.profile_picture_url;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="glow-card rounded-2xl p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt={platform.name} className="w-14 h-14 rounded-2xl object-cover avatar-ring" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl border" style={{ background:`${platform.color}12`, borderColor:`${platform.color}25` }}>
                {getPlatformEmoji(platformId)}
              </div>
            )}
            <div>
              <h1 className="font-display text-xl font-semibold" style={{ color:"var(--text)" }}>{platform.name}</h1>
              <p className="text-sm" style={{ color:"var(--muted)" }}>
                {connection?.account_name || platform.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {isConnected && metric
                  ? <span className="pill pill-success"><Wifi size={9}/> Live · {new Date(metric.synced_at).toLocaleDateString()}</span>
                  : <span className="pill pill-neutral"><WifiOff size={9}/> Connect in Settings</span>
                }
              </div>
            </div>
          </div>
          <button onClick={syncPlatform} disabled={syncing || !isConnected}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 gradient-primary hover:opacity-90">
            {syncing ? <Loader2 size={14} className="animate-spin"/> : <RefreshCw size={14}/>}
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
        {syncError && (
          <div className="mt-3 flex items-start gap-2 text-xs rounded-xl px-3 py-2.5" style={{ background:"var(--warning-bg)", color:"var(--warning)" }}>
            <AlertCircle size={13} className="shrink-0 mt-0.5"/> {syncError}
          </div>
        )}
      </div>

      {metric ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label:"Followers",       value:fmtNum(metric.followers),                Icon:Users,      color:platform.color },
              { label:"Total Reach",     value:fmtNum(metric.reach),                    Icon:Eye,        color:"var(--info)"  },
              { label:"Engagement Rate", value:`${metric.engagement_rate.toFixed(2)}%`, Icon:TrendingUp, color:"var(--success)" },
              { label:"Total Likes",     value:fmtNum(metric.likes),                    Icon:Heart,      color:"var(--danger)" },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="glow-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color:"var(--muted)" }}>{label}</p>
                  <div className="p-2 rounded-xl" style={{ background:`${color}15`, color }}><Icon size={14}/></div>
                </div>
                <p className="text-xl font-mono font-semibold tabular-nums" style={{ color:"var(--text)" }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Secondary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[["Impressions",fmtNum(metric.impressions)],["Posts",fmtNum(metric.posts)],["Comments",fmtNum(metric.comments)],["Shares",fmtNum(metric.shares)]].map(([l,v]) => (
              <div key={l} className="rounded-xl p-4 border" style={{ background:"var(--card-alt)", borderColor:"var(--border)" }}>
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color:"var(--muted)" }}>{l}</p>
                <p className="text-lg font-mono font-semibold tabular-nums" style={{ color:"var(--text)" }}>{v}</p>
              </div>
            ))}
          </div>

          {/* Insights: real day-to-day growth */}
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wider mb-3" style={{ color:"var(--muted)" }}>Insights</h2>
            <GrowthTrend workspaceId={workspace?.id ?? ""} platform={platformId} color={platform.color} title={`${platform.name} growth`} />
          </div>

          {/* Engagement breakdown */}
          <EngagementBreakdown metric={metric} />

          {/* AI + Top Posts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AIInsights insight={insight} loading={aiLoading} onRefresh={() => generateInsights()}/>
            <TopPosts posts={posts} platformId={platformId} title={`Top ${platform.name} posts`}/>
          </div>
        </>
      ) : (
        <div className="glow-card rounded-2xl p-10 text-center">
          <div className="text-5xl mb-4">{getPlatformEmoji(platformId)}</div>
          <h3 className="font-display text-lg font-semibold mb-2" style={{ color:"var(--text)" }}>No {platform.name} data yet</h3>
          <p className="text-sm mb-4 max-w-xs mx-auto" style={{ color:"var(--muted)" }}>Connect your account in Settings, then click Sync to pull live data, top posts, and AI insights.</p>
          <div className="pill pill-neutral inline-flex">
            <WifiOff size={12}/> Settings → connect → sync here
          </div>
        </div>
      )}
    </div>
  );
}