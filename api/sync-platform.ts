/**
 * POST /api/sync-platform
 * Body: { platform: string, account_id: string, access_token: string }
 * Returns: { metrics: SocialMetric, posts: PlatformPost[], error?: string }
 *
 * Fetches real data from each social media platform API.
 * Posts are sorted by engagement so the top performers surface first.
 */

interface SyncResult {
  metrics: Record<string, unknown>;
  posts: Record<string, unknown>[];
  ad_metrics?: { ad_spend: number; revenue: number; clicks: number; impressions: number; conversions: number; leads: number; currency: string };
  error?: string;
}

// ── Instagram Graph API ───────────────────────────────────────────────────────
async function syncInstagram(accountId: string, token: string): Promise<SyncResult> {
  // 1. Profile metrics
  const profileRes = await fetch(
    `https://graph.facebook.com/v18.0/${accountId}?fields=id,name,biography,followers_count,media_count,profile_picture_url,website&access_token=${token}`
  );
  const profile = await profileRes.json();
  if (profile.error) throw new Error(`Instagram: ${profile.error.message}`);

  // 2. Recent media (up to 20 posts)
  const mediaRes = await fetch(
    `https://graph.facebook.com/v18.0/${accountId}/media?fields=id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count&limit=20&access_token=${token}`
  );
  const mediaData = await mediaRes.json();
  if (mediaData.error) throw new Error(`Instagram media: ${mediaData.error.message}`);

  const posts = (mediaData.data ?? []).map((p: any) => ({
    post_id:        p.id,
    caption:        p.caption ?? "",
    media_url:      p.media_type === "VIDEO" ? (p.thumbnail_url ?? "") : (p.media_url ?? ""),
    thumbnail_url:  p.thumbnail_url ?? p.media_url ?? "",
    post_url:       p.permalink ?? "",
    likes:          p.like_count ?? 0,
    comments:       p.comments_count ?? 0,
    shares:         0,
    reach:          0,
    impressions:    0,
    views:          0,
    engagement_rate: profile.followers_count > 0
      ? ((p.like_count + p.comments_count) / profile.followers_count) * 100
      : 0,
    posted_at: p.timestamp,
  }));

  // Sort by engagement rate desc → top posts first
  posts.sort((a: any, b: any) => b.engagement_rate - a.engagement_rate);

  const totalLikes    = posts.reduce((s: number, p: any) => s + p.likes, 0);
  const totalComments = posts.reduce((s: number, p: any) => s + p.comments, 0);
  const avgEngagement = profile.followers_count > 0
    ? ((totalLikes + totalComments) / (posts.length || 1) / profile.followers_count) * 100
    : 0;

  return {
    metrics: {
      followers:       profile.followers_count ?? 0,
      following:       0,
      posts:           profile.media_count ?? 0,
      likes:           totalLikes,
      comments:        totalComments,
      shares:          0,
      reach:           0,
      impressions:     0,
      engagement_rate: parseFloat(avgEngagement.toFixed(4)),
      profile_views:   0,
      profile_picture_url: profile.profile_picture_url ?? "",
    },
    posts: posts.slice(0, 10),
  };
}

// ── Facebook Pages API ────────────────────────────────────────────────────────
async function syncFacebook(pageId: string, token: string): Promise<SyncResult> {
  // 1. Page info
  const pageRes = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}?fields=id,name,followers_count,description,picture.type(large)&access_token=${token}`
  );
  const page = await pageRes.json();
  if (page.error) throw new Error(`Facebook: ${page.error.message}`);

  // 2. Recent posts
  const postsRes = await fetch(
    `https://graph.facebook.com/v18.0/${pageId}/posts?fields=id,message,full_picture,story,created_time,shares,reactions.summary(total_count)&limit=20&access_token=${token}`
  );
  const postsData = await postsRes.json();

  const posts = (postsData.data ?? []).map((p: any) => ({
    post_id:        p.id,
    caption:        p.message ?? p.story ?? "",
    media_url:      p.full_picture ?? "",
    thumbnail_url:  p.full_picture ?? "",
    post_url:       `https://facebook.com/${p.id}`,
    likes:          p.reactions?.summary?.total_count ?? 0,
    comments:       0,
    shares:         p.shares?.count ?? 0,
    reach:          0,
    impressions:    0,
    views:          0,
    engagement_rate: page.followers_count > 0
      ? ((p.reactions?.summary?.total_count ?? 0) + (p.shares?.count ?? 0)) / page.followers_count * 100
      : 0,
    posted_at: p.created_time,
  }));

  posts.sort((a: any, b: any) => b.engagement_rate - a.engagement_rate);

  return {
    metrics: {
      followers:       page.followers_count ?? 0,
      following:       0,
      posts:           posts.length,
      likes:           posts.reduce((s: number, p: any) => s + p.likes, 0),
      comments:        0,
      shares:          posts.reduce((s: number, p: any) => s + p.shares, 0),
      reach:           0,
      impressions:     0,
      engagement_rate: posts.length > 0
        ? posts.reduce((s: number, p: any) => s + p.engagement_rate, 0) / posts.length
        : 0,
      profile_views: 0,
      profile_picture_url: page.picture?.data?.url ?? "",
    },
    posts: posts.slice(0, 10),
  };
}

// ── TikTok Marketing API ──────────────────────────────────────────────────────
async function syncTikTok(advertiserId: string, token: string): Promise<SyncResult> {
  const end   = new Date().toISOString().split("T")[0];
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Campaign report for ad metrics
  const reportRes = await fetch("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
    method: "POST",
    headers: { "Access-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({
      advertiser_id: advertiserId,
      report_type: "BASIC",
      dimensions: ["campaign_id"],
      metrics: ["campaign_name", "spend", "clicks", "impressions", "conversion", "value", "ctr"],
      data_level: "AUCTION_CAMPAIGN",
      start_date: start,
      end_date: end,
      page_size: 10,
    }),
  });
  const report = await reportRes.json();
  if (report.code !== 0) throw new Error(`TikTok: ${report.message}`);

  const list = report.data?.list ?? [];

  const totalSpend  = list.reduce((s: number, i: any) => s + parseFloat(i.metrics?.spend ?? "0"), 0);
  const totalClicks = list.reduce((s: number, i: any) => s + parseInt(i.metrics?.clicks ?? "0"), 0);
  const totalImpr   = list.reduce((s: number, i: any) => s + parseInt(i.metrics?.impressions ?? "0"), 0);
  const avgCtr      = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;

  const posts = list.map((item: any, idx: number) => {
    const m = item.metrics ?? {};
    return {
      post_id:        `campaign_${idx}`,
      caption:        m.campaign_name ?? "Campaign",
      media_url:      "",
      thumbnail_url:  "",
      post_url:       "",
      likes:          0,
      comments:       0,
      shares:         0,
      reach:          parseInt(m.impressions ?? "0"),
      impressions:    parseInt(m.impressions ?? "0"),
      views:          parseInt(m.clicks ?? "0"),
      engagement_rate: parseFloat(m.ctr ?? "0"),
      posted_at:      new Date().toISOString(),
    };
  });

  posts.sort((a: any, b: any) => b.engagement_rate - a.engagement_rate);

  return {
    metrics: {
      followers:       0,
      following:       0,
      posts:           list.length,
      likes:           0,
      comments:        0,
      shares:          0,
      reach:           totalImpr,
      impressions:     totalImpr,
      engagement_rate: parseFloat(avgCtr.toFixed(4)),
      profile_views:   0,
    },
    posts: posts.slice(0, 10),
  };
}

// ── YouTube Data API v3 ───────────────────────────────────────────────────────
// access_token = OAuth2 access token from Google OAuth Playground
// account_id   = YouTube channel ID (e.g. UCxxxxxx)
async function syncYouTube(channelId: string, token: string): Promise<SyncResult> {
  // 1. Channel stats
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=statistics,snippet&id=${channelId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const channelData = await channelRes.json();
  if (channelData.error) throw new Error(`YouTube: ${channelData.error.message}`);
  const ch = channelData.items?.[0];
  const stats = ch?.statistics ?? {};

  // 2. Top videos by view count
  const searchRes = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&order=viewCount&maxResults=10&type=video`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();
  const videoIds = (searchData.items ?? []).map((i: any) => i.id.videoId).join(",");

  let videos: any[] = [];
  if (videoIds) {
    const vidRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const vidData = await vidRes.json();
    videos = vidData.items ?? [];
  }

  const posts = videos.map((v: any) => {
    const vs  = v.statistics ?? {};
    const sub = parseInt(stats.subscriberCount ?? "1") || 1;
    const eng = (parseInt(vs.likeCount ?? "0") + parseInt(vs.commentCount ?? "0")) / sub * 100;
    return {
      post_id:        v.id,
      caption:        v.snippet?.title ?? "",
      media_url:      v.snippet?.thumbnails?.high?.url ?? v.snippet?.thumbnails?.default?.url ?? "",
      thumbnail_url:  v.snippet?.thumbnails?.high?.url ?? "",
      post_url:       `https://youtube.com/watch?v=${v.id}`,
      likes:          parseInt(vs.likeCount ?? "0"),
      comments:       parseInt(vs.commentCount ?? "0"),
      shares:         0,
      reach:          parseInt(vs.viewCount ?? "0"),
      impressions:    parseInt(vs.viewCount ?? "0"),
      views:          parseInt(vs.viewCount ?? "0"),
      engagement_rate: parseFloat(eng.toFixed(4)),
      posted_at:      v.snippet?.publishedAt ?? new Date().toISOString(),
    };
  });

  posts.sort((a: any, b: any) => b.views - a.views);

  return {
    metrics: {
      followers:       parseInt(stats.subscriberCount ?? "0"),
      following:       0,
      posts:           parseInt(stats.videoCount ?? "0"),
      likes:           posts.reduce((s: number, p: any) => s + p.likes, 0),
      comments:        posts.reduce((s: number, p: any) => s + p.comments, 0),
      shares:          0,
      reach:           posts.reduce((s: number, p: any) => s + p.views, 0),
      impressions:     parseInt(stats.viewCount ?? "0"),
      engagement_rate: posts.length > 0
        ? posts.reduce((s: number, p: any) => s + p.engagement_rate, 0) / posts.length
        : 0,
      profile_views:   0,
      profile_picture_url: ch?.snippet?.thumbnails?.default?.url ?? "",
    },
    posts: posts.slice(0, 10),
  };
}

// ── LinkedIn (basic - company pages) ─────────────────────────────────────────
async function syncLinkedIn(orgId: string, token: string): Promise<SyncResult> {
  const orgRes = await fetch(
    `https://api.linkedin.com/v2/organizations/${orgId}?projection=(id,localizedName,followersCount,vanityName)`,
    { headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" } }
  );
  const org = await orgRes.json();
  if (org.serviceErrorCode) throw new Error(`LinkedIn: ${org.message}`);

  // Share statistics (requires organization permission)
  const statsRes = await fetch(
    `https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=urn:li:organization:${orgId}&timeIntervals.timeGranularityType=DAY&timeIntervals.timeRange.start=${Date.now() - 30 * 24 * 60 * 60 * 1000}&timeIntervals.timeRange.end=${Date.now()}`,
    { headers: { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" } }
  );
  const shareStats = await statsRes.json();
  const totalStats = shareStats.elements?.[0]?.totalShareStatistics ?? {};

  return {
    metrics: {
      followers:       org.followersCount ?? 0,
      following:       0,
      posts:           totalStats.shareCount ?? 0,
      likes:           totalStats.likeCount ?? 0,
      comments:        totalStats.commentCount ?? 0,
      shares:          totalStats.shareCount ?? 0,
      reach:           totalStats.impressionCount ?? 0,
      impressions:     totalStats.impressionCount ?? 0,
      engagement_rate: totalStats.impressionCount > 0
        ? ((totalStats.likeCount + totalStats.commentCount) / totalStats.impressionCount) * 100
        : 0,
      profile_views:   0,
    },
    posts: [], // LinkedIn post-level data requires elevated permissions
  };
}

// ── Twitter / X API v2 ────────────────────────────────────────────────────────
// Uses Bearer Token. Full tweet metrics require Basic tier ($100/month).
// Free tier only: account profile (no tweet-level insights).
async function syncTwitter(username: string, token: string): Promise<SyncResult> {
  // Get user by username
  const userRes = await fetch(
    `https://api.twitter.com/2/users/by/username/${username.replace("@","")}?user.fields=public_metrics,description,profile_image_url`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const userData = await userRes.json();
  if (userData.errors) throw new Error(`X: ${userData.errors[0]?.message}`);
  const user = userData.data;
  const m    = user?.public_metrics ?? {};

  // Recent tweets (basic metrics available on free tier)
  let posts: any[] = [];
  try {
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${user.id}/tweets?tweet.fields=public_metrics,created_at,text&max_results=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const tweetsData = await tweetsRes.json();
    if (tweetsData.data) {
      posts = tweetsData.data.map((t: any) => ({
        post_id:        t.id,
        caption:        t.text ?? "",
        media_url:      "",
        thumbnail_url:  "",
        post_url:       `https://x.com/${username}/status/${t.id}`,
        likes:          t.public_metrics?.like_count ?? 0,
        comments:       t.public_metrics?.reply_count ?? 0,
        shares:         t.public_metrics?.retweet_count ?? 0,
        reach:          t.public_metrics?.impression_count ?? 0,
        impressions:    t.public_metrics?.impression_count ?? 0,
        views:          t.public_metrics?.impression_count ?? 0,
        engagement_rate: m.followers_count > 0
          ? ((t.public_metrics?.like_count ?? 0) + (t.public_metrics?.reply_count ?? 0) + (t.public_metrics?.retweet_count ?? 0)) / m.followers_count * 100
          : 0,
        posted_at: t.created_at ?? new Date().toISOString(),
      }));
      posts.sort((a: any, b: any) => b.engagement_rate - a.engagement_rate);
    }
  } catch { /* Tweet metrics may not be available on free tier */ }

  return {
    metrics: {
      followers:       m.followers_count ?? 0,
      following:       m.following_count ?? 0,
      posts:           m.tweet_count ?? 0,
      likes:           m.like_count ?? 0,
      comments:        0,
      shares:          0,
      reach:           0,
      impressions:     0,
      engagement_rate: 0,
      profile_views:   0,
      profile_picture_url: (user?.profile_image_url ?? "").replace("_normal", "_400x400"),
    },
    posts: posts.slice(0, 10),
  };
}

// ── Google Ads API ─────────────────────────────────────────────────────────
// access_token field stores JSON: { access_token, refresh_token, expiry }
async function syncGoogleAds(customerId: string, tokenJson: string): Promise<SyncResult> {
  let tokenData: { access_token: string; refresh_token: string; expiry: number };
  try { tokenData = JSON.parse(tokenJson); } catch { throw new Error("Google Ads: invalid stored token"); }

  let accessToken = tokenData.access_token;

  // Refresh if expired
  if (Date.now() > (tokenData.expiry ?? 0) && tokenData.refresh_token) {
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        refresh_token: tokenData.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const refreshed = await refreshRes.json();
    if (refreshed.error) throw new Error(`Google Ads token refresh: ${refreshed.error_description || refreshed.error}`);
    accessToken = refreshed.access_token;
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!devToken) throw new Error("Google Ads: GOOGLE_ADS_DEVELOPER_TOKEN not configured. Apply for one at ads.google.com/home/tools/manager-accounts/");

  // Resolve a real customer ID if we only have the placeholder
  let cleanId = customerId.replace(/-/g, "");
  if (!cleanId || cleanId === "google_ads") {
    const listRes = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", {
      headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken },
    });
    const listData = await listRes.json();
    if (listData.error) throw new Error(`Google Ads: ${listData.error.message}`);
    cleanId = (listData.resourceNames?.[0] ?? "").replace("customers/", "");
    if (!cleanId) throw new Error("Google Ads: no accessible accounts found for this Google account");
  }

  const query = `
    SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.clicks,
           metrics.impressions, metrics.conversions, metrics.conversions_value, metrics.ctr
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
    ORDER BY metrics.cost_micros DESC LIMIT 10`;

  const res = await fetch(`https://googleads.googleapis.com/v17/customers/${cleanId}/googleAds:search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Google Ads: ${(err as any).error?.message ?? res.statusText}`);
  }
  const data = await res.json();
  const results = (data as any).results ?? [];

  let totalSpend = 0, totalClicks = 0, totalImpr = 0, totalConv = 0, totalRevenue = 0;
  const posts = results.map((r: any) => {
    const spend = (r.metrics.costMicros ?? 0) / 1_000_000;
    const revenue = r.metrics.conversionsValue ?? 0;
    totalSpend += spend; totalClicks += r.metrics.clicks ?? 0;
    totalImpr += r.metrics.impressions ?? 0; totalConv += r.metrics.conversions ?? 0;
    totalRevenue += revenue;
    return {
      post_id: r.campaign.name, caption: r.campaign.name, media_url: "", thumbnail_url: "", post_url: "",
      likes: 0, comments: 0, shares: 0,
      reach: r.metrics.impressions ?? 0, impressions: r.metrics.impressions ?? 0, views: r.metrics.clicks ?? 0,
      engagement_rate: (r.metrics.ctr ?? 0) * 100,
      posted_at: new Date().toISOString(),
    };
  });

  return {
    metrics: {
      followers: 0, following: 0, posts: results.length, likes: 0, comments: 0, shares: 0,
      reach: totalImpr, impressions: totalImpr,
      engagement_rate: totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0,
      profile_views: 0, profile_picture_url: "",
    },
    posts: posts.slice(0, 10),
    ad_metrics: {
      ad_spend: totalSpend, revenue: totalRevenue, clicks: totalClicks,
      impressions: totalImpr, conversions: Math.round(totalConv), leads: 0, currency: "USD",
    },
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  let body: { platform?: string; account_id?: string; access_token?: string; workspace_id?: string; uid?: string };
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const { platform, account_id, access_token, workspace_id } = body;
  if (!platform || !access_token) {
    return new Response(JSON.stringify({ error: "platform and access_token are required" }), { status: 400 });
  }

  try {
    let result: SyncResult;
    switch (platform) {
      case "instagram": result = await syncInstagram(account_id ?? "", access_token); break;
      case "facebook":  result = await syncFacebook(account_id ?? "", access_token);  break;
      case "tiktok":    result = await syncTikTok(account_id ?? "", access_token);    break;
      case "youtube":   result = await syncYouTube(account_id ?? "", access_token);   break;
      case "linkedin":  result = await syncLinkedIn(account_id ?? "", access_token);  break;
      case "twitter":   result = await syncTwitter(account_id ?? "", access_token);   break;
      case "google_ads": result = await syncGoogleAds(account_id ?? "", access_token); break;
      default: return new Response(JSON.stringify({ error: `Unknown platform: ${platform}` }), { status: 400 });
    }

    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error(`Sync ${platform} error:`, err.message);
    return new Response(
      JSON.stringify({ error: err.message, metrics: null, posts: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
};

// Note: google_ads uses the same Google OAuth token stored in platform_connections
// The sync-platform function handles "youtube" → YouTube analytics
// For google_ads, the Google token (stored as JSON) contains both access+refresh token
