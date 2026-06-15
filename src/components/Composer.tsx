import { LoadingInline } from "./LoadingScreen";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { PLATFORMS, getPlatform } from "../lib/platforms";
import type { AppUser } from "../lib/supabase";
import type { PlatformConnection, PlatformId, ScheduledPost } from "../types";
import { Send, Image as ImageIcon, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, Sparkles } from "lucide-react";

const getPlatformEmoji = (id: string) =>
  ({ instagram:"📸",facebook:"👥",linkedin:"💼",twitter:"🐦",tiktok:"🎵",youtube:"▶️" }[id] ?? "📊");

export function Composer({ user }: { user: AppUser }) {
  const [connections, setConnections] = useState<Record<string, PlatformConnection>>({});
  const { workspace } = useWorkspace();
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [posting, setPosting] = useState(false);
  const [results, setResults] = useState<Record<string, { success: boolean; post_url?: string; error?: string }> | null>(null);
  const [history, setHistory] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [user.uid]);

  const load = async () => {
    const [cRes, hRes] = await Promise.all([
      supabase.from("platform_connections").select("*").eq("workspace_id", workspace?.id ?? "").eq("connected", true),
      supabase.from("scheduled_posts").select("*").eq("workspace_id", workspace?.id ?? "").order("created_at", { ascending: false }).limit(10),
    ]);
    const map: Record<string, PlatformConnection> = {};
    (cRes.data ?? []).forEach((c: PlatformConnection) => { map[c.platform] = c; });
    setConnections(map);
    setHistory((hRes.data as ScheduledPost[]) ?? []);
    setLoading(false);
  };

  const toggle = (platform: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform); else next.add(platform);
      return next;
    });
  };

  const handlePublish = async () => {
    if (!content.trim() || selected.size === 0) return;
    setPosting(true); setResults(null);
    try {
      const res = await fetch("/api/publish-post", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, workspace_id: workspace?.id ?? "", content, media_url: mediaUrl || undefined, platforms: Array.from(selected) }),
      });
      const data = await res.json();
      setResults(data.results);
      await load();
      if (Object.values(data.results ?? {}).some((r: any) => r.success)) {
        setContent(""); setMediaUrl(""); setSelected(new Set());
      }
    } catch (e: any) {
      setResults({ error: { success: false, error: e.message } });
    } finally { setPosting(false); }
  };

  const connectedPlatforms = PLATFORMS.filter(p => p.id !== "google_ads" && connections[p.id]?.connected);
  const charCount = content.length;
  const overLimit = selected.has("twitter") && charCount > 280;

  if (loading) return <LoadingInline />;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1" style={{ color:"var(--text)" }}>Composer</h1>
        <p className="text-sm" style={{ color:"var(--muted)" }}>Write once, publish everywhere — pick your connected accounts below</p>
      </div>

      {connectedPlatforms.length === 0 ? (
        <div className="glow-card rounded-2xl p-10 text-center">
          <Sparkles size={28} className="mx-auto mb-3" style={{ color:"var(--muted)" }} />
          <h3 className="font-display text-lg font-semibold mb-2" style={{ color:"var(--text)" }}>No connected accounts yet</h3>
          <p className="text-sm" style={{ color:"var(--muted)" }}>Connect platforms in Settings to start publishing from here.</p>
        </div>
      ) : (
        <div className="glow-card rounded-2xl p-5 space-y-4">
          {/* Platform picker */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color:"var(--muted)" }}>Publish to</p>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.filter(p => p.id !== "google_ads").map(platform => {
                const conn = connections[platform.id];
                const isConnected = conn?.connected;
                const isSelected = selected.has(platform.id);
                const canPost = platform.canPost;
                return (
                  <button key={platform.id}
                    disabled={!isConnected || !canPost}
                    onClick={() => toggle(platform.id)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      borderColor: isSelected ? platform.color : "var(--border)",
                      background: isSelected ? `${platform.color}12` : "var(--card)",
                      color: isSelected ? platform.color : "var(--text)",
                    }}>
                    {conn?.profile_picture_url ? (
                      <img src={conn.profile_picture_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <span>{getPlatformEmoji(platform.id)}</span>
                    )}
                    {platform.name}
                    {!isConnected && <span className="text-[10px]" style={{ color:"var(--muted)" }}>· not connected</span>}
                    {isConnected && !canPost && <span className="text-[10px]" style={{ color:"var(--muted)" }}>· coming soon</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Content textarea */}
          <div>
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder="What do you want to share?"
              rows={5}
              className="w-full text-sm rounded-xl p-4 outline-none resize-none border transition-all"
              style={{ background:"var(--surface)", borderColor: overLimit ? "var(--danger)" : "var(--border)", color:"var(--text)" }} />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-[11px]" style={{ color: overLimit ? "var(--danger)" : "var(--muted)" }}>
                {charCount} characters{selected.has("twitter") ? " · X limit: 280" : ""}
              </p>
            </div>
          </div>

          {/* Media URL */}
          <div className="relative">
            <ImageIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color:"var(--muted)" }} />
            <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
              placeholder="Image or link URL (optional)"
              className="w-full text-sm rounded-xl pl-9 pr-3 py-2.5 outline-none border transition-all"
              style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }} />
          </div>

          {/* Publish button */}
          <button onClick={handlePublish} disabled={posting || !content.trim() || selected.size === 0 || overLimit}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 gradient-primary hover:opacity-90">
            {posting ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
            {posting ? "Publishing…" : `Publish to ${selected.size || ""} platform${selected.size === 1 ? "" : "s"}`}
          </button>

          {/* Results */}
          {results && (
            <div className="space-y-2">
              {Object.entries(results).map(([platform, r]) => (
                <div key={platform} className="flex items-center gap-2 text-sm p-3 rounded-xl" style={{ background: r.success ? "var(--success-bg)" : "var(--danger-bg)" }}>
                  {r.success ? <CheckCircle2 size={15} style={{ color:"var(--success)" }}/> : <XCircle size={15} style={{ color:"var(--danger)" }}/>}
                  <span className="font-medium" style={{ color: r.success ? "var(--success)" : "var(--danger)" }}>
                    {getPlatform(platform as PlatformId)?.name ?? platform}
                  </span>
                  {r.success && r.post_url && (
                    <a href={r.post_url} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-xs hover:opacity-80" style={{ color:"var(--success)" }}>
                      View post <ExternalLink size={11}/>
                    </a>
                  )}
                  {!r.success && (
                    <span className="ml-auto text-xs" style={{ color:"var(--danger)" }}>
                      {r.error === "not_supported" ? "Requires media upload — coming soon" : r.error === "not_connected" ? "Not connected" : r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="glow-card rounded-2xl overflow-hidden">
          <div className="p-4 border-b flex items-center gap-2" style={{ borderColor:"var(--border)" }}>
            <Clock size={14} style={{ color:"var(--primary)" }}/>
            <h3 className="font-display text-sm font-semibold" style={{ color:"var(--text)" }}>Recent posts</h3>
          </div>
          <div className="divide-y" style={{ borderColor:"var(--border)" }}>
            {history.map(post => (
              <div key={post.id} className="p-4">
                <p className="text-sm mb-2 line-clamp-2" style={{ color:"var(--text)" }}>{post.content}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {post.platforms.map(p => {
                    const r = post.results?.[p];
                    return (
                      <span key={p} className={`pill ${r?.success ? "pill-success" : "pill-danger"}`}>
                        {getPlatformEmoji(p)} {p}
                      </span>
                    );
                  })}
                  <span className="text-[10px] ml-auto" style={{ color:"var(--muted)" }}>
                    {new Date(post.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}