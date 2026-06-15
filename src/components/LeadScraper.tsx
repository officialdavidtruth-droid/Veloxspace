import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useWorkspace } from "../lib/workspace";
import { LoadingInline } from "./LoadingScreen";
import type { AppUser } from "../lib/supabase";
import { Search, Globe, Phone, Star, MapPin, Zap, ChevronRight, Trash2, ArrowRight, CheckCircle2, XCircle, Filter, Download, Plus, AlertCircle, Loader2 } from "lucide-react";

interface Lead {
  id: string; workspace_id: string; business_name: string; contact_name: string;
  email: string; phone: string; website: string; address: string; category: string;
  location: string; rating: number; review_count: number; source: string;
  has_website: boolean; status: string;
  ai_score: number; ai_tier: string; ai_opportunities: string[];
  ai_reasoning: string; ai_pitch: string; notes: string;
  converted_client_id: string | null; created_at: string;
}

const TIER_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  hot:  { bg: "var(--danger-bg)",  color: "var(--danger)",  label: "🔥 Hot" },
  warm: { bg: "var(--warning-bg)", color: "var(--warning)", label: "🌡 Warm" },
  cold: { bg: "var(--info-bg)",    color: "var(--info)",    label: "❄️ Cold" },
};
const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  new:        { bg: "var(--primary-l)",  color: "var(--primary)" },
  contacted:  { bg: "var(--warning-bg)", color: "var(--warning)" },
  qualified:  { bg: "var(--info-bg)",    color: "var(--info)"    },
  converted:  { bg: "var(--success-bg)", color: "var(--success)" },
  rejected:   { bg: "var(--danger-bg)",  color: "var(--danger)"  },
};

const PIPELINE_COLS: { id: string; label: string }[] = [
  { id: "new",       label: "New"       },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "converted", label: "Converted" },
  { id: "rejected",  label: "Rejected"  },
];

const BUSINESS_TYPES = [
  "restaurant","salon","barbershop","dental clinic","law firm","real estate agency",
  "gym","hotel","pharmacy","auto repair","plumber","electrician","accountant",
  "school","church","boutique","supermarket","clinic","event hall","logistics company",
];

export function LeadScraper({ user }: { user: AppUser }) {
  const { workspace } = useWorkspace();
  const [leads,     setLeads]     = useState<Lead[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [query,     setQuery]     = useState("");
  const [location,  setLocation]  = useState("");
  const [radius,    setRadius]    = useState(10000);
  const [noWebsite, setNoWebsite] = useState(false);
  const [view,      setView]      = useState<"results"|"pipeline">("pipeline");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expanded,  setExpanded]  = useState<string | null>(null);
  const [converting, setConverting] = useState<string | null>(null);

  useEffect(() => { if (workspace?.id) load(); }, [workspace?.id]);

  const load = async () => {
    const { data } = await supabase.from("leads").select("*").eq("workspace_id", workspace?.id).order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  };

  const search = async () => {
    if (!query.trim() || !location.trim()) return;
    setSearching(true); setSearchErr(""); setView("results");
    try {
      const res = await fetch("/api/scrape-leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, workspace_id: workspace?.id, query: query.trim(), location: location.trim(), radius, no_website_only: noWebsite }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.total === 0) setSearchErr(data.message ?? "No new leads found — they may already be in your pipeline.");
      await load();
    } catch (e: any) { setSearchErr(e.message); }
    setSearching(false);
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("leads").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l));
  };

  const deleteLead = async (id: string) => {
    await supabase.from("leads").delete().eq("id", id);
    setLeads(ls => ls.filter(l => l.id !== id));
  };

  const convertToClient = async (lead: Lead) => {
    setConverting(lead.id);
    const { data } = await supabase.from("pms_clients").insert({
      workspace_id: workspace?.id, uid: user.uid,
      business_name: lead.business_name, contact_name: lead.contact_name,
      email: lead.email, phone: lead.phone, website: lead.website,
      industry: lead.category, status: "prospect", monthly_retainer: 0, currency: "USD",
      notes: `Converted from Lead Finder. AI Pitch: ${lead.ai_pitch}`,
      created_at: new Date().toISOString(),
    }).select().single();
    if (data) {
      await supabase.from("leads").update({ status: "converted", converted_client_id: data.id, updated_at: new Date().toISOString() }).eq("id", lead.id);
      await load();
    }
    setConverting(null);
  };

  const exportCSV = () => {
    const rows = [["Business","Category","Address","Phone","Website","Rating","Reviews","AI Score","Tier","Status","Opportunities","AI Reasoning"]];
    leads.forEach(l => rows.push([l.business_name, l.category, l.address, l.phone, l.website, String(l.rating), String(l.review_count), String(l.ai_score), l.ai_tier, l.status, (l.ai_opportunities ?? []).join("|"), l.ai_reasoning]));
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; a.download = "velox-leads.csv"; a.click();
  };

  const newLeads = leads.filter(l => l.source === "google_places" && l.status === "new").sort((a,b) => b.ai_score - a.ai_score);
  const filteredPipeline = useMemo(() =>
    leads.filter(l => statusFilter === "all" || l.status === statusFilter), [leads, statusFilter]);

  if (loading) return <LoadingInline label="Loading leads…" />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1" style={{ color:"var(--text)" }}>AI Lead Finder</h1>
          <p className="text-sm" style={{ color:"var(--muted)" }}>Find local businesses that need your marketing services — powered by Google Places + AI scoring</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color:"var(--muted)" }}>{leads.length} total leads</span>
          {leads.length > 0 && (
            <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border" style={{ borderColor:"var(--border)", color:"var(--muted)" }}>
              <Download size={12}/> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Search panel */}
      <div className="glow-card rounded-2xl p-5 space-y-4">
        <h2 className="font-display text-sm font-semibold flex items-center gap-2" style={{ color:"var(--text)" }}>
          <div className="p-1.5 rounded-lg" style={{ background:"var(--primary-soft)" }}><Search size={13} style={{ color:"var(--primary)" }}/></div>
          Search for potential clients
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color:"var(--muted)" }}>Business type / keyword</label>
            <div className="relative">
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
                placeholder="e.g. restaurant, dental clinic, law firm…"
                list="biz-types"
                className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none"
                style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
              <datalist id="biz-types">
                {BUSINESS_TYPES.map(t => <option key={t} value={t}/>)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color:"var(--muted)" }}>City / area</label>
            <input value={location} onChange={e => setLocation(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
              placeholder="e.g. Lagos Island, Abuja, Nairobi CBD…"
              className="w-full text-sm rounded-xl px-3 py-2.5 border outline-none"
              style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}/>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color:"var(--muted)" }}>Search radius</label>
            <select value={radius} onChange={e => setRadius(Number(e.target.value))} className="text-sm rounded-xl px-3 py-2 border outline-none" style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
              <option value={1000}>1 km</option>
              <option value={5000}>5 km</option>
              <option value={10000}>10 km</option>
              <option value={25000}>25 km</option>
              <option value={50000}>50 km</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-4">
            <input type="checkbox" checked={noWebsite} onChange={e => setNoWebsite(e.target.checked)} className="w-4 h-4 rounded" style={{ accentColor:"var(--primary)" }}/>
            <span className="text-xs font-medium" style={{ color:"var(--text)" }}>No website only <span style={{ color:"var(--muted)" }}>(hottest leads)</span></span>
          </label>
          <button onClick={search} disabled={searching || !query.trim() || !location.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all mt-4">
            {searching ? <><Loader2 size={13} className="animate-spin"/>Searching + scoring…</> : <><Search size={13}/>Find leads</>}
          </button>
        </div>

        <div className="p-3 rounded-xl text-xs" style={{ background:"var(--card-alt)", color:"var(--muted)" }}>
          <strong style={{ color:"var(--text)" }}>How it works:</strong> Searches Google Maps for local businesses → fetches their details (phone, website, rating) → Cloudflare AI scores each lead 1–10 based on their digital marketing needs and writes a personalized pitch. All new results are saved to your pipeline automatically.
          <br/>Requires: <code style={{ color:"var(--primary)" }}>GOOGLE_PLACES_API_KEY</code> in Netlify env vars. <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color:"var(--primary)" }}>Get free API key →</a>
        </div>

        {searchErr && (
          <div className="flex items-start gap-2 text-sm rounded-xl px-4 py-3" style={{ background:"var(--warning-bg)", color:"var(--warning)" }}>
            <AlertCircle size={15} className="shrink-0 mt-0.5"/> {searchErr}
          </div>
        )}
      </div>

      {/* View toggle */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background:"var(--surface)" }}>
        {(["results","pipeline"] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-all capitalize"
            style={view === v ? { background:"var(--card)", color:"var(--text)", boxShadow:"var(--shadow-sm)" } : { color:"var(--muted)" }}>
            {v === "results" ? <Zap size={11}/> : <Filter size={11}/>}
            {v === "results" ? `New leads (${newLeads.length})` : `Pipeline (${leads.length})`}
          </button>
        ))}
      </div>

      {/* ── NEW RESULTS VIEW ─────────────────────────────────────────────── */}
      {view === "results" && (
        <div>
          {newLeads.length === 0 ? (
            <div className="glow-card rounded-2xl p-10 text-center">
              <Search size={28} className="mx-auto mb-3" style={{ color:"var(--muted)" }}/>
              <p className="text-sm font-semibold mb-1" style={{ color:"var(--text)" }}>No new leads yet</p>
              <p className="text-xs" style={{ color:"var(--muted)" }}>Run a search above to find potential clients in your target area</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {newLeads.map(lead => {
                const tier   = TIER_STYLE[lead.ai_tier] ?? TIER_STYLE.warm;
                const isOpen = expanded === lead.id;
                return (
                  <div key={lead.id} className="glow-card rounded-2xl overflow-hidden">
                    {/* Score bar */}
                    <div className="h-1.5" style={{ background: `linear-gradient(to right, ${tier.color} ${lead.ai_score * 10}%, var(--border) 0%)` }}/>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate" style={{ color:"var(--text)" }}>{lead.business_name}</p>
                          <p className="text-xs truncate" style={{ color:"var(--muted)" }}>{lead.category}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="pill text-xs font-bold" style={{ background: tier.bg, color: tier.color }}>{tier.label}</span>
                          <span className="pill pill-neutral text-xs font-mono">{lead.ai_score}/10</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3 text-xs" style={{ color:"var(--muted)" }}>
                        <span className="flex items-center gap-1"><MapPin size={10}/>{lead.address.split(",").slice(-2).join(",").trim()}</span>
                        {lead.rating > 0 && <span className="flex items-center gap-1"><Star size={10}/>{lead.rating} ({lead.review_count})</span>}
                        {lead.phone && <span className="flex items-center gap-1"><Phone size={10}/>{lead.phone}</span>}
                        {!lead.has_website && <span className="pill pill-danger text-[10px]">No website</span>}
                        {lead.website && <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:opacity-80" style={{ color:"var(--info)" }}><Globe size={10}/>website</a>}
                      </div>

                      {/* Opportunity tags */}
                      {(lead.ai_opportunities ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {lead.ai_opportunities.map(op => (
                            <span key={op} className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background:"var(--primary-soft)", color:"var(--primary)" }}>{op}</span>
                          ))}
                        </div>
                      )}

                      {/* AI reasoning */}
                      {lead.ai_reasoning && (
                        <p className="text-xs leading-relaxed mb-3 italic" style={{ color:"var(--text-soft)" }}>{lead.ai_reasoning}</p>
                      )}

                      {/* AI Pitch (expandable) */}
                      {lead.ai_pitch && (
                        <div className="rounded-xl p-3 mb-3 text-xs leading-relaxed" style={{ background:"var(--primary-soft)", color:"var(--primary)" }}>
                          <p className="text-[10px] font-semibold uppercase tracking-wide mb-1 opacity-70">AI Cold Pitch</p>
                          {lead.ai_pitch}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => convertToClient(lead)} disabled={!!converting}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold text-white gradient-primary hover:opacity-90 disabled:opacity-50 transition-all">
                          {converting === lead.id ? <Loader2 size={11} className="animate-spin"/> : <ArrowRight size={11}/>}
                          Add to CRM
                        </button>
                        <select value={lead.status} onChange={e => updateStatus(lead.id, e.target.value)}
                          className="text-xs rounded-xl px-2 py-1.5 border outline-none cursor-pointer"
                          style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                          {PIPELINE_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                        <button onClick={() => deleteLead(lead.id)} className="ml-auto p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--danger)" }}><Trash2 size={12}/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE VIEW ────────────────────────────────────────────────── */}
      {view === "pipeline" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setStatusFilter("all")} className={`pill transition-all ${statusFilter === "all" ? "" : "opacity-60"}`} style={{ background:"var(--primary-soft)", color:"var(--primary)" }}>
              All ({leads.length})
            </button>
            {PIPELINE_COLS.map(col => {
              const count = leads.filter(l => l.status === col.id).length;
              return (
                <button key={col.id} onClick={() => setStatusFilter(col.id)}
                  className="pill transition-all"
                  style={statusFilter === col.id ? { background:`${STATUS_PILL[col.id]?.color}15`, color:STATUS_PILL[col.id]?.color, border:`1px solid ${STATUS_PILL[col.id]?.color}40` } : { background:"var(--surface)", color:"var(--muted)", border:"1px solid var(--border)", opacity: count === 0 ? 0.4 : 1 }}>
                  {col.label} ({count})
                </button>
              );
            })}
          </div>

          {filteredPipeline.length === 0 ? (
            <div className="glow-card rounded-2xl p-8 text-center">
              <p className="text-sm" style={{ color:"var(--muted)" }}>No leads in this stage yet</p>
            </div>
          ) : (
            <div className="glow-card rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom:"1px solid var(--border)" }}>
                      {["Business","Category","Location","Rating","Score","Status","Actions"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color:"var(--muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor:"var(--border)" }}>
                    {filteredPipeline.map(lead => {
                      const tier = TIER_STYLE[lead.ai_tier] ?? TIER_STYLE.warm;
                      return (
                        <tr key={lead.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium truncate max-w-[180px]" style={{ color:"var(--text)" }}>{lead.business_name}</p>
                            {!lead.has_website && <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background:"var(--danger-bg)", color:"var(--danger)" }}>no website</span>}
                          </td>
                          <td className="px-4 py-3 text-xs truncate max-w-[120px]" style={{ color:"var(--muted)" }}>{lead.category}</td>
                          <td className="px-4 py-3 text-xs truncate max-w-[120px]" style={{ color:"var(--muted)" }}>{lead.location}</td>
                          <td className="px-4 py-3 text-xs" style={{ color:"var(--text)" }}>
                            {lead.rating > 0 ? `⭐ ${lead.rating}` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="pill text-[11px] font-bold" style={{ background: tier.bg, color: tier.color }}>{lead.ai_score}/10</span>
                          </td>
                          <td className="px-4 py-3">
                            <select value={lead.status} onChange={e => updateStatus(lead.id, e.target.value)}
                              className="text-xs rounded-lg px-2 py-1 border outline-none cursor-pointer"
                              style={{ background:"var(--surface)", borderColor:"var(--border)", color:"var(--text)" }}>
                              {PIPELINE_COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {lead.status !== "converted" && (
                                <button onClick={() => convertToClient(lead)} disabled={!!converting} title="Add to CRM"
                                  className="p-1.5 rounded-lg transition-all hover:opacity-70" style={{ color:"var(--success)" }}>
                                  {converting === lead.id ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}
                                </button>
                              )}
                              <button onClick={() => deleteLead(lead.id)} title="Delete" className="p-1.5 rounded-lg hover:opacity-70" style={{ color:"var(--danger)" }}><Trash2 size={12}/></button>
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
    </div>
  );
}