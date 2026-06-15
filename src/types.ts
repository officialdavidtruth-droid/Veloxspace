export type PlatformId = "instagram" | "facebook" | "linkedin" | "twitter" | "tiktok" | "youtube" | "google_ads" | "meta_ads";

export interface PlatformConnection {
  id: string;
  uid: string;
  platform: PlatformId;
  account_id: string;
  account_name: string;
  profile_picture_url?: string;
  access_token: string;
  connected: boolean;
  last_synced_at: string | null;
}

export interface SocialMetric {
  id: string;
  uid: string;
  platform: PlatformId;
  followers: number;
  following: number;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  profile_views: number;
  profile_picture_url?: string;
  synced_at: string;
}

export interface PlatformPost {
  id: string;
  uid: string;
  platform: PlatformId;
  post_id: string;
  caption: string;
  media_url: string;
  thumbnail_url: string;
  post_url: string;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  views: number;
  engagement_rate: number;
  posted_at: string;
  synced_at: string;
}

export interface AIInsight {
  id: string;
  uid: string;
  platform: PlatformId | "all";
  overall_score: number;
  top_platform: string;
  key_insight: string;
  working: string[];
  not_working: string[];
  recommendations: {
    platform: string;
    priority: "high" | "medium" | "low";
    title: string;
    description: string;
    action: string;
  }[];
  best_times: Record<string, string>;
  content_insight: string;
  generated_at: string;
}

export interface AdMetric {
  id: string;
  uid: string;
  platform: PlatformId | "all";
  period_label: string;
  ad_spend: number;
  revenue: number;
  clicks: number;
  impressions: number;
  conversions: number;
  leads: number;
  currency: string;
  recorded_at: string;
}

export interface AdBreakdown {
  id: string;
  uid: string;
  platform: PlatformId | "all";
  dimension: "age" | "gender" | "country" | "device" | "placement";
  dimension_value: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  recorded_at: string;
}

export interface MetricHistory {
  id: string;
  uid: string;
  platform: PlatformId | "all";
  date: string;
  followers: number;
  following: number;
  posts: number;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  profile_views: number;
  recorded_at: string;
}

export interface AdCampaign {
  id: string;
  uid: string;
  platform: PlatformId | "all";
  campaign_name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  recorded_at: string;
}

export interface ScheduledPost {
  id: string;
  uid: string;
  content: string;
  media_url: string;
  platforms: PlatformId[];
  status: "draft" | "scheduled" | "published" | "failed";
  results: Record<string, { success: boolean; post_url?: string; error?: string }>;
  scheduled_for: string | null;
  created_at: string;
  published_at: string | null;
}

export type PlanId = "starter" | "pro" | "agency";
export type WorkspaceType = "individual" | "agency";
export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface Workspace {
  id: string;
  name: string;
  type: WorkspaceType;
  plan: PlanId;
  owner_uid: string;
  created_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  uid: string;
  email: string;
  role: MemberRole;
  status: "active" | "pending";
  created_at: string;
}

export interface AppUser {
  uid: string;
  email: string;
  name: string;
}

export interface MetricDefinition {
  abbr: string;
  full: string;
  formula: string;
  description: string;
  benchmark: string;
  type: "ratio" | "percentage" | "currency" | "number";
  higherIsBetter: boolean;
  color: string;
}

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  color: string;
  bgColor: string;
  darkBgColor: string;
  handle: string;
  description: string;
  canPost: boolean;
}