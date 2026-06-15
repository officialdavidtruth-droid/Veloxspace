# VeloxSpace — Vercel Build

## Deploy steps

### 1. Run the database migration
Supabase → SQL Editor → paste `supabase/migration.sql` → Run

### 2. Push this code to GitHub
Open your GitHub repo in GitHub.dev (press `.`), replace all files,
commit and push.

### 3. Import into Vercel
1. Go to vercel.com → New Project
2. Import your GitHub repo
3. Vercel auto-detects Vite — leave all build settings as-is
4. Click **Deploy** (first deploy will fail — that's fine, env vars aren't set yet)

### 4. Add environment variables
Vercel → Project → Settings → Environment Variables

**Required:**
```
VITE_SUPABASE_URL              https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY         eyJ...
SUPABASE_URL                   https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY      eyJ...
CLOUDFLARE_ACCOUNT_ID          abc123
CLOUDFLARE_API_TOKEN           abc123
VITE_SITE_URL                  https://your-project.vercel.app
SITE_URL                       https://your-project.vercel.app
```

**Meta (Instagram + Facebook + Ads):**
```
VITE_META_APP_ID               your-facebook-app-id
META_APP_SECRET                your-facebook-app-secret
```

**Google (YouTube + Google Ads):**
```
VITE_GOOGLE_CLIENT_ID          xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET           GOCSPX-xxx
GOOGLE_ADS_DEVELOPER_TOKEN     your-dev-token
```

**Lead Finder:**
```
GOOGLE_PLACES_API_KEY          AIzaSy...
```

**Optional (add when ready):**
```
VITE_TIKTOK_APP_ID             your-tiktok-app-id
TIKTOK_APP_SECRET              your-tiktok-secret
VITE_LINKEDIN_CLIENT_ID        your-linkedin-client-id
LINKEDIN_CLIENT_SECRET         your-linkedin-secret
VITE_TWITTER_CLIENT_ID         your-twitter-client-id
TWITTER_CLIENT_SECRET          your-twitter-secret
PAYSTACK_SECRET_KEY            sk_live_xxx
FLUTTERWAVE_SECRET_KEY         FLWSECK_xxx
```

### 5. Redeploy
After adding env vars: Vercel → Deployments → Redeploy (top-most deployment)

### 6. Update OAuth redirect URI
In your Meta, Google, TikTok, LinkedIn, and X developer portals,
update the redirect/callback URI to:
```
https://your-project.vercel.app/api/oauth-callback
```

---

## File structure
```
api/                    ← Vercel serverless functions (was netlify/functions/)
  ai-insights.ts
  oauth-callback.ts
  publish-post.ts
  scrape-leads.ts
  sync-ads-breakdowns.ts
  sync-platform.ts
src/
  App.tsx
  components/           ← 14 components
  lib/                  ← supabase, workspace, plans, platforms, theme
  types.ts
  index.css
supabase/
  migration.sql         ← Run this once in Supabase SQL Editor
vercel.json             ← Vercel config (replaces netlify.toml)
```

## Differences from Netlify build
- `netlify/functions/*.mts` → `api/*.ts`
- `netlify.toml` → `vercel.json`
- All function logic is identical — only the file locations changed
