import React, { useState } from "react";
import type { Page } from "../App";
import type { AppUser } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useWorkspace } from "../lib/workspace";
import { PLATFORMS } from "../lib/platforms";
import {
  LayoutDashboard, BarChart3, FileText, Settings, PenSquare, Target,
  Sun, Moon, LogOut, ChevronRight, Menu, X, ChevronDown, Plus,
  Building2, User, Search,
} from "lucide-react";
import { VeloxMark, VeloxWordmark } from "./VeloxLogo";

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", facebook: "👥", linkedin: "💼",
  twitter: "🐦", tiktok: "🎵", youtube: "▶️", google_ads: "📊",
};

interface Props {
  user: AppUser;
  page: Page;
  onNavigate: (p: Page) => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

export function Layout({ user, page, onNavigate, onSignOut, children }: Props) {
  const { isDark, toggle } = useTheme();
  const { workspace, workspaces, limits, switchWorkspace, canUse } = useWorkspace();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wsSwitcherOpen, setWsSwitcherOpen] = useState(false);

  const initials = user.name.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase();

  const PLAN_COLOR: Record<string, string> = {
    starter: "var(--muted)", pro: "var(--primary)", agency: "#9333ea",
  };

  const NavItem = ({
    id, label, icon, locked = false, lockedPlan = ""
  }: { id: Page; label: string; icon: React.ReactNode; locked?: boolean; lockedPlan?: string }) => {
    const active = page === id;
    return (
      <button
        onClick={() => { if (!locked) { onNavigate(id); setMobileOpen(false); } }}
        title={locked ? `Upgrade to ${lockedPlan} to unlock` : undefined}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left"
        style={active
          ? { background: "var(--primary)", color: "#fff", boxShadow: "var(--shadow-sm)" }
          : locked
            ? { color: "var(--border)", cursor: "not-allowed" }
            : { color: "var(--muted)" }}
        onMouseEnter={e => { if (!active && !locked) (e.currentTarget as HTMLElement).style.background = "var(--surface)"; }}
        onMouseLeave={e => { if (!active && !locked) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
        {icon}
        <span>{label}</span>
        {active && !locked && <ChevronRight size={14} className="ml-auto opacity-70" />}
        {locked && (
          <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
            {lockedPlan}
          </span>
        )}
      </button>
    );
  };

  const Sidebar = () => (
    <aside className="w-60 shrink-0 flex flex-col h-full border-r"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}>

      {/* Logo */}
      <div className="px-4 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <VeloxMark size={30} />
          <div>
            <div className="font-display font-semibold text-sm leading-none" style={{ color: "var(--text)" }}>
              <VeloxWordmark />
            </div>
            <div className="text-[9px] mt-0.5 uppercase tracking-widest font-medium" style={{ color: "var(--muted)" }}>
              Marketing OS
            </div>
          </div>
        </div>
        <button className="lg:hidden p-1" onClick={() => setMobileOpen(false)}>
          <X size={16} style={{ color: "var(--muted)" }} />
        </button>
      </div>

      {/* Workspace switcher */}
      {workspace && (
        <div className="px-3 pt-3 pb-1">
          <button
            onClick={() => setWsSwitcherOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--primary)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold text-white"
              style={{ background: PLAN_COLOR[workspace.plan] ?? "var(--primary)" }}>
              {workspace.type === "agency" ? <Building2 size={12}/> : <User size={12}/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{workspace.name}</p>
              <p className="text-[10px] capitalize" style={{ color: "var(--muted)" }}>
                {workspace.plan} · {workspace.type}
              </p>
            </div>
            <ChevronDown size={12} style={{ color: "var(--muted)" }} className={`shrink-0 transition-transform ${wsSwitcherOpen ? "rotate-180" : ""}`} />
          </button>

          {wsSwitcherOpen && (
            <div className="mt-1 rounded-xl overflow-hidden border shadow-lg" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
              {workspaces.map(ws => (
                <button key={ws.id}
                  onClick={() => { switchWorkspace(ws.id); setWsSwitcherOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-all hover:opacity-80"
                  style={ws.id === workspace.id ? { background: "var(--primary-soft)", color: "var(--primary)" } : { color: "var(--text)" }}>
                  {ws.type === "agency" ? <Building2 size={12}/> : <User size={12}/>}
                  <span className="truncate flex-1">{ws.name}</span>
                  <span className="text-[9px] uppercase font-bold" style={{ color: PLAN_COLOR[ws.plan] }}>{ws.plan}</span>
                </button>
              ))}
              {limits.multiWorkspace && (
                <button
                  onClick={() => { onNavigate("settings" as Page); setWsSwitcherOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs border-t transition-all"
                  style={{ borderColor: "var(--border)", color: "var(--primary)" }}>
                  <Plus size={11}/> New workspace
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
        <NavItem id="overview"  label="Overview"      icon={<LayoutDashboard size={15} />} />
        <NavItem id="ads"       label="Ads Analytics" icon={<Target size={15} />}
          locked={!canUse("adsAnalytics")} lockedPlan="Pro" />
        <NavItem id="composer"  label="Composer"      icon={<PenSquare size={15} />} />

        <div className="pt-3 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1" style={{ color: "var(--muted)" }}>
            Platforms
          </p>
          {PLATFORMS.map(p => (
            <NavItem key={p.id} id={p.id as Page} label={p.name}
              icon={<span className="text-sm">{PLATFORM_ICONS[p.id]}</span>} />
          ))}
        </div>

        <div className="pt-3 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1" style={{ color: "var(--muted)" }}>
            Agency
          </p>
          <NavItem id="pms"   label="Business Mgmt" icon={<Building2 size={15} />}
            locked={!canUse("pms")} lockedPlan="Agency" />
          <NavItem id="leads" label="Lead Finder"    icon={<Search size={15} />}
            locked={!canUse("leadScraper")} lockedPlan="Agency" />
        </div>

        <div className="pt-3 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1" style={{ color: "var(--muted)" }}>
            Tools
          </p>
          <NavItem id="analytics" label="Analytics" icon={<BarChart3 size={15} />} />
          <NavItem id="reports"   label="Reports"   icon={<FileText size={15} />}
            locked={!canUse("pdfReports")} lockedPlan="Pro" />
          <NavItem id="settings"  label="Settings"  icon={<Settings size={15} />} />
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t space-y-1.5" style={{ borderColor: "var(--border)" }}>
        <button onClick={toggle}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all"
          style={{ color: "var(--muted)" }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          <span>{isDark ? "Light mode" : "Dark mode"}</span>
        </button>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "var(--surface)" }}>
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 gradient-primary">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: "var(--text)" }}>{user.name}</p>
            <p className="text-[10px] truncate" style={{ color: "var(--muted)" }}>{user.email}</p>
          </div>
          <button onClick={onSignOut} title="Sign out"
            className="shrink-0 p-1 rounded-lg transition-all" style={{ color: "var(--muted)" }}>
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="h-full flex" style={{ background: "var(--bg)" }}>
      <div className="hidden lg:flex flex-col"><Sidebar /></div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="flex flex-col w-60"><Sidebar /></div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}>
          <button onClick={() => setMobileOpen(true)}><Menu size={20} style={{ color: "var(--text)" }} /></button>
          <span className="font-display font-semibold text-sm flex items-center gap-1.5" style={{ color: "var(--text)" }}>
            <VeloxMark size={20} /> <VeloxWordmark />
          </span>
          <button onClick={toggle}>
            {isDark ? <Sun size={18} style={{ color: "var(--muted)" }} /> : <Moon size={18} style={{ color: "var(--muted)" }} />}
          </button>
        </div>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}