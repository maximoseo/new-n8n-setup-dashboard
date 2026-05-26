export type SiteLanguage = "he" | "en";
export type TextDirection = "rtl" | "ltr";
export type SiteType = "regular" | "ecommerce";
export type SiteStatus =
  | "input"
  | "discovery"
  | "keywords"
  | "prompts"
  | "workflow"
  | "template"
  | "testing"
  | "review"
  | "deployed";

export interface DiscoveryCheck {
  id: string;
  label: string;
  status: "pending" | "running" | "pass" | "warn" | "fail";
  message?: string;
}

export interface StyleProfile {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  fontFamily: string;
  borderRadius: string;
  shadow: string;
  spacing: "tight" | "balanced" | "airy";
  palette: string[];
}

export interface SocialLinks {
  facebook?: string;
  linkedin?: string;
  instagram?: string;
  youtube?: string;
  tiktok?: string;
}

export interface KeywordRow {
  id: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  currentRank: number | null;
  clusterGroup: string;
  source: "sitemap" | "brand" | "manual" | "api";
}

export interface PromptBundle {
  writingBlog: string;
  imagePlanning: string;
  htmlRedesign: string;
  validation: {
    n8nExpressionsIntact: boolean;
    unresolvedVariables: string[];
    expressionCount: number;
  };
}

export interface WorkflowNodePreview {
  id: string;
  name: string;
  type: string;
  status: "configured" | "needs_attention";
  details: string;
}

export interface WorkflowBundle {
  json: Record<string, unknown>;
  nodePreview: WorkflowNodePreview[];
  validation: {
    configuredNodes: number;
    attentionNodes: number;
    missingFields: string[];
  };
}

export interface ChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface HtmlTemplateBundle {
  html: string;
  checklist: ChecklistItem[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  templateDiff?: string;
}

export interface SiteInput {
  url: string;
  googleSheetsUrl: string;
  webhookUrl: string;
  aboutPageUrl?: string;
  sitemapUrl?: string;
  language?: SiteLanguage;
  siteType?: SiteType;
}

export interface Site {
  id: string;
  url: string;
  name: string;
  language: SiteLanguage;
  direction: TextDirection;
  siteType: SiteType;
  sitemapUrl: string;
  aboutPageUrl: string;
  contactPageUrl: string;
  styleProfile: StyleProfile;
  logoUrl: string;
  logoVerified: boolean;
  phone: string;
  whatsapp: string;
  socialLinks: SocialLinks;
  authorName: string;
  authorBio: string;
  authorImageUrl: string;
  googleSheetsUrl: string;
  webhookUrl: string;
  githubRepoUrl?: string;
  prompts: PromptBundle;
  workflow: WorkflowBundle;
  htmlTemplate: HtmlTemplateBundle;
  keywords: KeywordRow[];
  checks: DiscoveryCheck[];
  status: SiteStatus;
  createdAt: string;
  updatedAt: string;
  chatHistory: ChatMessage[];
}

export interface AppState {
  sites: Site[];
}

export type ThemeMode = "light" | "dark" | "system";

export interface UserSettings {
  theme: ThemeMode;
  ahrefsApiKeyEncrypted?: string | null;
  dataforseoLoginEncrypted?: string | null;
  llmProviderKeyEncrypted?: string | null;
  githubTokenEncrypted?: string | null;
}
