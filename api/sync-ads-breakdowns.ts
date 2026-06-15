/**
 * POST /api/sync-ads-breakdowns
 * Body: { uid: string }
 *
 * Mirrors the core views of each platform's native ads manager so users
 * never need to leave VeloxSpace:
 *  - Campaign-level performance table (spend, CTR, CPC, CPM, ROAS, conversions)
 *  - Demographic breakdowns: age, gender
 *  - Geographic breakdown: country
 *  - Device breakdown: mobile / desktop / tablet
 *  - Placement / network breakdown:
 *      Meta      → publisher_platform (Facebook, Instagram, Audience Network, Messenger)
 *      Google    → ad_network_type (Search, Search Partners, Display, YouTube)
 *      TikTok    → placement (TikTok, Pangle, News Feed apps)
 *
 * Writes into public.ad_breakdowns and public.ad_campaigns, replacing prior
 * rows for that uid+platform on each sync.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

type Row = { dimension: string; dimension_value: string; spend: number; impressions: number; clicks: number; conversions: number; ctr: number; cpc: number };
type Campaign = { campaign_name: string; status: string; spend: number; impressions: number; clicks: number; conversions: number; ctr: number; cpc: number; cpm: number; roas: number };

async function getConn(uid: string, platform: string, workspaceId?: string) {
  const { data } = await supabase.from("platform_connections")
    .select("account_id, access_token, connected")
    .eq(workspaceId ? "workspace_id" : "uid", workspaceId || uid).eq("platform", platform).maybeSingle();
  if (!data?.connected || !data.access_token || !data.account_id) return null;
  return data;
}

async function saveBreakdowns(uid: string, platform: string, rows: Row[], workspaceId?: string) {
  const filter = workspaceId ? { workspace_id: workspaceId } : { uid };
  await supabase.from("ad_breakdowns").delete().match({ ...filter, platform });
  if (rows.length) await supabase.from("ad_breakdowns").insert(rows.map(r => ({ uid, workspace_id: workspaceId ?? null, platform, recorded_at: new Date().toISOString(), ...r })));
}
async function saveCampaigns(uid: string, platform: string, rows: Campaign[], workspaceId?: string) {
  const filter = workspaceId ? { workspace_id: workspaceId } : { uid };
  await supabase.from("ad_campaigns").delete().match({ ...filter, platform });
  if (rows.length) await supabase.from("ad_campaigns").insert(rows.map(r => ({ uid, workspace_id: workspaceId ?? null, platform, recorded_at: new Date().toISOString(), ...r })));
}

// ── Meta Ads ──────────────────────────────────────────────────────────────────
async function syncMetaAds(uid: string, workspaceId?: string) {
  const conn = await getConn(uid, "meta_ads", workspaceId);
  if (!conn) return { platform: "meta_ads", status: "not_connected" };

  const base = `https://graph.facebook.com/v18.0/${conn.account_id}/insights`;
  const fields = "spend,impressions,clicks,ctr,cpc,cpm,actions,action_values";

  async function fetchBreakdown(breakdown: string) {
    const res = await fetch(`${base}?level=account&date_preset=last_30d&breakdowns=${breakdown}&fields=spend,impressions,clicks,ctr,cpc&access_token=${conn.access_token}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.data ?? [];
  }

  const rows: Row[] = [];
  try {
    for (const item of await fetchBreakdown("age"))     rows.push(toRow("age", item.age, item));
    for (const item of await fetchBreakdown("gender"))  rows.push(toRow("gender", item.gender, item));
    for (const item of await fetchBreakdown("country")) rows.push(toRow("country", item.country, item));
    for (const item of await fetchBreakdown("device_platform")) rows.push(toRow("device", humanizeMetaDevice(item.device_platform), item));
    for (const item of await fetchBreakdown("publisher_platform")) rows.push(toRow("placement", capitalize(item.publisher_platform), item));
  } catch (e: any) {
    return { platform: "meta_ads", status: "error", error: e.message };
  }

  // Campaign-level table
  const campaigns: Campaign[] = [];
  try {
    const res = await fetch(`${base}?level=campaign&date_preset=last_30d&fields=campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,action_values&access_token=${conn.access_token}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    for (const item of data.data ?? []) {
      const spend = parseFloat(item.spend ?? "0");
      const revenue = sumActionValues(item.action_values);
      campaigns.push({
        campaign_name: item.campaign_name ?? "Unnamed campaign", status: "ACTIVE",
        spend, impressions: parseInt(item.impressions ?? "0"), clicks: parseInt(item.clicks ?? "0"),
        conversions: sumActions(item.actions), ctr: parseFloat(item.ctr ?? "0"), cpc: parseFloat(item.cpc ?? "0"),
        cpm: parseFloat(item.cpm ?? "0"), roas: spend > 0 ? revenue / spend : 0,
      });
    }
  } catch { /* campaign table optional */ }

  await saveBreakdowns(uid, "meta_ads", rows, workspaceId);
  await saveCampaigns(uid, "meta_ads", campaigns, workspaceId);
  return { platform: "meta_ads", status: "ok", rows: rows.length, campaigns: campaigns.length };

  function toRow(dimension: string, value: any, item: any): Row {
    return {
      dimension, dimension_value: String(value ?? "unknown"),
      spend: parseFloat(item.spend ?? "0"), impressions: parseInt(item.impressions ?? "0"),
      clicks: parseInt(item.clicks ?? "0"), conversions: 0,
      ctr: parseFloat(item.ctr ?? "0"), cpc: parseFloat(item.cpc ?? "0"),
    };
  }
}
function humanizeMetaDevice(v: string) {
  const m: Record<string,string> = { mobile_app: "Mobile App", mobile_web: "Mobile Web", desktop: "Desktop", unknown: "Unknown" };
  return m[v] ?? capitalize(v ?? "unknown");
}
function capitalize(v: string) { return v ? v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ") : "Unknown"; }
function sumActions(actions: any[]): number {
  if (!Array.isArray(actions)) return 0;
  return actions.filter(a => /purchase|lead|conversion|complete_registration/.test(a.action_type ?? "")).reduce((s, a) => s + parseFloat(a.value ?? "0"), 0);
}
function sumActionValues(actionValues: any[]): number {
  if (!Array.isArray(actionValues)) return 0;
  return actionValues.filter(a => /purchase/.test(a.action_type ?? "")).reduce((s, a) => s + parseFloat(a.value ?? "0"), 0);
}

// ── Google Ads ────────────────────────────────────────────────────────────────
async function refreshGoogleToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      refresh_token: refreshToken, grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token as string;
}
async function gaql(customerId: string, accessToken: string, devToken: string, query: string) {
  const res = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as any).error?.message ?? res.statusText);
  return (data as any).results ?? [];
}
const NETWORK_LABELS: Record<string,string> = {
  SEARCH: "Google Search", SEARCH_PARTNERS: "Search Partners", CONTENT: "Display Network",
  YOUTUBE_SEARCH: "YouTube Search", YOUTUBE_WATCH: "YouTube Videos", MIXED: "Mixed", UNSPECIFIED: "Unspecified",
};
const DEVICE_LABELS: Record<string,string> = { MOBILE: "Mobile", DESKTOP: "Desktop", TABLET: "Tablet", CONNECTED_TV: "Connected TV", OTHER: "Other" };

async function syncGoogleAds(uid: string, workspaceId?: string) {
  const conn = await getConn(uid, "google_ads", workspaceId);
  if (!conn) return { platform: "google_ads", status: "not_connected" };

  let tokenData: { access_token: string; refresh_token: string; expiry: number };
  try { tokenData = JSON.parse(conn.access_token); } catch { return { platform: "google_ads", status: "error", error: "invalid token" }; }

  let accessToken = tokenData.access_token;
  if (Date.now() > (tokenData.expiry ?? 0) && tokenData.refresh_token) {
    try { accessToken = await refreshGoogleToken(tokenData.refresh_token); }
    catch (e: any) { return { platform: "google_ads", status: "error", error: e.message }; }
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) return { platform: "google_ads", status: "error", error: "GOOGLE_ADS_DEVELOPER_TOKEN not configured" };

  let customerId = conn.account_id.replace(/-/g, "");
  if (!customerId || customerId === "google_ads") {
    const listRes = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", {
      headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken },
    });
    const listData = await listRes.json();
    customerId = (listData.resourceNames?.[0] ?? "").replace("customers/", "");
    if (!customerId) return { platform: "google_ads", status: "error", error: "no accessible accounts" };
  }

  const rows: Row[] = [];
  const campaigns: Campaign[] = [];
  try {
    const metricsExpr = (m: any) => ({
      spend: (m.costMicros ?? 0) / 1_000_000, impressions: m.impressions ?? 0, clicks: m.clicks ?? 0,
      conversions: m.conversions ?? 0, ctr: (m.ctr ?? 0) * 100,
      cpc: m.clicks > 0 ? ((m.costMicros ?? 0) / 1_000_000) / m.clicks : 0,
    });

    // Campaign-level table
    const campResults = await gaql(customerId, accessToken, devToken, `
      SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks,
             metrics.conversions, metrics.conversions_value, metrics.ctr, metrics.average_cpc, metrics.average_cpm
      FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC LIMIT 20`);
    for (const r of campResults) {
      const spend = (r.metrics.costMicros ?? 0) / 1_000_000;
      const revenue = r.metrics.conversionsValue ?? 0;
      campaigns.push({
        campaign_name: r.campaign.name ?? "Unnamed campaign", status: r.campaign.status ?? "UNKNOWN",
        spend, impressions: r.metrics.impressions ?? 0, clicks: r.metrics.clicks ?? 0,
        conversions: r.metrics.conversions ?? 0, ctr: (r.metrics.ctr ?? 0) * 100,
        cpc: (r.metrics.averageCpc ?? 0) / 1_000_000, cpm: (r.metrics.averageCpm ?? 0) / 1_000_000,
        roas: spend > 0 ? revenue / spend : 0,
      });
    }

    // Age
    for (const r of await gaql(customerId, accessToken, devToken, `
      SELECT ad_group_criterion.age_range.type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr
      FROM age_range_view WHERE segments.date DURING LAST_30_DAYS`)) {
      const m = metricsExpr(r.metrics);
      rows.push({ dimension: "age", dimension_value: (r.adGroupCriterion?.ageRange?.type ?? "UNKNOWN").replace("AGE_RANGE_", "").replace(/_/g, "-"), ...m });
    }
    // Gender
    for (const r of await gaql(customerId, accessToken, devToken, `
      SELECT ad_group_criterion.gender.type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr
      FROM gender_view WHERE segments.date DURING LAST_30_DAYS`)) {
      const m = metricsExpr(r.metrics);
      rows.push({ dimension: "gender", dimension_value: (r.adGroupCriterion?.gender?.type ?? "UNKNOWN").replace("GENDER_", "").toLowerCase(), ...m });
    }
    // Geographic
    for (const r of await gaql(customerId, accessToken, devToken, `
      SELECT geographic_view.country_criterion_id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr
      FROM geographic_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 15`)) {
      const m = metricsExpr(r.metrics);
      rows.push({ dimension: "country", dimension_value: `geo:${r.geographicView?.countryCriterionId ?? "unknown"}`, ...m });
    }
    // Device
    for (const r of await gaql(customerId, accessToken, devToken, `
      SELECT segments.device, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr
      FROM campaign WHERE segments.date DURING LAST_30_DAYS`)) {
      const m = metricsExpr(r.metrics);
      rows.push({ dimension: "device", dimension_value: DEVICE_LABELS[r.segments?.device ?? ""] ?? "Other", ...m });
    }
    // Network / placement
    for (const r of await gaql(customerId, accessToken, devToken, `
      SELECT segments.ad_network_type, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr
      FROM campaign WHERE segments.date DURING LAST_30_DAYS`)) {
      const m = metricsExpr(r.metrics);
      rows.push({ dimension: "placement", dimension_value: NETWORK_LABELS[r.segments?.adNetworkType ?? ""] ?? "Other", ...m });
    }
  } catch (e: any) {
    return { platform: "google_ads", status: "error", error: e.message };
  }

  await saveBreakdowns(uid, "google_ads", rows, workspaceId);
  await saveCampaigns(uid, "google_ads", campaigns, workspaceId);
  return { platform: "google_ads", status: "ok", rows: rows.length, campaigns: campaigns.length };
}

// ── TikTok Ads ────────────────────────────────────────────────────────────────
const TIKTOK_PLACEMENT_LABELS: Record<string,string> = { PLACEMENT_TIKTOK: "TikTok", PLACEMENT_PANGLE: "Pangle", PLACEMENT_NEWS_FEED_APP_SERIES: "News Feed Apps" };
const TIKTOK_DEVICE_LABELS: Record<string,string> = { ANDROID: "Android", IOS: "iOS" };

async function syncTikTokAds(uid: string, workspaceId?: string) {
  const conn = await getConn(uid, "tiktok", workspaceId);
  if (!conn) return { platform: "tiktok", status: "not_connected" };

  const end   = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const rows: Row[] = [];
  const campaigns: Campaign[] = [];

  async function report(dimensions: string[], dataLevel: string, metrics: string[]) {
    const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
      method: "POST", headers: { "Access-Token": conn.access_token, "Content-Type": "application/json" },
      body: JSON.stringify({ advertiser_id: conn.account_id, report_type: "BASIC", dimensions, metrics, data_level: dataLevel, start_date: start, end_date: end, page_size: 20 }),
    });
    const data = await res.json();
    if (data.code !== 0) return [];
    return data.data?.list ?? [];
  }

  try {
    // Campaign table
    for (const item of await report(["campaign_id"], "AUCTION_CAMPAIGN", ["campaign_name","spend","impressions","clicks","conversion","ctr","cpc","cpm"])) {
      const m = item.metrics ?? {};
      const spend = parseFloat(m.spend ?? "0");
      campaigns.push({
        campaign_name: m.campaign_name ?? "Unnamed campaign", status: "ACTIVE",
        spend, impressions: parseInt(m.impressions ?? "0"), clicks: parseInt(m.clicks ?? "0"),
        conversions: parseFloat(m.conversion ?? "0"), ctr: parseFloat(m.ctr ?? "0"), cpc: parseFloat(m.cpc ?? "0"),
        cpm: parseFloat(m.cpm ?? "0"), roas: 0,
      });
    }
    // Age / Gender / Country / Device / Placement
    const dims: { key: string; field: string; labels?: Record<string,string> }[] = [
      { key: "age", field: "age" }, { key: "gender", field: "gender" }, { key: "country", field: "country_code" },
      { key: "device", field: "platform", labels: TIKTOK_DEVICE_LABELS },
      { key: "placement", field: "placement", labels: TIKTOK_PLACEMENT_LABELS },
    ];
    for (const d of dims) {
      for (const item of await report([d.field], "AUCTION_ADVERTISER", ["spend","clicks","impressions","conversion","ctr","cpc"])) {
        const m = item.metrics ?? {}; const dd = item.dimensions ?? {};
        const raw = String(dd[d.field] ?? "unknown");
        rows.push({
          dimension: d.key, dimension_value: d.labels?.[raw] ?? raw,
          spend: parseFloat(m.spend ?? "0"), impressions: parseInt(m.impressions ?? "0"),
          clicks: parseInt(m.clicks ?? "0"), conversions: parseFloat(m.conversion ?? "0"),
          ctr: parseFloat(m.ctr ?? "0"), cpc: parseFloat(m.cpc ?? "0"),
        });
      }
    }
  } catch { /* partial data is fine */ }

  await saveBreakdowns(uid, "tiktok", rows, workspaceId);
  await saveCampaigns(uid, "tiktok", campaigns, workspaceId);
  return { platform: "tiktok", status: (rows.length || campaigns.length) ? "ok" : "no_data", rows: rows.length, campaigns: campaigns.length };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { uid?: string; workspace_id?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }
  if (!body.uid) return new Response(JSON.stringify({ error: "uid required" }), { status: 400 });

  const [meta, google, tiktok] = await Promise.all([
    syncMetaAds(body.uid, body.workspace_id).catch(e => ({ platform: "meta_ads", status: "error", error: e.message })),
    syncGoogleAds(body.uid, body.workspace_id).catch(e => ({ platform: "google_ads", status: "error", error: e.message })),
    syncTikTokAds(body.uid, body.workspace_id).catch(e => ({ platform: "tiktok", status: "error", error: e.message })),
  ]);

  return new Response(JSON.stringify({ results: [meta, google, tiktok] }), { headers: { "Content-Type": "application/json" } });
}