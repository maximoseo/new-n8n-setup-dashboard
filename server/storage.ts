import type {
  ChecklistItem,
  ChatMessage,
  DiscoveryCheck,
  HtmlTemplateBundle,
  KeywordRow,
  PromptBundle,
  Site,
  SiteLanguage,
  SiteStatus,
  SiteType,
  SocialLinks,
  StyleProfile,
  TextDirection,
  UserSettings
} from "../shared/types.js";
import { requireSupabaseAdmin } from "./supabaseAdmin.js";

interface SiteRow {
  id: string;
  url: string;
  name: string;
  language: SiteLanguage;
  direction: TextDirection;
  site_type: SiteType;
  sitemap_url: string;
  about_page_url: string;
  contact_page_url: string;
  style_profile: StyleProfile;
  logo_url: string;
  logo_verified: boolean;
  phone: string;
  whatsapp: string;
  social_links: SocialLinks;
  author_name: string;
  author_bio: string;
  author_image_url: string;
  google_sheets_url: string;
  webhook_url: string;
  github_repo_url: string | null;
  prompts: PromptBundle;
  workflow: Site["workflow"];
  html_template: HtmlTemplateBundle;
  keywords: KeywordRow[];
  checks: DiscoveryCheck[];
  status: SiteStatus;
  chat_history: ChatMessage[];
  created_at: string;
  updated_at: string;
}

interface UserSettingsRow {
  user_id: string;
  theme: UserSettings["theme"];
  ahrefs_api_key_encrypted: string | null;
  dataforseo_login_encrypted: string | null;
  llm_provider_key_encrypted: string | null;
  github_token_encrypted: string | null;
}

export async function listSites(userId: string): Promise<Site[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("sites")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as SiteRow[]).map(rowToSite);
}

export async function getSite(siteId: string, userId: string): Promise<Site | undefined> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("sites").select("*").eq("id", siteId).eq("user_id", userId).maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToSite(data as SiteRow) : undefined;
}

export async function upsertSite(site: Site, userId: string): Promise<Site> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("sites").upsert(siteToRow(site, userId), { onConflict: "id" }).select("*").single();

  if (error) throw new Error(error.message);
  return rowToSite(data as SiteRow);
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToUserSettings(data as UserSettingsRow) : { theme: "system" };
}

export async function upsertUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
  const supabase = requireSupabaseAdmin();
  const current = await getUserSettings(userId);
  const next = { ...current, ...settings };
  const { data, error } = await supabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        theme: next.theme,
        ahrefs_api_key_encrypted: next.ahrefsApiKeyEncrypted ?? null,
        dataforseo_login_encrypted: next.dataforseoLoginEncrypted ?? null,
        llm_provider_key_encrypted: next.llmProviderKeyEncrypted ?? null,
        github_token_encrypted: next.githubTokenEncrypted ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return rowToUserSettings(data as UserSettingsRow);
}

function rowToSite(row: SiteRow): Site {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    language: row.language,
    direction: row.direction,
    siteType: row.site_type,
    sitemapUrl: row.sitemap_url,
    aboutPageUrl: row.about_page_url,
    contactPageUrl: row.contact_page_url,
    styleProfile: row.style_profile,
    logoUrl: row.logo_url,
    logoVerified: row.logo_verified,
    phone: row.phone,
    whatsapp: row.whatsapp,
    socialLinks: row.social_links,
    authorName: row.author_name,
    authorBio: row.author_bio,
    authorImageUrl: row.author_image_url,
    googleSheetsUrl: row.google_sheets_url,
    webhookUrl: row.webhook_url,
    githubRepoUrl: row.github_repo_url ?? undefined,
    prompts: row.prompts,
    workflow: row.workflow,
    htmlTemplate: row.html_template,
    keywords: row.keywords,
    checks: row.checks,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    chatHistory: row.chat_history
  };
}

function siteToRow(site: Site, userId: string) {
  return {
    id: site.id,
    user_id: userId,
    url: site.url,
    name: site.name,
    language: site.language,
    direction: site.direction,
    site_type: site.siteType,
    sitemap_url: site.sitemapUrl,
    about_page_url: site.aboutPageUrl,
    contact_page_url: site.contactPageUrl,
    style_profile: site.styleProfile,
    logo_url: site.logoUrl,
    logo_verified: site.logoVerified,
    phone: site.phone,
    whatsapp: site.whatsapp,
    social_links: site.socialLinks,
    author_name: site.authorName,
    author_bio: site.authorBio,
    author_image_url: site.authorImageUrl,
    google_sheets_url: site.googleSheetsUrl,
    webhook_url: site.webhookUrl,
    github_repo_url: site.githubRepoUrl ?? null,
    prompts: site.prompts,
    workflow: site.workflow,
    html_template: site.htmlTemplate,
    keywords: site.keywords,
    checks: site.checks,
    status: site.status,
    chat_history: site.chatHistory,
    created_at: site.createdAt,
    updated_at: site.updatedAt
  };
}

function rowToUserSettings(row: UserSettingsRow): UserSettings {
  return {
    theme: row.theme,
    ahrefsApiKeyEncrypted: row.ahrefs_api_key_encrypted,
    dataforseoLoginEncrypted: row.dataforseo_login_encrypted,
    llmProviderKeyEncrypted: row.llm_provider_key_encrypted,
    githubTokenEncrypted: row.github_token_encrypted
  };
}
