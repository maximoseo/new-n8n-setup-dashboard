import type {
  ClonePreview,
  CloneResult,
  ClonerJob,
  ClonerJobSummary,
  N8nWorkflow,
  N8nWorkflowSummary,
  Site,
  SiteInput,
  SiteMapping,
  UserSettings,
  WorkflowAnalysis
} from "../shared/types";
import { supabase } from "./lib/supabase";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const headers = {
    "content-type": "application/json",
    ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
    ...(options?.headers ?? {})
  };
  const response = await fetch(url, {
    headers,
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchSites() {
  return request<{ sites: Site[] }>("/api/sites");
}

export function fetchUserSettings() {
  return request<{ settings: UserSettings }>("/api/user-settings");
}

export function updateUserSettings(settings: Partial<UserSettings>) {
  return request<{ settings: UserSettings }>("/api/user-settings", {
    method: "PATCH",
    body: JSON.stringify(settings)
  });
}

export function createSite(input: SiteInput) {
  return request<{ site: Site }>("/api/sites", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function runDiscovery(siteId: string) {
  return request<{ site: Site }>(`/api/sites/${siteId}/discover`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function generateArtifacts(siteId: string) {
  return request<{ site: Site }>(`/api/sites/${siteId}/generate-artifacts`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function updateSite(siteId: string, patch: Partial<Site>) {
  return request<{ site: Site }>(`/api/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

// ============================================================================
// n8n Workflow + Google Sheets Cloner
// All routes live under /api/cloner and require the Supabase bearer token
// (added by request<T>) plus an X-Cloner-Session header once connected.
// ============================================================================

const CLONER_SESSION_HEADER = "X-Cloner-Session";

export interface ClonerConnectResult {
  ok: boolean;
  sessionId: string;
  workflowCount: number;
  expiresInMs: number;
}

/** One parsed sheet returned by POST /api/cloner/upload-excel. */
export interface UploadedExcelSheet {
  name: string;
  columns: string[];
  rowCount: number;
}

export interface UploadExcelResult {
  ok: boolean;
  fileName: string;
  sheets: UploadedExcelSheet[];
}

export interface CloneOptions {
  activate?: boolean;
  createSheet?: boolean;
  sheetTitle?: string;
  shareWithEmail?: string;
}

function clonerHeaders(sessionId: string): Record<string, string> {
  return { [CLONER_SESSION_HEADER]: sessionId };
}

/** Validate an n8n instance URL + API key and open a 30-minute server session. */
export function clonerConnect(instanceUrl: string, apiKey: string) {
  return request<ClonerConnectResult>("/api/cloner/connect", {
    method: "POST",
    body: JSON.stringify({ instanceUrl, apiKey })
  });
}

/** List workflows (with light analysis) for the active session; optional server-side search. */
export function clonerListWorkflows(sessionId: string, search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : "";
  return request<{ ok: boolean; workflows: N8nWorkflowSummary[] }>(`/api/cloner/workflows${query}`, {
    headers: clonerHeaders(sessionId)
  });
}

/** Fetch one workflow's full JSON plus its clonable-element analysis. */
export function clonerGetWorkflow(sessionId: string, workflowId: string) {
  return request<{ ok: boolean; workflow: N8nWorkflow; analysis: WorkflowAnalysis }>(
    `/api/cloner/workflow/${encodeURIComponent(workflowId)}`,
    { headers: clonerHeaders(sessionId) }
  );
}

/** Upload an .xlsx file (cached server-side for the clone) and get its sheet structure back. */
export async function clonerUploadExcel(sessionId: string, file: File): Promise<UploadExcelResult> {
  const form = new FormData();
  form.append("file", file);

  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const response = await fetch("/api/cloner/upload-excel", {
    method: "POST",
    // No content-type header — the browser sets the multipart boundary itself.
    headers: {
      ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
      [CLONER_SESSION_HEADER]: sessionId
    },
    body: form
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<UploadExcelResult>;
}

/** Dry-run the clone in memory and report what would change (no sheet/workflow created). */
export function clonerPreview(sessionId: string, sourceWorkflowId: string, mapping: SiteMapping) {
  return request<{ ok: boolean; preview: ClonePreview }>("/api/cloner/preview", {
    method: "POST",
    headers: clonerHeaders(sessionId),
    body: JSON.stringify({ sourceWorkflowId, mapping })
  });
}

/** Execute the clone: create the Google Sheet, WP credential, cloned workflow, then activate. */
export function clonerClone(sessionId: string, sourceWorkflowId: string, mapping: SiteMapping, options: CloneOptions) {
  return request<CloneResult>("/api/cloner/clone", {
    method: "POST",
    headers: clonerHeaders(sessionId),
    body: JSON.stringify({ sourceWorkflowId, mapping, options })
  });
}

/** List the signed-in user's clone history (no n8n session required — uses the Supabase token). */
export function clonerListJobs(limit?: number) {
  const query = limit ? `?limit=${limit}` : "";
  return request<{ ok: boolean; jobs: ClonerJobSummary[] }>(`/api/cloner/jobs${query}`);
}

/** Fetch the full detail of a single past clone job. */
export function clonerGetJob(id: string) {
  return request<{ ok: boolean; job: ClonerJob }>(`/api/cloner/jobs/${encodeURIComponent(id)}`);
}
