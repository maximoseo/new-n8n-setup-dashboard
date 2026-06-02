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

// ============================================================================
// n8n Workflow + Google Sheets Cloner
// ============================================================================

/** n8n resource locator (__rl) pattern used by Google Sheets, Airtable, etc. */
export interface N8nResourceLocator {
  __rl: true;
  value: string | number;
  mode?: string;
  cachedResultName?: string;
  cachedResultUrl?: string;
}

/** A credential reference embedded on an n8n node (by id + display name). */
export interface N8nCredentialRef {
  id?: string;
  name?: string;
}

/** A single node inside an n8n workflow. Loosely typed — parameters vary by node type. */
export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  credentials?: Record<string, N8nCredentialRef>;
  webhookId?: string;
  [key: string]: unknown;
}

/** Full n8n workflow JSON as returned by GET /api/v1/workflows/{id}. */
export interface N8nWorkflow {
  id?: string;
  name: string;
  nodes: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  tags?: Array<string | { id?: string; name?: string }>;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  versionId?: string;
  [key: string]: unknown;
}

/** Condensed workflow info for list/browse views. */
export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number;
  domains: string[];
}

/** Mapping of one Excel sheet → one Google Sheet tab in the clone. */
export interface SheetTabMapping {
  excelSheet: string;
  sourceGid: number | null;
  sourceName: string | null;
  targetName: string;
  targetGid: number | null;
  isNewTab?: boolean;
  confidence?: number;
}

/** All values needed to clone a workflow to a new site. */
export interface SiteMapping {
  // Domain (with protocol, e.g. "https://www.dtapet.com")
  oldDomain: string;
  newDomain: string;
  // WordPress
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
  // Google Sheets (newSheet* are populated after the sheet is created)
  newSheetId: string;
  newSheetUrl: string;
  newSheetTitle: string;
  sheetTabMappings: SheetTabMapping[];
  // n8n credentials
  gsheetsCredentialId: string;
  gsheetsCredentialName: string;
  wpCredentialId: string;
  // SMTP (optional)
  smtpEnabled: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpCredentialId: string;
  // Workflow naming (auto-generated from domain when empty)
  newWorkflowName: string;
}

/** A single field-level change applied to a node during cloning. */
export interface NodeChange {
  nodeName: string;
  nodeType: string;
  change: string;
  old: string | null;
  new: string | null;
  status?: "ok" | "skipped" | "warning";
}

/** Result of cloning a workflow: the adapted JSON plus a full change log. */
export interface CloneWorkflowResult {
  workflow: N8nWorkflow;
  changes: NodeChange[];
}

/** Credential reference surfaced by workflow analysis. */
export interface CredentialRefInfo {
  type?: string;
  id: string | null;
  name: string | null;
  usedByNode?: string;
}

export interface GoogleSheetsNodeInfo {
  nodeName: string;
  documentId: string | number | null;
  documentIdName: string;
  sheetName: string | number | null;
  sheetNameLabel: string;
  sheetGid: string | number | null;
  operation: string;
  credential: CredentialRefInfo | null;
}

export interface WordpressNodeInfo {
  nodeName: string;
  resource: string;
  operation: string;
  credential: CredentialRefInfo | null;
}

export interface HttpRequestNodeInfo {
  nodeName: string;
  url: string;
  method: string;
  hasDomainInUrl: boolean;
}

export interface CodeNodeInfo {
  nodeName: string;
  hasDomainRefs: boolean;
  codeLength: number;
}

export interface EmailNodeInfo {
  nodeName: string;
  nodeType: string;
  credential: CredentialRefInfo | null;
}

export interface OtherNodeInfo {
  nodeName: string;
  nodeType: string;
}

/** Full analysis of an n8n workflow's clonable elements. */
export interface WorkflowAnalysis {
  workflowName: string;
  totalNodes: number;
  domains: string[];
  googleSheetsNodes: GoogleSheetsNodeInfo[];
  wordpressNodes: WordpressNodeInfo[];
  httpRequestNodes: HttpRequestNodeInfo[];
  codeNodes: CodeNodeInfo[];
  emailNodes: EmailNodeInfo[];
  otherNodes: OtherNodeInfo[];
  credentialsUsed: CredentialRefInfo[];
}

/** One parsed sheet/tab from an uploaded .xlsx workbook. */
export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
}

/** Result of parsing an uploaded .xlsx file. */
export interface ParsedExcel {
  fileName: string;
  sheetCount: number;
  sheets: ExcelSheet[];
}

/** Tab spec passed to GoogleSheetsClient.createGoogleSheet(). */
export interface SheetTabSpec {
  name: string;
  index?: number;
}

/** A tab created inside a new Google Sheet (with its numeric gid). */
export interface CreatedSheetTab {
  name: string;
  gid: number;
  rowsWritten?: number;
}

/** Result of creating a new Google Sheet. */
export interface CreatedSheet {
  spreadsheetId: string;
  url: string;
  tabs: CreatedSheetTab[];
}

/** Per-node-type tallies for a clone preview/result, for UI display. */
export interface CloneChangeSummary {
  googleSheetsNodes: number;
  wordpressNodes: number;
  httpRequestNodes: number;
  codeNodes: number;
  emailNodes: number;
  credentialsCreated: number;
  totalChanges: number;
}

/** Preview of what a clone will change, before executing it. */
export interface ClonePreview {
  workflowName: string;
  totalNodes: number;
  nodesToChange: number;
  changes: NodeChange[];
  sheetPreview: {
    title: string;
    tabs: string[];
    totalRows: number;
  };
}

/** The Google Sheet portion of a completed clone. */
export interface CloneResultSheet {
  spreadsheetId: string;
  url: string;
  tabsCreated: string[];
  rowsWritten: number;
}

/** The n8n workflow portion of a completed clone. */
export interface CloneResultWorkflow {
  id: string;
  name: string;
  url: string;
  active: boolean;
}

/** Full result returned by POST /api/cloner/clone. */
export interface CloneResult {
  ok: boolean;
  sheet: CloneResultSheet | null;
  workflow: CloneResultWorkflow | null;
  changes: NodeChange[];
  summary: CloneChangeSummary;
}

// ============================================================================
// Cloner job persistence (Phase 4)
// ============================================================================

/** Lifecycle status of a clone job — mirrors the cloner_jobs.status check constraint. */
export type ClonerJobStatus = "pending" | "connecting" | "uploading" | "cloning" | "done" | "failed";

/** A persisted clone run, stored per-user in the cloner_jobs table. */
export interface ClonerJob {
  id: string;
  userId: string;
  sourceWorkflowId: string;
  sourceWorkflowName: string;
  newDomain: string;
  newSiteUrl: string;
  wpUsername: string;
  sheetId: string;
  sheetUrl: string;
  status: ClonerJobStatus;
  /** The SiteMapping used for the clone, with plaintext secrets stripped before storage. */
  mapping: SiteMapping;
  changes: NodeChange[];
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Condensed job for the history list — omits the heavy mapping/changes payloads. */
export interface ClonerJobSummary {
  id: string;
  sourceWorkflowId: string;
  sourceWorkflowName: string;
  newDomain: string;
  newSiteUrl: string;
  wpUsername: string;
  sheetId: string;
  sheetUrl: string;
  status: ClonerJobStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A persisted Excel upload tied to a clone job (cloner_excel_uploads). */
export interface ClonerExcelUpload {
  id: string;
  jobId: string;
  fileName: string;
  sheetCount: number;
  totalRows: number;
  parsedData: ParsedExcel;
  createdAt: string;
}
