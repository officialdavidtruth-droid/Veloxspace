import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const SITE_URL = process.env.SITE_URL || process.env.VITE_SITE_URL || "";
const REDIRECT_URI = `${SITE_URL}/api/oauth-callback`;

async function upsertConn(uid: string, platform: string, accountId: string, accountName: string, token: string, connected: boolean, pictureUrl: string = "", workspaceId: string = "") {
  await supabase.from("platform_connections").upsert({
    id: `${workspaceId || uid}_${platform}`, uid, workspace_id: workspaceId || null, platform,
    account_id: accountId, account_name: accountName, profile_picture_url: pictureUrl,
    access_token: token, connected, last_synced_at: new Date().toISOString(),
  });
}

// Meta — exchanges code, finds the user's Facebook Page + linked Instagram Business Account
async function exchangeMeta(code: string, uid: string, workspaceId: string = "") {
  const appId = process.env.META_APP_ID || process.env.VITE_META_APP_ID;
  const shortRes = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=authorization_code` +
    `&client_id=${appId}&client_secret=${process.env.META_APP_SECRET}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&code=${code}`
  );
  const short = await shortRes.json();
  if (short.error) throw new Error(short.error.message);

  const longRes = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${appId}&client_secret=${process.env.META_APP_SECRET}` +
    `&fb_exchange_token=${short.access_token}`
  );
  const long = await longRes.json();
  const userToken = long.access_token || short.access_token;

  // Find the user's Pages + any linked Instagram Business Account
  const pagesRes = await fetch(
    `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,picture.type(large),instagram_business_account{id,username,name,profile_picture_url}&access_token=${userToken}`
  );
  const pagesData = await pagesRes.json();
  if (pagesData.error) throw new Error(pagesData.error.message);
  const page = pagesData.data?.[0];

  if (!page) {
    // No Page found — still save a Facebook connection using the user token,
    // but mark Instagram as unavailable.
    await upsertConn(uid, "facebook", "", "No Facebook Page found", userToken, false, workspaceId);
    await upsertConn(uid, "instagram", "", "No Instagram Business Account linked", "", false, workspaceId);
    return;
  }

  const pageToken = page.access_token || userToken;
  await upsertConn(uid, "facebook", page.id, page.name ?? "Facebook Page", pageToken, true, page.picture?.data?.url ?? "", workspaceId);

  const ig = page.instagram_business_account;
  if (ig) {
    await upsertConn(uid, "instagram", ig.id, ig.username ?? ig.name ?? "Instagram Account", pageToken, true, ig.profile_picture_url ?? "", workspaceId);
  } else {
    await upsertConn(uid, "instagram", "", "No Instagram Business Account linked to this Page", "", false, workspaceId);
  }

  // Also look for an ad account (for Meta Ads analytics)
  try {
    const adRes = await fetch(`https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${userToken}`);
    const adData = await adRes.json();
    const account = adData.data?.find((a: any) => a.account_status === 1) ?? adData.data?.[0];
    if (account) {
      await upsertConn(uid, "meta_ads", account.id, account.name || "Meta Ad Account", userToken, true, workspaceId);
    } else {
      await upsertConn(uid, "meta_ads", "", "No ad account found", "", false, workspaceId);
    }
  } catch {
    await upsertConn(uid, "meta_ads", "", "No ad account access", "", false, workspaceId);
  }
}

async function exchangeGoogle(code: string, uid: string, workspaceId: string = "") {
  const body = new URLSearchParams({
    code, grant_type: "authorization_code",
    client_id: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const chRes = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${data.access_token}` } }
  );
  const chData = await chRes.json();
  const ch = chData.items?.[0];

  const tokenPayload = JSON.stringify({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? "",
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
  });

  const channelPic = ch?.snippet?.thumbnails?.default?.url ?? "";
  await upsertConn(uid, "youtube", ch?.id ?? "", ch?.snippet?.title ?? "YouTube Channel", tokenPayload, true, channelPic, workspaceId);
  await upsertConn(uid, "google_ads", "google_ads", "Google Ads Account", tokenPayload, true, workspaceId);
}

async function exchangeTikTok(code: string, uid: string, workspaceId: string = "") {
  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: process.env.TIKTOK_CLIENT_KEY || process.env.VITE_TIKTOK_CLIENT_KEY || "",
      secret: process.env.TIKTOK_CLIENT_SECRET || "",
      auth_code: code,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.message);

  const token = data.data?.access_token ?? "";
  const advertisers = data.data?.advertiser_ids ?? [];
  await upsertConn(uid, "tiktok", advertisers[0] ?? "", data.data?.display_name ?? "TikTok Account", token, true, data.data?.avatar_url ?? "", workspaceId);
}

async function exchangeLinkedIn(code: string, uid: string, workspaceId: string = "") {
  const body = new URLSearchParams({
    grant_type: "authorization_code", code,
    client_id: process.env.LINKEDIN_CLIENT_ID || process.env.VITE_LINKEDIN_CLIENT_ID || "",
    client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
    redirect_uri: REDIRECT_URI,
  });
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description);

  const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = await profileRes.json();

  await upsertConn(uid, "linkedin", profile.sub ?? "", profile.name ?? "LinkedIn Account", data.access_token, true, profile.picture ?? "", workspaceId);
}

async function exchangeTwitter(code: string, verifier: string, uid: string, workspaceId: string = "") {
  const creds = Buffer.from(`${process.env.TWITTER_CLIENT_ID || process.env.VITE_TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    code, grant_type: "authorization_code",
    client_id: process.env.TWITTER_CLIENT_ID || process.env.VITE_TWITTER_CLIENT_ID || "",
    redirect_uri: REDIRECT_URI, code_verifier: verifier,
  });
  const res = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${creds}` },
    body: body.toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);

  const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const me = await meRes.json();
  const pic = (me.data?.profile_image_url ?? "").replace("_normal", "_400x400");

  await upsertConn(uid, "twitter", me.data?.username ?? "", me.data?.name ?? "X Account", data.access_token, true, pic, workspaceId);
}

export default async function handler(req: Request): Promise<Response> {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");

  if (error) return Response.redirect(`${SITE_URL}/?oauth_error=${encodeURIComponent(error)}`, 302);
  if (!code || !state) return Response.redirect(`${SITE_URL}/?oauth_error=missing_params`, 302);

  const parts       = state.split("__");
  const platform    = parts[0];
  const uid         = parts[1];
  const workspaceId = parts[2] ?? "";
  const pkceB64     = parts[3] ?? "";

  if (!platform || !uid) {
    return Response.redirect(`${SITE_URL}/?oauth_error=${encodeURIComponent("invalid_state:" + state)}`, 302);
  }

  try {
    if (platform === "meta") await exchangeMeta(code, uid, workspaceId);
    else if (platform === "google") await exchangeGoogle(code, uid, workspaceId);
    else if (platform === "tiktok") await exchangeTikTok(code, uid, workspaceId);
    else if (platform === "linkedin") await exchangeLinkedIn(code, uid, workspaceId);
    else if (platform === "twitter") {
      const verifier = pkceB64 ? Buffer.from(pkceB64, "base64").toString() : "";
      await exchangeTwitter(code, verifier, uid, workspaceId);
    } else throw new Error(`Unknown platform: ${platform}`);

    return Response.redirect(`${SITE_URL}/?connected=${platform}`, 302);
  } catch (err: any) {
    console.error(`OAuth error [${platform}]:`, err.message);
    return Response.redirect(`${SITE_URL}/?oauth_error=${encodeURIComponent(err.message)}`, 302);
  }
}