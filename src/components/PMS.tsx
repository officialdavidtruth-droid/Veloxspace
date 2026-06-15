import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { LoadingInline } from "./LoadingScreen";
import type { AppUser } from "../lib/supabase";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  Plus, Building2, Phone, Globe, Mail, DollarSign, Briefcase,
  FileText, TrendingUp, AlertCircle, CheckCircle2, Clock,
  Trash2, Edit2, X, ChevronRight, BarChart3, Target, Users,
} from "lucide-react";

type ClientStatus = "active" | "paused" | "churned" | "prospect";
type ProjectStatus = "planning" | "active" | "review" | "completed" | "cancelled";
type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type Tab = "overview" | "clients" | "projects" | "invoices";

interface PMSClient {
  id: string; workspace_id: string; business_name: string; contact_name: string;
  email: string; phone: string; website: string; industry: string;
  status: ClientStatus; monthly_retainer: number; currency: string;
  contract_start: string | null; contract_end: string | null; notes: string; created_at: string;
}
interface PMSProject {
  id: string; workspace_id: string; client_id: string; name: string;
  status: ProjectStatus; type: string; budget: number; spent: number;
  currency: string; start_date: string | null; end_date: string | null; notes: string;
}
interface PMSInvoice {
  id: string; workspace_id: string; client_id: string; invoice_number: string;
  amount: number; currency: string; status: InvoiceStatus;
  due_date: string | null; paid_at: string | null; description: string; created_at: string;
}

function fmtMoney(n: number, cur = "USD") {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}
function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  active:    { bg: "var(--success-bg)", color: "var(--success)" },
  paid:      { bg: "var(--success-bg)", color: "var(--success)" },
  completed: { bg: "var(--success-bg)", color: "var(--success)" },
  paused:    { bg: "var(--warning-bg)", color: "var(--warning)" },
  sent:      { bg: "var(--warning-bg)", color: "var(--warning)" },
  review:    { bg: "var(--warning-bg)", color: "var(--warning)" },
  planning:  { bg: "var(--info-bg)",    color: "var(--info)"    },
  draft:     { bg: "var(--card-alt)",   color: "var(--muted)"   },
  churned:   { bg: "var(--danger-bg)",  color: "var(--danger)"  },
  overdue:   { bg: "var(--danger-bg)",  color: "var(--danger)"  },
  cancelled: { bg: "var(--danger-bg)",  color: "var(--danger)"  },
  prospect:  { bg: "var(--primary-l)",  color: "var(--primary)" },
};

const PROJECT_TYPES = ["social","ads","seo","website","content","email","branding","other"];
const INDUSTRIES    = ["Retail","Restaurant & Food","Healthcare","Real Estate","Legal","Finance","Beauty & Wellness","Automotive","Education","Technology","Construction","Other"];

export function PMS({ user }: { user: AppUser }) {
  const { workspace } = useWorkspace();
  const [tab, setTab]             = useState<Tab>("overview");
  const [clients,   setClients]   = useState<PMSClient[]>([]);
  const [projects,  setProjects]  = useState<PMSProject[]>([]);
  const [invoices,  setInvoices]  = useState<PMSInvoice[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<null | "client" | "project" | "invoice">(null);
  const [editing,   setEditing]   = useState<PMSClient | PMSProject | PMSInvoice | null>(null);
  const [form,      setForm]      = useState<Record<string, any>>({});

  useEffect(() => { if (workspace?.id) load(); }, [workspace?.id]);

  const load = async () => {
    const wid = workspace?.id;
    const [cR, pR, iR] = await Promise.all([
      supabase.from("pms_clients").select("*").eq("workspace_id", wid).order("created_at", { ascending: false }),
      supabase.from("pms_projects").select("*").eq("workspace_id", wid).order("created_at", { ascending: false }),
      supabase.from("pms_invoices").select("*").eq("workspace_id", wid).order("created_at", { ascending: false }),
    ]);
    setClients((cR.data as PMSClient[]) ?? []);
    setProjects((pR.data as PMSProject[]) ?? []);
    setInvoices((iR.data as PMSInvoice[]) ?? []);
    setLoading(false);
  };

  // ── Computed metrics ────────────────────────────────────────────────────
  const activeClients   = clients.filter(c => c.status === "active");
  const mrr             = activeClients.reduce((s, c) => s + (c.monthly_retainer ?? 0), 0);
  const outstanding     = invoices.filter(i => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const overdueCount    = invoices.filter(i => i.status === "overdue" || (i.status === "sent" && isOverdue(i.due_date))).length;
  const activeProjects  = projects.filter(p => p.status === "active");
  const totalPaid       = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  const renewalsSoon = clients.filter(c => {
    const days = daysUntil(c.contract_end);
    return days !== null && days >= 0 && days <= 30;
  });

  const clientMap = useMemo(() => Object.fromEntries(clients.map(c => [c.id, c])), [clients]);

  // ── Revenue chart (monthly from paid invoices) ───────────────────────────
  const revenueChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices) {
      if (inv.status !== "paid" || !inv.paid_at) continue;
      const key = new Date(inv.paid_at).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
      map.set(key, (map.get(key) ?? 0) + inv.amount);
    }
    return Array.from(map.entries()).slice(-6).map(([month, revenue]) => ({ month, revenue }));
  }, [invoices]);

  // ── Save helpers ─────────────────────────────────────────────────────────
  const saveClient = async () => {
    const payload = { ...form, workspace_id: workspace?.id, uid: user.uid, updated_at: new Date().toISOString() };
    if (editing) await supabase.from("pms_clients").update(payload).eq("id", (editing as PMSClient).id);
    else await supabase.from("pms_clients").insert({ ...payload, created_at: new Date().toISOString() });
    setModal(null); setForm({}); setEditing(null); await load();
  };
  const saveProject = async () => {
    const payload = { ...form, workspace_id: workspace?.id, uid: user.uid };
    if (editing) await supabase.from("pms_projects").update(payload).eq("id", (editing as PMSProject).id);
    else await supabase.from("pms_projects").insert({ ...payload, created_at: new Date().toISOString() });
    setModal(null); setForm({}); setEditing(null); await load();
  };
  const saveInvoice = async () => {
    const payload = { ...form, workspace_id: workspace?.id, uid: user.uid };
    if (!payload.invoice_number) {
      const count = invoices.length + 1;
      payload.invoice_number = `INV-${String(count).padStart(3, "0")}`;
    }
    if (editing) await supabase.from("pms_invoices").update(payload).eq("id", (editing as PMSInvoice).id);
    else await supabase.from("pms_invoices").insert({ ...payload, created_at: new Date().toISOString() });
    setModal(null); setForm({}); setEditing(null); await load();
  };
  const markPaid = async (inv: PMSInvoice) => {
    await supabase.from("pms_invoices").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", inv.id);
    await load();
  };
  const deleteRow = async (table: string, id: string) => {
    await supabase.from(table).delete().eq("id", id); await load();
  };
  const openEdit = (type: "client"|"project"|"invoice", row: any) => {
    setEditing(row); setForm({ ...row }); setModal(type);
  };

  const F = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <LoadingInline label="Loading business management…" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1" style={{ color:"var(--text)" }}>Business Management</h1>
          <p className="text-sm" style={{ color:"var(--muted)" }}>Clients · Projects · Invoices · Revenue — all in one place</p>
        </div>
        <div className="flex gap-2">
          {tab === "clients"  && <button onClick={() => { setEditing(null); setForm({ status:"active", currency:"USD", monthly_retainer:0 }); setModal("client");  }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all"><Plus size={13}/>Add client</button>}
          {tab === "projects" && <button onClick={() => { setEditing(null); setForm({ status:"planning", currency:"USD", budget:0, spent:0 }); setModal("project"); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all"><Plus size={13}/>Add project</button>}
          {tab === "invoices" && <button onClick={() => { setEditing(null); setForm({ status:"draft", currency:"USD", amount:0 }); setModal("invoice"); }} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all"><Plus size={13}/>New invoice</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background:"var(--surface)" }}>
        {([["overview","Overview",<BarChart3 size={13}/>],["clients","Clients",<Users size={13}/>],["projects","Projects",<Briefcase size={13}/>],["invoices","Invoices",<FileText size={13}/>]] as const).map(([id, label, icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-lg transition-all"
            style={tab === id ? { background:"var(--card)", color:"var(--text)", boxShadow:"var(--shadow-sm)" } : { color:"var(--muted)" }}>
            {icon} <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label:"Active Clients",      value:String(activeClients.length), Icon:Users,      color:"var(--primary)" },
              { label:"Monthly Revenue",     value:fmtMoney(mrr),                Icon:DollarSign, color:"var(--success)" },
              { label:"Outstanding Invoices",value:fmtMoney(outstanding),        Icon:Clock,      color:overdueCount?"var(--danger)":"var(--warning)" },
              { label:"Active Projects",     value:String(activeProjects.length),Icon:Briefcase,  color:"#9333ea" },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="glow-card rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide" style={{ color:"var(--muted)" }}>{label}</p>
                  <div className="p-2 rounded-xl" style={{ background:`${color}15`, color }}><Icon size={14}/></div>
                </div>
                <p className="text-2xl font-mono font-semibold tabular-nums" style={{ color:"var(--text)" }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Renewal alerts */}
          {renewalsSoon.length > 0 && (
            <div className="glow-card rounded-2xl p-4 border" style={{ borderColor:"var(--warning)", background:"var(--warning-bg)" }}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={15} style={{ color:"var(--warning)" }}/>
                <p className="text-sm font-semibold" style={{ color:"var(--warning)" }}>Contract renewals due soon</p>
              </div>
              <div className="space-y-1">
                {renewalsSoon.map(c => (
                  <p key={c.id} className="text-xs" style={{ color:"var(--text)" }}>
                    <strong>{c.business_name}</strong> — expires {new Date(c.contract_end!).toLocaleDateString()} ({daysUntil(c.contract_end)} days)
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Revenue chart */}
          <div className="glow-card rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold" style={{ color:"var(--text)" }}>Revenue collected</h3>
              <span className="text-sm font-mono font-semibold" style={{ color:"var(--success)" }}>Total: {fmtMoney(totalPaid)}</span>
            </div>
            {revenueChart.length > 0 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenueChart} margin={{ top:5, right:10, left:-20, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" stroke="var(--muted)" fontSize={11} />
                    <YAxis stroke="var(--muted)" fontSize={11} tickFormatter={(v) => fmtMoney(v)} />
                    <Tooltip contentStyle={{ background:"var(--card)", border:"1px solid var(--border)", borderRadius:"10px", fontSize:"12px" }} formatter={(v: any) => fmtMoney(v)} />
                    <Bar dataKey="revenue" fill="var(--success)" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm py-8 text-center" style={{ color:"var(--muted)" }}>Mark invoices as paid to see your revenue chart</p>}
          </div>

          {/* Client health table */}
          {clients.length > 0 && (
            <div className="glow-card rounded-2xl overflow-hidden">
              <div className="p-4 border-b" style={{ borderColor:"var(--border)" }}>
                <h3 className="font-display text-sm font-semibold" style={{ color:"var(--text)" }}>Client health</h3>
              </div>
              <div className="divide-y" style={{ borderColor:"var(--border)" }}>
                {clients.slice(0, 8).map(c => {
                  const clientInvoices = invoices.filter(i => i.client_id === c.id);
                  const hasOverdue = clientInvoices.some(i => i.status === "overdue" || (i.status === "sent" && isOverdue(i.due_date)));
                  const health = c.status === "churned" ? "danger" : hasOverdue ? "warning" : c.status === "active" ? "success" : "muted";
                  const CLIENT_PROJECTS = projects.filter(p => p.client_id === c.id && p.status === "active");
                  return (
                    <div key={c.id} className="p-4 flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background:`var(--${health})` }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color:"var(--text)" }}>{c.business_name}</p>
                        <p className="text-xs" style={{ color:"var(--muted)" }}>{CLIENT_PROJECTS.length} active project{CLIENT_PROJECTS.length !== 1 ? "s" : ""}{c.monthly_retainer > 0 ? ` · ${fmtMoney(c.monthly_retainer)}/mo` : ""}</p>
                      </div>
                      <span className="pill shrink-0" style={STATUS_PILL[c.status] ?? STATUS_PILL.draft}>
                        {c.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CLIENTS ──────────────────────────────────────────────────────── */}
      {tab === "clients" && (
        <div className="space-y-3">
          {clients.length === 0 ? (
            <div className="glow-card rounded-2xl p-10 text-center">
              <Building2 size={28} className="mx-auto mb-3" style={{ color:"var(--muted)" }}/>
              <p className="text-sm font-semibold mb-1" style={{ color:"var(--text)" }}>No clients yet</p>
              <p className="text-xs mb-4" style={{ color:"var(--muted)" }}>Add your first client or convert a lead from the Lead Finder</p>
            </div>
          ) : clients.map(c => {
            const cProjects = projects.filter(p => p.client_id === c.id);
            const cInvoices = invoices.filter(i => i.client_id === c.id);
            const hasOverdue = cInvoices.some(i => i.status === "overdue" || (i.status === "sent" && isOverdue(i.due_date)));
            return (
              <div key={c.id} className="glow-card rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-display text-base font-semibold" style={{ color:"var(--text)" }}>{c.business_name}</h3>
                      <span className="pill" style={STATUS_PILL[c.status] ?? STATUS_PILL.draft}>{c.status}</span>
                      {hasOverdue && <span className="pill pill-danger">invoice overdue</span>}
                    </div>
                    <p className="text-xs" style={{ color:"var(--muted)" }}>{c.contact_name}{c.industry ? ` · ${c.industry}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => openEdit("client", c)} className="p-1.5 rounded-lg transition-all hover:opacity-70" style={{ color:"var(--muted)" }}><Edit2 size={13}/></button>
                    <button onClick={() => deleteRow("pms_clients", c.id)} className="p-1.5 rounded-lg transition-all hover:opacity-70" style={{ color:"var(--danger)" }}><Trash2 size={13}/></button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs mb-3" style={{ color:"var(--muted)" }}>
                  {c.email   && <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:opacity-80"><Mail size={11}/>{c.email}</a>}
                  {c.phone   && <span className="flex items-center gap-1"><Phone size={11}/>{c.phone}</span>}
                  {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:opacity-80"><Globe size={11}/>{c.website.replace(/https?:\/\//,"")}</a>}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span style={{ color:"var(--text)" }}>
                    <span style={{ color:"var(--muted)" }}>MRR:</span> <strong>{fmtMoney(c.monthly_retainer)}</strong>
                  </span>
                  <span style={{ color:"var(--text)" }}>
                    <span style={{ color:"var(--muted)" }}>Projects:</span> <strong>{cProjects.length}</strong>
                  </span>
                  {c.contract_end && (
                    <span style={{ color: daysUntil(c.contract_end)! < 30 ? "var(--warning)" : "var(--muted)" }}>
                      Contract ends: {new Date(c.contract_end).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── PROJECTS ─────────────────────────────────────────────────────── */}
      {tab === "projects" && (
        <div className="space-y-4">
          {(["planning","active","review","completed"] as ProjectStatus[]).map(status => {
            const statusProjects = projects.filter(p => p.status === status);
            if (!statusProjects.length && status === "completed") return null;
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="pill" style={STATUS_PILL[status] ?? STATUS_PILL.draft}>{status}</span>
                  <span className="text-xs" style={{ color:"var(--muted)" }}>{statusProjects.length} project{statusProjects.length !== 1 ? "s":""}</span>
                </div>
                {statusProjects.length === 0 ? (
                  <div className="rounded-xl p-4 border border-dashed text-center text-xs" style={{ borderColor:"var(--border)", color:"var(--muted)" }}>No {status} projects</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {statusProjects.map(p => {
                      const client = clientMap[p.client_id];
                      const utilPct = p.budget > 0 ? Math.min((p.spent / p.budget) * 100, 100) : 0;
                      return (
                        <div key={p.id} className="glow-card rounded-xl p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color:"var(--text)" }}>{p.name}</p>
                              <p className="text-xs" style={{ color:"var(--muted)" }}>{client?.business_name ?? "—"}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => openEdit("project", p)} className="p-1 rounded-lg hover:opacity-70" style={{ color:"var(--muted)" }}><Edit2 size={12}/></button>
                              <button onClick={() => deleteRow("pms_projects", p.id)} className="p-1 rounded-lg hover:opacity-70" style={{ color:"var(--danger)" }}><Trash2 size={12}/></button>
                            </div>
                          </div>
                          {p.type && <span className="pill pill-neutral text-[10px] mb-2">{p.type}</span>}
                          {p.budget > 0 && (
                            <div className="mt-2">
                              <div className="flex justify-between text-[10px] mb-1" style={{ color:"var(--muted)" }}>
                                <span>Budget utilisation</span>
                                <span>{fmtMoney(p.spent)} / {fmtMoney(p.budget)}</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background:"var(--surface)" }}>
                                <div className="h-full rounded-full" style={{ width:`${utilPct}%`, background: utilPct > 90 ? "var(--danger)" : utilPct > 70 ? "var(--warning)" : "var(--success)" }}/>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="glow-card rounded-2xl p-10 text-center">
              <Briefcase size={28} className="mx-auto mb-3" style={{ color:"var(--muted)" }}/>
              <p className="text-sm font-semibold mb-1" style={{ color:"var(--text)" }}>No projects yet</p>
              <p className="text-xs" style={{ color:"var(--muted)" }}>Add a project to start tracking campaigns and deliverables</p>
            </div>
          )}
        </div>
      )}

      {/* ── INVOICES ─────────────────────────────────────────────────────── */}
      {tab === "invoices" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label:"Total Paid",       value:fmtMoney(totalPaid),    color:"var(--success)" },
              { label:"Outstanding",      value:fmtMoney(outstanding),  color:"var(--warning)" },
              { label:"Overdue Invoices", value:String(overdueCount),   color: overdueCount ? "var(--danger)" : "var(--muted)" },
            ].map(({ label, value, color }) => (
              <div key={label} className="glow-card rounded-xl p-4 text-center">
                <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color:"var(--muted)" }}>{label}</p>
                <p className="text-xl font-mono font-semibold" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>

          {invoices.length === 0 ? (
            <div className="glow-card rounded-2xl p-10 text-center">
              <FileText size={28} className="mx-auto mb-3" style={{ color:"var(--muted)" }}/>
              <p className="text-sm font-semibold mb-1" style={{ color:"var(--text)" }}>No invoices yet</p>
              <p className="text-xs" style={{ color:"var(--muted)" }}>Create your first invoice to start tracking payments</p>
            </div>
          ) : (
            <div className="glow-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Invoice","Client","Amount","Status","Due Date",""].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color:"var(--muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor:"var(--border)" }}>
                    {invoices.map(inv => {
                      const client  = clientMap[inv.client_id];
                      const overdue = inv.status === "sent" && isOverdue(inv.due_date);
                      const dispStatus = overdue ? "overdue" : inv.status;
                      return (
                        <tr key={inv.id}>
                          <td className="px-4 py-3 font-mono text-xs font-medium" style={{ color:"var(--text)" }}>{inv.invoice_number}</td>
                          <td className="px-4 py-3 truncate max-w-[140px]" style={{ color:"var(--text)" }}>{client?.business_name ?? "—"}</td>
                          <td className="px-4 py-3 font-mono font-semibold" style={{ color:"var(--text)" }}>{fmtMoney(inv.amount)}</td>
                          <td className="px-4 py-3">
                            <span className="pill" style={STATUS_PILL[dispStatus] ?? STATUS_PILL.draft}>{dispStatus}</span>
                          </td>
                          <td className="px-4 py-3 text-xs" style={{ color: overdue ? "var(--danger)" : "var(--muted)" }}>
                            {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {inv.status !== "paid" && inv.status !== "cancelled" && (
                                <button onClick={() => markPaid(inv)} className="text-[10px] px-2 py-1 rounded-lg" style={{ background:"var(--success-bg)", color:"var(--success)" }}>Mark paid</button>
                              )}
                              <button onClick={() => openEdit("invoice", inv)} className="p-1 rounded-lg hover:opacity-70" style={{ color:"var(--muted)" }}><Edit2 size={12}/></button>
                              <button onClick={() => deleteRow("pms_invoices", inv.id)} className="p-1 rounded-lg hover:opacity-70" style={{ color:"var(--danger)" }}><Trash2 size={12}/></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => { setModal(null); setForm({}); setEditing(null); }}>
          <div className="w-full max-w-lg rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]" style={{ background:"var(--card)", border:"1px solid var(--border)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor:"var(--border)" }}>
              <h3 className="font-display text-base font-semibold" style={{ color:"var(--text)" }}>
                {editing ? "Edit" : "Add"} {modal}
              </h3>
              <button onClick={() => { setModal(null); setForm({}); setEditing(null); }} className="p-1 rounded-lg" style={{ color:"var(--muted)" }}><X size={16}/></button>
            </div>
            <div className="p-5 space-y-3">

              {modal === "client" && <>
                {[["business_name","Business name *"],["contact_name","Contact person"],["email","Email"],["phone","Phone"],["website","Website URL"],["industry","Industry"],["notes","Notes"]].map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>{label}</label>
                    {k === "industry" ? (
                      <select value={form[k]??""} onChange={e=>F(k,e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                        <option value="">Select industry</option>
                        {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                      </select>
                    ) : k === "notes" ? (
                      <textarea value={form[k]??""} onChange={e=>F(k,e.target.value)} rows={2} className="w-full text-sm rounded-xl px-3 py-2 border outline-none resize-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
                    ) : (
                      <input value={form[k]??""} onChange={e=>F(k,e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
                    )}
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Monthly retainer ($)</label>
                    <input type="number" value={form.monthly_retainer??0} onChange={e=>F("monthly_retainer",parseFloat(e.target.value)||0)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none font-mono" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Status</label>
                    <select value={form.status??"active"} onChange={e=>F("status",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                      {["prospect","active","paused","churned"].map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Contract start</label><input type="date" value={form.contract_start??""} onChange={e=>F("contract_start",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Contract end</label><input type="date" value={form.contract_end??""} onChange={e=>F("contract_end",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                </div>
              </>}

              {modal === "project" && <>
                <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Project name *</label><input value={form.name??""} onChange={e=>F("name",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Client *</label>
                  <select value={form.client_id??""} onChange={e=>F("client_id",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                    <option value="">Select client</option>
                    {clients.map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Type</label><select value={form.type??""} onChange={e=>F("type",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}><option value="">Select type</option>{PROJECT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Status</label><select value={form.status??"planning"} onChange={e=>F("status",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}><option value="planning">Planning</option><option value="active">Active</option><option value="review">Review</option><option value="completed">Completed</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Budget ($)</label><input type="number" value={form.budget??0} onChange={e=>F("budget",parseFloat(e.target.value)||0)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none font-mono" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Spent ($)</label><input type="number" value={form.spent??0} onChange={e=>F("spent",parseFloat(e.target.value)||0)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none font-mono" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Start date</label><input type="date" value={form.start_date??""} onChange={e=>F("start_date",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>End date</label><input type="date" value={form.end_date??""} onChange={e=>F("end_date",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                </div>
                <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Notes</label><textarea value={form.notes??""} onChange={e=>F("notes",e.target.value)} rows={2} className="w-full text-sm rounded-xl px-3 py-2 border outline-none resize-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
              </>}

              {modal === "invoice" && <>
                <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Client *</label>
                  <select value={form.client_id??""} onChange={e=>F("client_id",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                    <option value="">Select client</option>
                    {clients.map(c=><option key={c.id} value={c.id}>{c.business_name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Amount ($) *</label><input type="number" value={form.amount??0} onChange={e=>F("amount",parseFloat(e.target.value)||0)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none font-mono" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                  <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Status</label><select value={form.status??"draft"} onChange={e=>F("status",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}><option value="draft">Draft</option><option value="sent">Sent</option><option value="paid">Paid</option><option value="overdue">Overdue</option></select></div>
                </div>
                <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Due date</label><input type="date" value={form.due_date??""} onChange={e=>F("due_date",e.target.value)} className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
                <div><label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Description</label><textarea value={form.description??""} onChange={e=>F("description",e.target.value)} rows={2} className="w-full text-sm rounded-xl px-3 py-2 border outline-none resize-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/></div>
              </>}

              <div className="flex gap-2 pt-2">
                <button onClick={() => { setModal(null); setForm({}); setEditing(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-medium border" style={{ borderColor:"var(--border)", color:"var(--muted)" }}>Cancel</button>
                <button
                  onClick={modal === "client" ? saveClient : modal === "project" ? saveProject : saveInvoice}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all">
                  {editing ? "Save changes" : "Add"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}