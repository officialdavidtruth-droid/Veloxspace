/**
 * POST /api/publish-post
 * Body: { uid, content, media_url?, platforms: string[] }
 * Publishes a text (+ optional image URL) post to each connected platform
 * that supports direct text posting via API: Facebook, LinkedIn, X.
 * Instagram, TikTok, YouTube require media-hosting infrastructure and
 * are returned as "not_supported" so the UI can show "coming soon".
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const TEXT_POSTABLE = new Set(["facebook", "linkedin", "twitter"]);

async function getConnection(uid: string, platform: string, workspaceId?: string) {
  const { data } = await supabase.from("platform_connections")
    .select("account_id, access_token, connected")
    .eq(workspaceId ? "workspace_id" : "uid", workspaceId || uid).eq("platform", platform).maybeSingle();
  if (!data?.connected || !data.access_token) return null;
  return data;
}

async function postFacebook(pageId: string, token: string, content: string, mediaUrl?: string) {
  const url = `https://graph.facebook.com/v18.0/${pageId}/feed`;
  const params = new URLSearchParams({ message: content, access_token: token });
  if (mediaUrl) params.set("link", mediaUrl);
  const res = await fetch(url, { method: "POST", body: params });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return `https://facebook.com/${data.id}`;
}

async function postLinkedIn(personOrOrgId: string, token: string, content: string, mediaUrl?: string) {
  // Determine author URN - try organization first, fall back to person
  const authorUrn = `urn:li:organization:${personOrOrgId}`;
  const body: any = {
    author: authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: content },
        shareMediaCategory: mediaUrl ? "ARTICLE" : "NONE",
        ...(mediaUrl ? { media: [{ status: "READY", originalUrl: mediaUrl }] } : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message ?? `LinkedIn API ${res.status}`);
  }
  const id = res.headers.get("x-restli-id") ?? "";
  return `https://www.linkedin.com/feed/update/${id}`;
}

async function postTwitter(token: string, content: string) {
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: content }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message ?? "X API error");
  const id = data.data?.id;
  return `https://x.com/i/web/status/${id}`;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { uid?: string; workspace_id?: string; content?: string; media_url?: string; platforms?: string[] };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { uid, workspace_id, content, media_url, platforms } = body;
  if (!uid || !content || !platforms?.length) {
    return new Response(JSON.stringify({ error: "uid, content, and platforms are required" }), { status: 400 });
  }

  const results: Record<string, { success: boolean; post_url?: string; error?: string }> = {};

  for (const platform of platforms) {
    if (!TEXT_POSTABLE.has(platform)) {
      results[platform] = { success: false, error: "not_supported" };
      continue;
    }
    try {
      const conn = await getConnection(uid, platform, workspace_id);
      if (!conn) { results[platform] = { success: false, error: "not_connected" }; continue; }

      let postUrl = "";
      if (platform === "facebook") postUrl = await postFacebook(conn.account_id, conn.access_token, content, media_url);
      else if (platform === "linkedin") postUrl = await postLinkedIn(conn.account_id, conn.access_token, content, media_url);
      else if (platform === "twitter") postUrl = await postTwitter(conn.access_token, content);

      results[platform] = { success: true, post_url: postUrl };
    } catch (err: any) {
      results[platform] = { success: false, error: err.message };
    }
  }

  // Save record
  const anySuccess = Object.values(results).some(r => r.success);
  await supabase.from("scheduled_posts").insert({
    uid, workspace_id: workspace_id ?? null, content, media_url: media_url ?? "", platforms,
    status: anySuccess ? "published" : "failed",
    results, published_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({ results }), { headers: { "Content-Type": "application/json" } });
}