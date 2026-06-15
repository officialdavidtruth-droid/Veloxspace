import React, { useState, useEffect } from "react";
import { METRIC_DEFINITIONS } from "../lib/platforms";
import { CURRENCIES, fmtCurrency, convertAmount } from "../lib/currency";
import type { AppUser } from "../lib/supabase";
import { ChevronDown, ChevronUp, Calculator, Info } from "lucide-react";

export function Analytics({ user }: { user: AppUser }) {
  const [currency, setCurrency]   = useState("USD");
  const [expanded, setExpanded]   = useState<string | null>(null);

  // Calculator inputs
  const [adSpend,    setAdSpend]    = useState("");
  const [revenue,    setRevenue]    = useState("");
  const [clicks,     setClicks]     = useState("");
  const [impressions,setImpressions]= useState("");
  const [conversions,setConversions]= useState("");
  const [leads,      setLeads]      = useState("");
  const [customers,  setCustomers]  = useState("");
  const [ltv,        setLtv]        = useState("");

  const sp = parseFloat(adSpend)     || 0;
  const rv = parseFloat(revenue)     || 0;
  const cl = parseFloat(clicks)      || 0;
  const im = parseFloat(impressions) || 0;
  const cv = parseFloat(conversions) || 0;
  const ld = parseFloat(leads)       || 0;
  const cu = parseFloat(customers)   || 0;
  const lv = parseFloat(ltv)         || 0;

  const calc = {
    ROAS: sp > 0 ? rv / sp          : null,
    ROI:  sp > 0 ? ((rv - sp) / sp) * 100 : null,
    CTR:  im > 0 ? (cl / im) * 100  : null,
    CPA:  cv > 0 ? sp / cv           : null,
    CPM:  im > 0 ? (sp / im) * 1000 : null,
    CPC:  cl > 0 ? sp / cl           : null,
    CPL:  ld > 0 ? sp / ld           : null,
    CAC:  cu > 0 ? sp / cu           : null,
    LTV:  lv > 0 ? lv                : null,
    ER:   null as null,
  };


  const fmtCalc = (def: typeof METRIC_DEFINITIONS[0]): string => {
    const val = (calc as any)[def.abbr];
    if (val === null || val === undefined) return "—";
    if (def.type === "ratio") return `${val.toFixed(2)}×`;
    if (def.type === "percentage") return `${val.toFixed(2)}%`;
    if (def.type === "currency") return fmtCurrency(val, currency);
    return val.toFixed(2);
  };

  const isGood = (def: typeof METRIC_DEFINITIONS[0]): boolean | null => {
    const val = (calc as any)[def.abbr];
    if (val === null || val === undefined) return null;
    return def.higherIsBetter ? val > 0 : val < 999999;
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1" style={{ color: "var(--text)" }}>Analytics</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Calculate your marketing performance metrics with full explanations
          </p>
        </div>
        {/* Currency selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>Currency:</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="text-sm rounded-xl px-3 py-2 border outline-none cursor-pointer"
            style={{ background: "var(--card)", borderColor: "var(--border)", color: "var(--text)" }}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Calculator */}
      <div className="rounded-2xl p-6 border shadow-sm" style={{ background: "var(--card)", borderColor: "var(--border)" }}>
        <h2 className="font-display text-base font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text)" }}>
          <Calculator size={16} className="gradient-text" /> Metrics Calculator
        </h2>
        <p className="text-xs mb-5" style={{ color: "var(--muted)" }}>
          A quick what-if calculator — enter any numbers to see how each formula works. This is for learning and
          planning only; it doesn't affect or get mixed into your real connected-account data shown on Overview
          and Ads Analytics.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: `Ad Spend (${currency})`,    value: adSpend,     set: setAdSpend     },
            { label: `Revenue (${currency})`,     value: revenue,     set: setRevenue     },
            { label: "Clicks",                    value: clicks,      set: setClicks      },
            { label: "Impressions",               value: impressions, set: setImpressions },
            { label: "Conversions",               value: conversions, set: setConversions },
            { label: "Leads Generated",           value: leads,       set: setLeads       },
            { label: "New Customers",             value: customers,   set: setCustomers   },
            { label: `LTV per Customer (${currency})`, value: ltv,   set: setLtv         },
          ].map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--muted)" }}>{label}</label>
              <input type="number" value={value} onChange={(e) => set(e.target.value)}
                placeholder="0"
                className="w-full text-sm rounded-xl px-3 py-2.5 outline-none border font-mono transition-all"
                style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }} />
            </div>
          ))}
        </div>
      </div>

      {/* Metric definition cards */}
      <div>
        <h2 className="font-display text-base font-semibold mb-4" style={{ color: "var(--text)" }}>
          Performance Metrics — Explained
        </h2>
        <div className="space-y-3">
          {METRIC_DEFINITIONS.map((def) => {
            const val = (calc as any)[def.abbr];
            const open = expanded === def.abbr;
            const hasValue = val !== null && val !== undefined;
            const good = isGood(def);

            return (
              <div key={def.abbr} className="rounded-2xl border overflow-hidden transition-all"
                style={{ background: "var(--card)", borderColor: open ? def.color : "var(--border)" }}>
                <button className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => setExpanded(open ? null : def.abbr)}>
                  <div className="flex items-center gap-4">
                    {/* Abbr badge */}
                    <div className="w-16 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0"
                      style={{ background: `${def.color}15`, color: def.color }}>
                      {def.abbr}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{def.full}</p>
                      <p className="text-xs" style={{ color: "var(--muted)" }}>{def.formula}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {hasValue && (
                      <span className={`text-sm font-mono font-semibold px-2.5 py-1 rounded-lg ${
                        good === null ? "" : good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                      }`}>
                        {fmtCalc(def)}
                      </span>
                    )}
                    {!hasValue && (
                      <span className="text-xs px-2.5 py-1 rounded-lg" style={{ color: "var(--muted)", background: "var(--surface)" }}>
                        Enter data above
                      </span>
                    )}
                    {open ? <ChevronUp size={16} style={{ color: "var(--muted)" }} /> : <ChevronDown size={16} style={{ color: "var(--muted)" }} />}
                  </div>
                </button>

                {open && (
                  <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text)" }}>
                          {def.description}
                        </p>
                        <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs"
                          style={{ background: `${def.color}10`, color: def.color }}>
                          <Info size={13} className="shrink-0 mt-0.5" />
                          <span><strong>Benchmark:</strong> {def.benchmark}</span>
                        </div>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}>
                        <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>Formula breakdown</p>
                        <p className="text-sm font-mono" style={{ color: def.color }}>{def.formula}</p>
                        {hasValue && (
                          <div className="mt-3 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
                            <p className="text-xs" style={{ color: "var(--muted)" }}>Your result</p>
                            <p className="text-xl font-mono font-bold mt-0.5" style={{ color: def.color }}>{fmtCalc(def)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}