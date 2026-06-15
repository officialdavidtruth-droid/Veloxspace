import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useWorkspace } from "../lib/workspace";
import { PLANS, PLAN_FEATURES, formatLimit, type PlanId } from "../lib/plans";
import type { AppUser } from "../lib/supabase";
import type { PlatformConnection } from "../types";
import {
  Sun, Moon, Wifi, WifiOff, ExternalLink, AlertCircle, CheckCircle2,
  ChevronDown, ChevronUp, LogOut, Users, Building2, CreditCard,
  Link2, Send, Trash2, Crown, Shield, Eye, User, Plus, Zap, Check,
} from "lucide-react";

const SITE_URL     = import.meta.env.VITE_SITE_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
const REDIRECT_URI = `${SITE_URL}/api/oauth-callback`;

interface OAuthGroup {
  key: string; label: string; emoji: string; covers: string[];
  color: string; guide: string; setupUrl: string; envVars: string[];
  buildUrl: (uid: string, workspaceId: string) => string | null;
}

const OAUTH_GROUPS: OAuthGroup[] = [
  {
    key: "meta", label: "Meta (Instagram + Facebook + Meta Ads)", emoji: "📘", covers: ["instagram","facebook","meta_ads"], color: "#1877F2",
    guide: "1. developers.facebook.com → Create App → Business type\n2. Add Instagram Graph API + Marketing API\n3. Settings → Basic → copy App ID & App Secret\n4. Add Valid OAuth Redirect URI below\n5. Request: pages_show_list, pages_read_engagement, business_management, ads_read",
    setupUrl: "https://developers.facebook.com/apps", envVars: ["VITE_META_APP_ID","META_APP_SECRET"],
    buildUrl: (uid, wid) => {
      const id = import.meta.env.VITE_META_APP_ID; if (!id) return null;
      return `https://www.facebook.com/v18.0/dialog/oauth?` + new URLSearchParams({ client_id:id, redirect_uri:REDIRECT_URI, scope:"pages_show_list,pages_read_engagement,business_management,ads_read", state:`meta__${uid}__${wid}`, response_type:"code" });
    },
  },
  {
    key: "google", label: "Google (YouTube + Google Ads)", emoji: "🔍", covers: ["youtube","google_ads"], color: "#4285F4",
    guide: "1. console.cloud.google.com → Create Project\n2. Enable: YouTube Data API v3 + Google Ads API\n3. Credentials → OAuth 2.0 Client ID (Web)\n4. Add Authorized Redirect URI below\n5. For Ads: apply for developer token at ads.google.com",
    setupUrl: "https://console.cloud.google.com", envVars: ["VITE_GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_ADS_DEVELOPER_TOKEN"],
    buildUrl: (uid, wid) => {
      const id = import.meta.env.VITE_GOOGLE_CLIENT_ID; if (!id) return null;
      return `https://accounts.google.com/o/oauth2/v2/auth?` + new URLSearchParams({ client_id:id, redirect_uri:REDIRECT_URI, response_type:"code", scope:"https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/adwords", access_type:"offline", prompt:"consent", state:`google__${uid}__${wid}` });
    },
  },
  {
    key: "tiktok", label: "TikTok Ads", emoji: "🎵", covers: ["tiktok"], color: "#69C9D0",
    guide: "1. ads.tiktok.com → Developer Portal → Create App\n2. Add scopes: ad.read, user.info.basic\n3. Set Redirect URI below\n4. Copy App ID & App Secret",
    setupUrl: "https://ads.tiktok.com/marketing_api/", envVars: ["VITE_TIKTOK_APP_ID","TIKTOK_APP_SECRET"],
    buildUrl: (uid, wid) => {
      const id = import.meta.env.VITE_TIKTOK_APP_ID; if (!id) return null;
      return `https://business-api.tiktok.com/portal/auth?app_id=${id}&state=tiktok__${uid}__${wid}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    },
  },
  {
    key: "linkedin", label: "LinkedIn", emoji: "💼", covers: ["linkedin"], color: "#0A66C2",
    guide: "1. linkedin.com/developers → Create App → link to a Company Page\n2. Products → Add: Marketing Developer Platform\n3. Auth tab → copy Client ID & Client Secret\n4. Add Authorized Redirect URL below",
    setupUrl: "https://www.linkedin.com/developers/apps", envVars: ["VITE_LINKEDIN_CLIENT_ID","LINKEDIN_CLIENT_SECRET"],
    buildUrl: (uid, wid) => {
      const id = import.meta.env.VITE_LINKEDIN_CLIENT_ID; if (!id) return null;
      return `https://www.linkedin.com/oauth/v2/authorization?` + new URLSearchParams({ response_type:"code", client_id:id, redirect_uri:REDIRECT_URI, scope:"r_liteprofile r_emailaddress r_organization_social w_organization_social rw_organization_admin", state:`linkedin__${uid}__${wid}` });
    },
  },
  {
    key: "twitter", label: "X (Twitter)", emoji: "🐦", covers: ["twitter"], color: "#000000",
    guide: "1. developer.twitter.com → Create Project & App\n2. Set App permissions: Read\n3. User authentication settings → enable OAuth 2.0\n4. Add Callback URI below\n5. Copy Client ID & Client Secret",
    setupUrl: "https://developer.twitter.com", envVars: ["VITE_TWITTER_CLIENT_ID","TWITTER_CLIENT_SECRET"],
    buildUrl: (uid, wid) => {
      const id = import.meta.env.VITE_TWITTER_CLIENT_ID; if (!id) return null;
      const verifier = btoa(crypto.getRandomValues(new Uint8Array(32)).join("")).slice(0,43).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
      const challenge = verifier;
      const state = `twitter__${uid}__${wid}__${btoa(verifier)}`;
      return `https://twitter.com/i/oauth2/authorize?` + new URLSearchParams({ response_type:"code", client_id:id, redirect_uri:REDIRECT_URI, scope:"tweet.read users.read", state, code_challenge:challenge, code_challenge_method:"plain" });
    },
  },
];

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown size={13}/>, admin: <Shield size={13}/>,
  member: <User size={13}/>, viewer: <Eye size={13}/>,
};
const ROLE_COLORS: Record<string, string> = {
  owner: "var(--warning)", admin: "var(--primary)", member: "var(--success)", viewer: "var(--muted)",
};

type Tab = "workspace" | "connections" | "team" | "billing";

export function Settings({ user }: { user: AppUser }) {
  const { isDark, toggle } = useTheme();
  const { workspace, workspaces, members, limits, isOwner, isAdmin, refetch, canUse } = useWorkspace();
  const [tab, setTab] = useState<Tab>("workspace");
  const [connections, setConnections] = useState<Record<string, PlatformConnection>>({});
  const [oauthMsg, setOauthMsg] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const [wsType, setWsType] = useState<"individual"|"agency">(workspace?.type ?? "individual");
  const [wsSaving, setWsSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [upgradeModalPlan, setUpgradeModalPlan] = useState<PlanId | null>(null);
  const [billingEmail, setBillingEmail] = useState("");
  const [notifySubmitted, setNotifySubmitted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const conn = params.get("connected"); const err = params.get("oauth_error");
    if (conn) { setOauthMsg(`✓ ${conn.charAt(0).toUpperCase()+conn.slice(1)} connected successfully`); window.history.replaceState({},""," /"); setTab("connections"); }
    if (err)  { setOauthError(decodeURIComponent(err)); window.history.replaceState({},""," /"); setTab("connections"); }
    loadConnections();
  }, []);

  useEffect(() => {
    if (workspace) { setWsName(workspace.name); setWsType(workspace.type as any); }
  }, [workspace?.id]);

  const loadConnections = async () => {
    if (!workspace?.id) return;
    const { data } = await supabase.from("platform_connections").select("*").eq("workspace_id", workspace.id);
    const map: Record<string, PlatformConnection> = {};
    (data ?? []).forEach((c: PlatformConnection) => { map[c.platform] = c; });
    setConnections(map);
  };

  const handleConnect = (group: OAuthGroup) => {
    if (!workspace?.id) return;
    const url = group.buildUrl(user.uid, workspace.id);
    if (!url) { setOauthError(`Set ${group.envVars.join(" and ")} in Netlify environment variables first.`); return; }
    window.location.href = url;
  };

  const handleDisconnect = async (group: OAuthGroup) => {
    if (!workspace?.id) return;
    for (const p of group.covers) {
      await supabase.from("platform_connections").update({ connected: false }).eq("workspace_id", workspace.id).eq("platform", p);
    }
    await loadConnections();
  };

  const saveWorkspace = async () => {
    if (!workspace?.id || !isOwner) return;
    setWsSaving(true);
    await supabase.from("workspaces").update({ name: wsName, type: wsType }).eq("id", workspace.id);
    await refetch();
    setWsSaving(false);
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim() || !workspace?.id || !isAdmin) return;
    setInviting(true);
    await supabase.from("workspace_members").insert({
      workspace_id: workspace.id, uid: "", role: inviteRole,
      status: "pending", invited_email: inviteEmail.trim(), invited_at: new Date().toISOString(),
    });
    setInviteEmail(""); await refetch();
    setInviting(false);
  };

  const removeMember = async (memberId: string) => {
    await supabase.from("workspace_members").delete().eq("id", memberId);
    await refetch();
  };

  const handleBillingNotify = async () => {
    if (!billingEmail) return;
    // Store email for when Paystack/Flutterwave is live
    await supabase.from("workspaces").update({ billing_email: billingEmail }).eq("id", workspace?.id);
    setNotifySubmitted(true);
  };

  const isConnected    = (g: OAuthGroup) => g.covers.some(p => connections[p]?.connected);
  const getAccountName = (g: OAuthGroup) => g.covers.map(p => connections[p]).find(c => c?.connected)?.account_name ?? "";
  const getAccountPic  = (g: OAuthGroup) => g.covers.map(p => connections[p]).find(c => c?.connected)?.profile_picture_url ?? "";

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "workspace",   label: "Workspace",   icon: <Building2 size={14}/> },
    { id: "connections", label: "Connections", icon: <Link2 size={14}/> },
    { id: "team",        label: "Team",        icon: <Users size={14}/> },
    { id: "billing",     label: "Plan & Billing", icon: <CreditCard size={14}/> },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1" style={{ color:"var(--text)" }}>Settings</h1>
        <p className="text-sm" style={{ color:"var(--muted)" }}>Manage your workspace, team, platforms, and plan</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background:"var(--surface)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 px-3 rounded-lg transition-all"
            style={tab === t.id ? { background:"var(--card)", color:"var(--text)", boxShadow:"var(--shadow-sm)" } : { color:"var(--muted)" }}>
            {t.icon} <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── WORKSPACE TAB ───────────────────────────────────────────────────── */}
      {tab === "workspace" && (
        <div className="space-y-4">
          <div className="glow-card rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-base font-semibold" style={{ color:"var(--text)" }}>Workspace info</h2>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color:"var(--muted)" }}>Workspace name</label>
              <input value={wsName} onChange={e => setWsName(e.target.value)}
                disabled={!isOwner}
                className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none"
                style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color:"var(--muted)" }}>Workspace type</label>
              <div className="flex gap-2">
                {(["individual","agency"] as const).map(t => (
                  <button key={t} disabled={!isOwner} onClick={() => setWsType(t)}
                    className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all disabled:opacity-50"
                    style={wsType === t ? { borderColor:"var(--primary)", background:"var(--primary-soft)", color:"var(--primary)" } : { borderColor:"var(--border)", color:"var(--muted)" }}>
                    {t === "agency" ? <Building2 size={14}/> : <User size={14}/>}
                    {t.charAt(0).toUpperCase()+t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {isOwner && (
              <button onClick={saveWorkspace} disabled={wsSaving}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50">
                {wsSaving ? "Saving…" : "Save changes"}
              </button>
            )}
          </div>

          <div className="glow-card rounded-2xl p-5">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color:"var(--muted)" }}>Current plan</p>
            <div className="flex items-center gap-3">
              <div className="px-4 py-2 rounded-xl text-sm font-bold" style={{ background: `${PLANS[workspace?.plan ?? "starter"].color}15`, color: PLANS[workspace?.plan ?? "starter"].color }}>
                {PLANS[workspace?.plan ?? "starter"].name}
              </div>
              <span className="text-sm" style={{ color:"var(--text)" }}>{PLANS[workspace?.plan ?? "starter"].description}</span>
            </div>
            <button onClick={() => setTab("billing")} className="mt-3 text-xs font-semibold" style={{ color:"var(--primary)" }}>
              View plans & upgrade →
            </button>
          </div>

          {/* Theme */}
          <div className="glow-card rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color:"var(--text)" }}>Interface theme</p>
              <p className="text-xs" style={{ color:"var(--muted)" }}>{isDark ? "Dark mode active" : "Light mode active"}</p>
            </div>
            <button onClick={toggle}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all"
              style={{ borderColor:"var(--border)", color:"var(--text)" }}>
              {isDark ? <Sun size={14}/> : <Moon size={14}/>}
              Switch to {isDark ? "light" : "dark"}
            </button>
          </div>
        </div>
      )}

      {/* ── CONNECTIONS TAB ─────────────────────────────────────────────────── */}
      {tab === "connections" && (
        <div className="space-y-4">
          {oauthMsg   && <div className="flex gap-2 text-sm rounded-xl px-4 py-3" style={{ background:"var(--success-bg)", color:"var(--success)" }}><CheckCircle2 size={15} className="shrink-0 mt-0.5"/>{oauthMsg}</div>}
          {oauthError && <div className="flex gap-2 text-sm rounded-xl px-4 py-3" style={{ background:"var(--danger-bg)", color:"var(--danger)" }}><AlertCircle size={15} className="shrink-0 mt-0.5"/>{oauthError}</div>}

          <div className="glow-card rounded-2xl p-4">
            <p className="text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>OAuth redirect URI — add this in each platform's developer portal</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs" style={{ background:"var(--surface)", border:"1px solid var(--border)" }}>
              <span className="flex-1 truncate" style={{ color:"var(--text)" }}>{REDIRECT_URI}</span>
              <button onClick={() => navigator.clipboard.writeText(REDIRECT_URI)}
                className="text-xs px-2 py-0.5 rounded-lg font-sans" style={{ background:"var(--primary-soft)", color:"var(--primary)" }}>
                Copy
              </button>
            </div>
          </div>

          {OAUTH_GROUPS.map(group => {
            const connected = isConnected(group);
            const name      = getAccountName(group);
            const pic       = getAccountPic(group);
            const expanded  = expandedGroup === group.key;
            return (
              <div key={group.key} className="glow-card rounded-2xl overflow-hidden">
                <div className="p-5 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    {pic ? (
                      <img src={pic} alt="" className="w-10 h-10 rounded-xl object-cover avatar-ring" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl border" style={{ background:`${group.color}12`, borderColor:`${group.color}20` }}>
                        {group.emoji}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold" style={{ color:"var(--text)" }}>{group.label}</p>
                      <div className="mt-0.5">
                        {connected
                          ? <span className="pill pill-success"><Wifi size={9}/> Connected{name ? ` · ${name}` : ""}</span>
                          : <span className="pill pill-neutral"><WifiOff size={9}/> Not connected</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {connected
                      ? <button onClick={() => handleDisconnect(group)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border transition-all" style={{ borderColor:"var(--danger)", color:"var(--danger)", background:"var(--danger-bg)" }}><LogOut size={12}/>Disconnect</button>
                      : <button onClick={() => handleConnect(group)} className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-semibold text-white gradient-primary hover:opacity-90 transition-all"><ExternalLink size={12}/>Connect</button>
                    }
                    <button onClick={() => setExpandedGroup(expanded ? null : group.key)} className="p-2 rounded-xl border transition-all" style={{ borderColor:"var(--border)", color:"var(--muted)" }}>
                      {expanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                    </button>
                  </div>
                </div>
                {expanded && (
                  <div className="px-5 pb-5 border-t" style={{ borderColor:"var(--border)" }}>
                    <p className="text-xs font-semibold mb-2 mt-4" style={{ color:"var(--muted)" }}>Setup guide</p>
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap rounded-xl p-3" style={{ background:"var(--surface)", color:"var(--text-soft)" }}>{group.guide}</pre>
                    <p className="text-xs mt-3 mb-1" style={{ color:"var(--muted)" }}>Required env vars in Netlify:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {group.envVars.map(v => <code key={v} className="text-xs px-2 py-1 rounded-lg" style={{ background:"var(--surface)", color:"var(--primary)" }}>{v}</code>)}
                    </div>
                    <a href={group.setupUrl} target="_blank" rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color:"var(--primary)" }}>
                      Open {group.label} developer portal <ExternalLink size={11}/>
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TEAM TAB ────────────────────────────────────────────────────────── */}
      {tab === "team" && (
        <div className="space-y-4">
          {!canUse("maxTeamMembers") ? (
            <div className="glow-card rounded-2xl p-8 text-center">
              <Users size={28} className="mx-auto mb-3" style={{ color:"var(--muted)" }}/>
              <h3 className="font-display text-base font-semibold mb-2" style={{ color:"var(--text)" }}>Team access is a Pro feature</h3>
              <p className="text-sm mb-4" style={{ color:"var(--muted)" }}>Upgrade to Pro to invite up to 5 team members, or Agency for unlimited.</p>
              <button onClick={() => setTab("billing")} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all">
                <Zap size={13} className="inline mr-1"/> View plans
              </button>
            </div>
          ) : (
            <>
              {/* Invite form */}
              {isAdmin && (
                <div className="glow-card rounded-2xl p-5 space-y-3">
                  <h2 className="font-display text-base font-semibold" style={{ color:"var(--text)" }}>Invite team member</h2>
                  <div className="flex gap-2 flex-wrap">
                    <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@email.com" type="email"
                      className="flex-1 text-sm rounded-xl px-3 py-2.5 border outline-none min-w-0"
                      style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
                    <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                      className="text-sm rounded-xl px-3 py-2.5 border outline-none cursor-pointer"
                      style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      {canUse("clientViewer") && <option value="viewer">Client viewer</option>}
                    </select>
                    <button onClick={inviteMember} disabled={inviting || !inviteEmail}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all">
                      {inviting ? "Inviting…" : <><Send size={13}/> Invite</>}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color:"var(--muted)" }}>
                    Team seats: {limits.maxTeamMembers === -1 ? "Unlimited" : `${members.filter(m => m.status === "active" && m.uid !== workspace?.owner_uid).length} / ${limits.maxTeamMembers}`}
                  </p>
                </div>
              )}

              {/* Members list */}
              <div className="glow-card rounded-2xl overflow-hidden">
                <div className="p-4 border-b" style={{ borderColor:"var(--border)" }}>
                  <h3 className="font-display text-sm font-semibold" style={{ color:"var(--text)" }}>
                    {members.length} member{members.length !== 1 ? "s" : ""}
                  </h3>
                </div>
                <div className="divide-y" style={{ borderColor:"var(--border)" }}>
                  {members.map(m => (
                    <div key={m.id} className="p-4 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 gradient-primary">
                        {(m.invited_email || m.uid || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color:"var(--text)" }}>
                          {m.invited_email || m.uid || "Unknown"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="pill" style={{ background:`${ROLE_COLORS[m.role]}15`, color:ROLE_COLORS[m.role] }}>
                            {ROLE_ICONS[m.role]} {m.role}
                          </span>
                          {m.status === "pending" && <span className="pill pill-warning">pending invite</span>}
                        </div>
                      </div>
                      {isOwner && m.uid !== user.uid && (
                        <button onClick={() => removeMember(m.id)} className="p-1.5 rounded-lg transition-all" style={{ color:"var(--muted)" }}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PLAN & BILLING TAB ──────────────────────────────────────────────── */}
      {tab === "billing" && (
        <div className="space-y-6" id="billing-section">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["starter","pro","agency"] as PlanId[]).map(planId => {
              const plan = PLANS[planId];
              const isCurrent = workspace?.plan === planId;
              return (
                <div key={planId}
                  className="glow-card rounded-2xl overflow-hidden flex flex-col"
                  style={isCurrent ? { border:`2px solid ${plan.color}`, boxShadow:`var(--shadow-glow)` } : {}}>
                  {plan.badge && (
                    <div className="text-center py-1.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: plan.color }}>
                      {plan.badge}
                    </div>
                  )}
                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-display text-base font-bold" style={{ color:"var(--text)" }}>{plan.name}</h3>
                      {isCurrent && <span className="pill pill-success text-[10px]">Current</span>}
                    </div>
                    <div className="mb-2">
                      <span className="text-2xl font-mono font-bold" style={{ color: plan.color }}>
                        {plan.price === 0 ? "Free" : `$${plan.price}`}
                      </span>
                      {plan.price > 0 && <span className="text-xs ml-1" style={{ color:"var(--muted)" }}>/month</span>}
                    </div>
                    <p className="text-xs mb-4 leading-relaxed" style={{ color:"var(--muted)" }}>{plan.description}</p>

                    <ul className="space-y-1.5 flex-1 mb-5">
                      {PLAN_FEATURES.map(feat => {
                        const val = formatLimit(feat.key, plan[feat.key]);
                        const enabled = plan[feat.key] !== false && plan[feat.key] !== 0;
                        return (
                          <li key={feat.key} className="flex items-center gap-2 text-xs" style={{ color: enabled ? "var(--text)" : "var(--muted)", opacity: enabled ? 1 : 0.5 }}>
                            <Check size={11} style={{ color: enabled ? "var(--success)" : "var(--border)" }}/>
                            <span>{feat.label}</span>
                            <span className="ml-auto font-mono font-semibold" style={{ color: plan.color }}>{val}</span>
                          </li>
                        );
                      })}
                    </ul>

                    {isCurrent ? (
                      <div className="text-center text-sm font-medium py-2 rounded-xl" style={{ background:"var(--surface)", color:"var(--muted)" }}>
                        Active plan
                      </div>
                    ) : (
                      <button
                        onClick={() => setUpgradeModalPlan(planId)}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                        style={{ background: plan.color }}>
                        {workspace?.plan === "starter" || planId === "agency" ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Payment coming soon notice */}
          <div className="glow-card rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl shrink-0" style={{ background:"var(--warning-bg)" }}>
                <CreditCard size={18} style={{ color:"var(--warning)" }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1" style={{ color:"var(--text)" }}>Billing coming soon — Paystack &amp; Flutterwave</p>
                <p className="text-xs leading-relaxed mb-3" style={{ color:"var(--muted)" }}>
                  We're integrating Paystack and Flutterwave for seamless local and international payments.
                  Enter your email to be notified the moment billing goes live so you can upgrade instantly.
                </p>
                {!notifySubmitted ? (
                  <div className="flex gap-2">
                    <input value={billingEmail} onChange={e => setBillingEmail(e.target.value)}
                      placeholder="your@email.com" type="email"
                      className="flex-1 text-sm rounded-xl px-3 py-2 border outline-none"
                      style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
                    <button onClick={handleBillingNotify} disabled={!billingEmail}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all">
                      Notify me
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm" style={{ color:"var(--success)" }}>
                    <CheckCircle2 size={14}/> You're on the list — we'll notify you at {billingEmail}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade modal */}
      {upgradeModalPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-2xl" style={{ background:"var(--card)", border:"1px solid var(--border)" }}>
            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4">
              <Zap size={20} className="text-white"/>
            </div>
            <h3 className="font-display text-lg font-semibold text-center mb-2" style={{ color:"var(--text)" }}>
              Upgrade to {PLANS[upgradeModalPlan].name}
            </h3>
            <p className="text-sm text-center mb-4" style={{ color:"var(--muted)" }}>
              Billing via Paystack and Flutterwave is coming soon. Enter your email and we'll notify you the moment you can upgrade.
            </p>
            {!notifySubmitted ? (
              <div className="space-y-2">
                <input value={billingEmail} onChange={e => setBillingEmail(e.target.value)}
                  placeholder="your@email.com" type="email"
                  className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none"
                  style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
                <button onClick={handleBillingNotify} disabled={!billingEmail}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all">
                  Notify me when billing is live
                </button>
              </div>
            ) : (
              <div className="text-center py-2" style={{ color:"var(--success)" }}>
                <CheckCircle2 size={18} className="inline mr-1"/> You're on the list!
              </div>
            )}
            <button onClick={() => setUpgradeModalPlan(null)} className="w-full mt-3 text-sm py-1" style={{ color:"var(--muted)" }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}