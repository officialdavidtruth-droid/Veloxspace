export type PlanId = "starter" | "pro" | "agency";

export interface PlanConfig {
  id: PlanId;
  name: string;
  price: number;
  description: string;
  maxPlatforms: number;
  maxTeamMembers: number;
  maxWorkspaces: number;
  adsAnalytics: boolean;
  aiInsightsPerDay: number;
  composerScheduling: boolean;
  approvalWorkflow: boolean;
  contentLibrary: boolean;
  pdfReports: boolean;
  clientViewer: boolean;
  multiWorkspace: boolean;
  pms: boolean;
  leadScraper: boolean;
  color: string;
  badge?: string;
}

export const PLANS: Record<PlanId, PlanConfig> = {
  starter: {
    id: "starter", name: "Starter", price: 0,
    description: "For individuals getting started with analytics",
    maxPlatforms: 3, maxTeamMembers: 0, maxWorkspaces: 1,
    adsAnalytics: false, aiInsightsPerDay: 3,
    composerScheduling: false, approvalWorkflow: false,
    contentLibrary: false, pdfReports: false,
    clientViewer: false, multiWorkspace: false,
    pms: false, leadScraper: false,
    color: "var(--muted)",
  },
  pro: {
    id: "pro", name: "Pro", price: 29,
    description: "For professionals and small teams running real campaigns",
    maxPlatforms: -1, maxTeamMembers: 4, maxWorkspaces: 1,
    adsAnalytics: true, aiInsightsPerDay: -1,
    composerScheduling: true, approvalWorkflow: true,
    contentLibrary: true, pdfReports: true,
    clientViewer: false, multiWorkspace: false,
    pms: false, leadScraper: false,
    color: "var(--primary)", badge: "Most popular",
  },
  agency: {
    id: "agency", name: "Agency", price: 79,
    description: "For agencies managing multiple brands and clients",
    maxPlatforms: -1, maxTeamMembers: -1, maxWorkspaces: 10,
    adsAnalytics: true, aiInsightsPerDay: -1,
    composerScheduling: true, approvalWorkflow: true,
    contentLibrary: true, pdfReports: true,
    clientViewer: true, multiWorkspace: true,
    pms: true, leadScraper: true,
    color: "#9333ea", badge: "For agencies",
  },
};

export const PLAN_FEATURES: { key: keyof PlanConfig; label: string }[] = [
  { key: "maxPlatforms",       label: "Connected platforms"    },
  { key: "adsAnalytics",       label: "Ads Analytics"          },
  { key: "aiInsightsPerDay",   label: "AI insights / day"      },
  { key: "composerScheduling", label: "Scheduled publishing"   },
  { key: "approvalWorkflow",   label: "Approval workflow"      },
  { key: "contentLibrary",     label: "Content library"        },
  { key: "pdfReports",         label: "PDF exports"            },
  { key: "maxTeamMembers",     label: "Team seats"             },
  { key: "clientViewer",       label: "Client viewer access"   },
  { key: "multiWorkspace",     label: "Multiple workspaces"    },
  { key: "pms",                label: "Business Management"    },
  { key: "leadScraper",        label: "AI Lead Finder"         },
];

export function formatLimit(key: keyof PlanConfig, value: any): string {
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (value === -1) return "Unlimited";
  if (value === 0 && key === "maxTeamMembers") return "Just you";
  return String(value);
}