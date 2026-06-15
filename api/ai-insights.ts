/**
 * POST /api/ai-insights
 * Body: { metrics: SocialMetric[], posts: PlatformPost[], ad_metrics?: AdMetric[] }
 * Returns AIInsight with working/not_working analysis, recommendations, scores
 */

async function callCloudflareAI(prompt: string): Promise<string> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) throw new Error("Cloudflare credentials not configured");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are an expert digital marketing analyst for social media managers and performance marketers. Respond ONLY with valid JSON — no markdown, no code fences, no extra text before or after the JSON object." },
          { role: "user", content: prompt },
        ],
        max_tokens: 1800,
        temperature: 0.3,
      }),
    }
  );
  if (!res.ok) throw new Error(`Cloudflare AI ${res.status}`);
  const data = await res.json();
  return (data as any)?.result?.response ?? "";
}

function extractJSON(raw: string): any {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const match   = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in AI response");
  return JSON.parse(match[0]);
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { metrics?: any[]; posts?: any[]; ad_metrics?: any[] };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  if (!body.metrics?.length) {
    return new Response(JSON.stringify({ error: "No metrics to analyse" }), { status: 400 });
  }

  const prompt = `Analyse this digital marketing data for a brand's social media and ad performance. Act as a senior performance marketing consultant.

PLATFORM METRICS (aggregate stats per platform):
${JSON.stringify(body.metrics, null, 2)}

TOP POSTS PER PLATFORM (sorted by engagement):
${JSON.stringify((body.posts ?? []).slice(0, 20), null, 2)}

AD SPEND / REVENUE DATA (if available):
${JSON.stringify(body.ad_metrics ?? [], null, 2)}

Return ONLY a JSON object with exactly this structure:
{
  "overall_score": 7.2,
  "top_platform": "instagram",
  "key_insight": "2-3 sentence insight referencing actual numbers from the data",
  "working": [
    "Specific thing that IS working, referencing real numbers (e.g. 'Reels are driving 3x the engagement rate of static posts on Instagram at 8.4%')",
    "Another specific working tactic with real numbers",
    "A third working tactic with real numbers"
  ],
  "not_working": [
    "Specific thing that is NOT working, referencing real numbers (e.g. 'Facebook engagement rate of 0.4% is well below the 1-2% benchmark')",
    "Another underperforming area with real numbers",
    "A third underperforming area with real numbers"
  ],
  "recommendations": [
    { "platform": "instagram", "priority": "high",   "title": "Short action title (max 6 words)", "description": "Specific insight referencing real numbers", "action": "Exact single step to take this week" },
    { "platform": "tiktok",    "priority": "medium", "title": "Another title",                     "description": "Description with real numbers",          "action": "Specific action step" },
    { "platform": "all",       "priority": "high",   "title": "Cross-platform opportunity",        "description": "Cross-platform insight",                 "action": "What to do across all platforms" }
  ],
  "best_times": {
    "instagram": "6–8 PM weekdays",
    "facebook": "12–3 PM Wednesday",
    "tiktok": "7–9 PM daily",
    "youtube": "2–4 PM Saturday"
  },
  "content_insight": "One sentence about what type of content is performing best based on the top posts data"
}

Rules:
- overall_score: 0–10 based on the actual engagement rates and (if present) ROAS/CTR in the data
- top_platform: whichever platform has the highest engagement_rate
- "working" and "not_working": exactly 3 items each, ALL referencing specific real numbers from the data provided. If ad_metrics is present, include ROAS/CTR/CPA observations in these lists.
- Generate exactly 3 recommendations
- priority: one of high, medium, low
- Be direct and specific — this is for professional marketers who want actionable signal, not generic advice`;

  try {
    const raw  = await callCloudflareAI(prompt);
    const json = extractJSON(raw);
    json.generated_at = new Date().toISOString();
    if (!Array.isArray(json.working)) json.working = [];
    if (!Array.isArray(json.not_working)) json.not_working = [];
    return new Response(JSON.stringify(json), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("AI insights error:", err.message);
    return new Response(JSON.stringify({
      overall_score: 0,
      top_platform: "unknown",
      key_insight: "AI analysis is unavailable right now. Connect your platforms and sync to try again.",
      working: [],
      not_working: [],
      recommendations: [],
      best_times: {},
      content_insight: "",
      generated_at: new Date().toISOString(),
      error: err.message,
    }), { headers: { "Content-Type": "application/json" } });
  }
}