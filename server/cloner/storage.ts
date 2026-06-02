import type {
  ClonerExcelUpload,
  ClonerJob,
  ClonerJobStatus,
  ClonerJobSummary,
  NodeChange,
  ParsedExcel,
  SiteMapping
} from "../../shared/types.js";
import { requireSupabaseAdmin } from "../supabaseAdmin.js";

// Persistence for the n8n cloner (Phase 4). Mirrors the patterns in
// server/storage.ts: the service-role client (requireSupabaseAdmin) plus
// snake_case row interfaces with explicit row<->domain mappers.
//
// Reads are additionally scoped by user_id at the query level. The service role
// bypasses RLS, so the per-user filter — not the RLS policy — is what guarantees
// a caller only ever sees their own jobs through these functions.

interface ClonerJobRow {
  id: string;
  user_id: string;
  source_workflow_id: string;
  source_workflow_name: string;
  new_domain: string;
  new_site_url: string;
  wp_username: string;
  sheet_id: string;
  sheet_url: string;
  status: ClonerJobStatus;
  mapping: SiteMapping;
  changes: NodeChange[];
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

type ClonerJobSummaryRow = Omit<ClonerJobRow, "user_id" | "mapping" | "changes">;

interface ClonerExcelUploadRow {
  id: string;
  job_id: string;
  file_name: string;
  sheet_count: number;
  total_rows: number;
  parsed_data: ParsedExcel;
  created_at: string;
}

/** Columns selected for the history list — excludes the large mapping/changes jsonb. */
const JOB_SUMMARY_COLUMNS =
  "id, source_workflow_id, source_workflow_name, new_domain, new_site_url, wp_username, sheet_id, sheet_url, status, error_message, created_at, updated_at";

/** Fields of a cloner_jobs row that may be patched after creation. */
export interface ClonerJobUpdate {
  status?: ClonerJobStatus;
  source_workflow_name?: string;
  new_domain?: string;
  new_site_url?: string;
  wp_username?: string;
  sheet_id?: string;
  sheet_url?: string;
  mapping?: SiteMapping;
  changes?: NodeChange[];
  error_message?: string | null;
}

/** INSERT a new clone job. */
export async function saveJob(job: ClonerJob): Promise<ClonerJob> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase.from("cloner_jobs").insert(jobToRow(job)).select("*").single();

  if (error) throw new Error(error.message);
  return rowToJob(data as ClonerJobRow);
}

/** UPDATE a clone job in place (status transitions, results, error message). */
export async function updateJob(id: string, updates: ClonerJobUpdate): Promise<ClonerJob | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("cloner_jobs")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToJob(data as ClonerJobRow) : null;
}

/** SELECT a single job owned by the given user (RLS / per-user scoped). */
export async function getJob(id: string, userId: string): Promise<ClonerJob | null> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("cloner_jobs")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? rowToJob(data as ClonerJobRow) : null;
}

/** SELECT the user's clone history, newest first. */
export async function listJobs(userId: string, limit = 50): Promise<ClonerJobSummary[]> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("cloner_jobs")
    .select(JOB_SUMMARY_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data ?? []) as ClonerJobSummaryRow[]).map(rowToJobSummary);
}

/** INSERT the parsed Excel upload that fed a clone, linked to its job. */
export async function saveExcelUpload(upload: ClonerExcelUpload): Promise<ClonerExcelUpload> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await supabase
    .from("cloner_excel_uploads")
    .insert(uploadToRow(upload))
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return rowToUpload(data as ClonerExcelUploadRow);
}

// --- Row <-> domain mappers -------------------------------------------------

function jobToRow(job: ClonerJob): ClonerJobRow {
  return {
    id: job.id,
    user_id: job.userId,
    source_workflow_id: job.sourceWorkflowId,
    source_workflow_name: job.sourceWorkflowName,
    new_domain: job.newDomain,
    new_site_url: job.newSiteUrl,
    wp_username: job.wpUsername,
    sheet_id: job.sheetId,
    sheet_url: job.sheetUrl,
    status: job.status,
    mapping: job.mapping,
    changes: job.changes,
    error_message: job.errorMessage,
    created_at: job.createdAt,
    updated_at: job.updatedAt
  };
}

function rowToJob(row: ClonerJobRow): ClonerJob {
  return {
    id: row.id,
    userId: row.user_id,
    sourceWorkflowId: row.source_workflow_id,
    sourceWorkflowName: row.source_workflow_name,
    newDomain: row.new_domain,
    newSiteUrl: row.new_site_url,
    wpUsername: row.wp_username,
    sheetId: row.sheet_id,
    sheetUrl: row.sheet_url,
    status: row.status,
    mapping: row.mapping,
    changes: row.changes ?? [],
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowToJobSummary(row: ClonerJobSummaryRow): ClonerJobSummary {
  return {
    id: row.id,
    sourceWorkflowId: row.source_workflow_id,
    sourceWorkflowName: row.source_workflow_name,
    newDomain: row.new_domain,
    newSiteUrl: row.new_site_url,
    wpUsername: row.wp_username,
    sheetId: row.sheet_id,
    sheetUrl: row.sheet_url,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function uploadToRow(upload: ClonerExcelUpload): ClonerExcelUploadRow {
  return {
    id: upload.id,
    job_id: upload.jobId,
    file_name: upload.fileName,
    sheet_count: upload.sheetCount,
    total_rows: upload.totalRows,
    parsed_data: upload.parsedData,
    created_at: upload.createdAt
  };
}

function rowToUpload(row: ClonerExcelUploadRow): ClonerExcelUpload {
  return {
    id: row.id,
    jobId: row.job_id,
    fileName: row.file_name,
    sheetCount: row.sheet_count,
    totalRows: row.total_rows,
    parsedData: row.parsed_data,
    createdAt: row.created_at
  };
}
