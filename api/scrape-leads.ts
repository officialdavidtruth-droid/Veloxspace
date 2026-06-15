/**
 * POST /api/scrape-leads
 * Body: { uid, workspace_id, query, location, radius?, no_website_only? }
 *
 * 1. Calls Google Places Text Search API to find local businesses
 * 2. Gets details (phone, website, rating) per result
 * 3. Calls Cloudflare AI to score each lead and generate a personalized pitch
 * 4. Deduplicates against existing leads in the workspace
 * 5. Inserts new leads and returns them
 *
 * Requires: GOOGLE_PLACES_API_KEY + CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const PLACES_KEY   = process.env.GOOGLE_PLACES_API_KEY ?? "";
const CF_ACCOUNT   = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const CF_TOKEN     = process.env.CLOUDFLARE_API_TOKEN ?? "";

interface PlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  business_status?: string;
}

interface PlaceDetails {
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  formatted_address?: string;
  types?: string[];
}

async function searchPlaces(query: string, location: string, radius: number): Promise<PlaceResult[]> {
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?` +
    new URLSearchParams({ query: `${query} in ${location}`, radius: String(radius), key: PLACES_KEY });
  const res  = await fetch(url);
  const data = await res.json();
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
    throw new Error(`Google Places error: ${data.status} — ${data.error_message ?? "unknown"}`);
  }
  return (data.results ?? []).slice(0, 20) as PlaceResult[];
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?` +
    new URLSearchParams({ place_id: placeId, fields: "formatted_phone_number,website,rating,user_ratings_total,formatted_address,types", key: PLACES_KEY });
  const res  = await fetch(url);
  const data = await res.json();
  return (data.result ?? {}) as PlaceDetails;
}

async function scoreLead(name: string, category: string, address: string, rating: number, reviews: number, hasWebsite: boolean): Promise<{ score: number; tier: string; opportunities: string[]; reasoning: string; pitch: string }> {
  const prompt = `You are a business development analyst for a digital marketing agency. Score this local business as a potential client (1-10):

Business: ${name}
Type: ${category}
Location: ${address}
Rating: ${rating > 0 ? `${rating}/5 stars (${reviews} Google reviews)` : "No Google reviews yet"}
Has website: ${hasWebsite ? "Yes" : "No — needs one"}

Scoring guide (higher = better lead for a digital marketing agency):
9-10: Perfect lead — no website, very low/no rating, or clearly needs digital marketing
7-8: Strong lead — basic presence but obvious improvement areas
5-6: Moderate lead — some digital presence, could still benefit
3-4: Weak lead — already strong online (many reviews, great rating, active digital)
1-2: Poor lead — franchise/enterprise with own marketing teams

Opportunities to identify (pick all that apply): "needs website", "local SEO", "reputation management", "social media", "Google Ads", "content marketing", "review generation"

Return ONLY valid JSON, no markdown:
{"score":8,"tier":"hot","opportunities":["needs website","local SEO"],"reasoning":"One sentence why this business needs marketing help","pitch":"Personalized 1-2 sentence cold outreach opening referencing their specific situation"}`;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a lead scoring assistant. Respond ONLY with valid JSON — no markdown, no code fences." },
          { role: "user", content: prompt },
        ],
        max_tokens: 400, temperature: 0.3,
      }),
    }
  );
  const data = await res.json();
  const raw  = (data as any)?.result?.response ?? "";
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { score: 5, tier: "warm", opportunities: [], reasoning: "Potential marketing client", pitch: `Hi, I noticed ${name} and thought we could help grow your digital presence.` };
  } catch {
    return { score: 5, tier: "warm", opportunities: [], reasoning: "Potential marketing client", pitch: `Hi, I noticed ${name} and thought we could help grow your digital presence.` };
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  if (!PLACES_KEY) {
    return new Response(JSON.stringify({ error: "GOOGLE_PLACES_API_KEY is not set in Netlify environment variables. Add it at: https://console.cloud.google.com → Enable Places API → Create API Key." }), { status: 400 });
  }

  let body: { uid?: string; workspace_id?: string; query?: string; location?: string; radius?: number; no_website_only?: boolean };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { uid, workspace_id, query, location, radius = 10000, no_website_only = false } = body;
  if (!uid || !workspace_id || !query || !location) {
    return new Response(JSON.stringify({ error: "uid, workspace_id, query, and location are required" }), { status: 400 });
  }

  let places: PlaceResult[] = [];
  try {
    places = await searchPlaces(query, location, radius);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }

  if (!places.length) {
    return new Response(JSON.stringify({ results: [], message: "No businesses found for this search. Try a different keyword or location." }), { headers: { "Content-Type": "application/json" } });
  }

  // Get existing lead place_ids in this workspace to avoid duplicates
  const { data: existing } = await supabase.from("leads").select("place_id").eq("workspace_id", workspace_id);
  const existingIds = new Set((existing ?? []).map((l: any) => l.place_id).filter(Boolean));

  const results = [];
  for (const place of places) {
    if (existingIds.has(place.place_id)) continue;

    // Fetch details (phone, website)
    let details: PlaceDetails = {};
    try { details = await getPlaceDetails(place.place_id); } catch { /* skip */ }

    const hasWebsite = !!(details.website);
    if (no_website_only && hasWebsite) continue;

    const category = (details.types ?? place.types ?? [])
      .filter((t: string) => !["point_of_interest","establishment"].includes(t))
      .map((t: string) => t.replace(/_/g, " "))
      .slice(0, 2).join(", ");

    const rating   = details.rating ?? place.rating ?? 0;
    const reviews  = details.user_ratings_total ?? place.user_ratings_total ?? 0;
    const address  = details.formatted_address ?? place.formatted_address ?? "";

    // AI scoring
    let aiResult = { score: 0, tier: "", opportunities: [] as string[], reasoning: "", pitch: "" };
    if (CF_ACCOUNT && CF_TOKEN) {
      try { aiResult = await scoreLead(place.name, category, address, rating, reviews, hasWebsite); } catch { /* skip AI */ }
    }

    const row = {
      uid, workspace_id,
      business_name: place.name,
      phone: details.formatted_phone_number ?? "",
      website: details.website ?? "",
      address,
      category,
      location,
      rating,
      review_count: reviews,
      has_website: hasWebsite,
      source: "google_places",
      place_id: place.place_id,
      status: "new",
      ai_score: aiResult.score,
      ai_tier: aiResult.tier,
      ai_opportunities: aiResult.opportunities,
      ai_reasoning: aiResult.reasoning,
      ai_pitch: aiResult.pitch,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: inserted } = await supabase.from("leads").insert(row).select().single();
    results.push(inserted ?? row);
  }

  return new Response(JSON.stringify({ results, total: results.length }), { headers: { "Content-Type": "application/json" } });
}