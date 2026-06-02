import { Router } from "express";
import type { Request, RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { z } from "zod";
import { analyzeWorkflow, cloneWorkflow } from "./engine.js";
import { parseExcel } from "./excel-parser.js";
import { N8nClient } from "./n8n-client.js";
import { GoogleSheetsClient, getGoogleAccessToken } from "./sheet-creator.js";
import { getJob, listJobs, saveExcelUpload, saveJob, updateJob } from "./storage.js";
import type {
  CloneChangeSummary,
  CloneResult,
  ClonePreview,
  N8nWorkflow,
  N8nWorkflowSummary,
  NodeChange,
  ParsedExcel,
  SiteMapping
} from "../../shared/types.js";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

interface ClonerSession {
  id: string;
  instanceUrl: string;
  apiKey: string;
  createdAt: number;
}

// In-memory session + upload stores (Phase 1/2 scope — no DB persistence yet).
// n8n credentials never leave the server; they are looked up per request by session id.
const sessions = new Map<string, ClonerSession>();
const excelUploads = new Map<string, ParsedExcel>();

class SessionError extends Error {}

/** An error carrying an HTTP status + a user-facing (English) message, with the raw cause in `detail`. */
class ClonerError extends Error {
  readonly status: number;
  readonly detail?: string;
  constructor(message: string, options: { status?: number; detail?: string } = {}) {
    super(message);
    this.name = "ClonerError";
    this.status = options.status ?? 502;
    this.detail = options.detail;
  }
}

/** Map a raw upstream error message to an HTTP status + an English, operator-facing message. */
function describeError(raw: string, action?: string): { message: string; status: number } {
  const suffix = action ? ` (${action})` : "";
  if (/timeout|aborted|aborterror|timed out/i.test(raw)) {
    return { status: 504, message: `n8n request timed out (30s)${suffix}. Try again.` };
  }
  if (/\b(401|403)\b|unauthorized|forbidden|invalid api key/i.test(raw)) {
    return { status: 401, message: `Authentication with n8n failed${suffix} — check that your Instance URL and API Key are correct.` };
  }
  if (/\b404\b|not found/i.test(raw)) {
    return { status: 404, message: `Resource not found in n8n${suffix} — the workflow may have been deleted.` };
  }
  if (/\b429\b|rate limit|too many requests/i.test(raw)) {
    return { status: 429, message: `n8n rate limit reached${suffix}. Try again in a few seconds.` };
  }
  if (/econnrefused|enotfound|eai_again|fetch failed|network|getaddrinfo/i.test(raw)) {
    return { status: 502, message: `Cannot reach n8n server${suffix} — check the Instance URL and your network connection.` };
  }
  if (/google/i.test(raw)) {
    return { status: 502, message: `Google Sheets operation failed${suffix} — check your Google permissions and credentials.` };
  }
  return { status: 502, message: `External operation failed${suffix}: ${raw}` };
}

/** Run an external (n8n / Google) API call, translating low-level failures into English ClonerErrors. */
async function runExternal<T>(action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ClonerError) throw error;
    const raw = error instanceof Error ? error.message : String(error);
    const { message, status } = describeError(raw, action);
    throw new ClonerError(message, { status, detail: raw });
  }
}

/** Best-effort persistence: a storage failure must never break an otherwise successful clone. */
async function persist(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error("[cloner] persistence skipped:", error instanceof Error ? error.message : error);
  }
}

/** Drop plaintext secrets from a mapping before it is written to the database. */
function sanitizeMapping(mapping: SiteMapping): SiteMapping {
  return { ...mapping, wpAppPassword: "", smtpPass: "" };
}

/** The authenticated Supabase user id (set by authMiddleware). */
function requireUserId(request: Request): string {
  if (!request.userId) throw new SessionError("Re-authentication required — no authenticated user found");
  return request.userId;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

export const clonerRouter = Router();

// --- Validation schemas -----------------------------------------------------

const connectSchema = z.object({
  instanceUrl: z.string().min(3),
  apiKey: z.string().min(1)
});

const sheetTabMappingSchema = z.object({
  excelSheet: z.string(),
  sourceGid: z.number().nullable().default(null),
  sourceName: z.string().nullable().default(null),
  targetName: z.string(),
  targetGid: z.number().nullable().default(null),
  isNewTab: z.boolean().optional(),
  confidence: z.number().optional()
});

const mappingSchema = z.object({
  oldDomain: z.string(),
  newDomain: z.string(),
  wpUrl: z.string().default(""),
  wpUsername: z.string().default(""),
  wpAppPassword: z.string().default(""),
  newSheetId: z.string().default(""),
  newSheetUrl: z.string().default(""),
  newSheetTitle: z.string().default(""),
  sheetTabMappings: z.array(sheetTabMappingSchema).default([]),
  gsheetsCredentialId: z.string().default(""),
  gsheetsCredentialName: z.string().default(""),
  wpCredentialId: z.string().default(""),
  smtpEnabled: z.boolean().default(false),
  smtpHost: z.string().default(""),
  smtpPort: z.number().default(587),
  smtpUser: z.string().default(""),
  smtpPass: z.string().default(""),
  smtpCredentialId: z.string().default(""),
  newWorkflowName: z.string().default("")
});

const analyzeSchema = z.object({
  workflowId: z.string().optional(),
  workflow: z.record(z.unknown()).optional()
});

const previewSchema = z.object({
  sourceWorkflowId: z.string(),
  mapping: mappingSchema
});

const cloneSchema = z.object({
  sourceWorkflowId: z.string(),
  mapping: mappingSchema,
  options: z
    .object({
      activate: z.boolean().optional(),
      createSheet: z.boolean().optional(),
      sheetTitle: z.string().optional(),
      shareWithEmail: z.string().optional()
    })
    .optional()
});

// --- Helpers ----------------------------------------------------------------

/** Wrap an async route so thrown errors become clean JSON responses (Zod -> central 400 handler). */
function handle(fn: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next) => {
    fn(request, response).catch((error: unknown) => {
      if (error instanceof z.ZodError) {
        next(error);
        return;
      }
      if (error instanceof SessionError) {
        response.status(401).json({ ok: false, error: error.message });
        return;
      }
      if (error instanceof ClonerError) {
        response.status(error.status).json({ ok: false, error: error.message, detail: error.detail });
        return;
      }
      // Fallback: translate any other upstream failure into an English message (raw kept in `detail`).
      const raw = error instanceof Error ? error.message : "Unexpected error";
      const { message, status } = describeError(raw);
      response.status(status).json({ ok: false, error: message, detail: raw });
    });
  };
}

function getSession(request: Request): ClonerSession {
  const id = request.header("x-cloner-session");
  if (!id) throw new SessionError("No active n8n connection — connect first (Step 1)");
  const session = sessions.get(id);
  if (!session) throw new SessionError("Session not found — reconnect to n8n");
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(id);
    excelUploads.delete(id);
    throw new SessionError("Session expired — reconnect to n8n");
  }
  return session;
}

function clientFor(request: Request): N8nClient {
  const session = getSession(request);
  return new N8nClient(session.instanceUrl, session.apiKey);
}

/** Domain without protocol/trailing slash, for display + naming. */
function cleanLabel(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function defaultSheetTitle(mapping: SiteMapping): string {
  return mapping.newSheetTitle || `${cleanLabel(mapping.newDomain)} - N8N`;
}

function sumMappedRows(excel: ParsedExcel, mapping: SiteMapping): number {
  let total = 0;
  for (const tab of mapping.sheetTabMappings) {
    const sheet = excel.sheets.find((candidate) => candidate.name === tab.excelSheet);
    if (sheet) total += sheet.rowCount;
  }
  return total;
}

function emptySummary(): CloneChangeSummary {
  return {
    googleSheetsNodes: 0,
    wordpressNodes: 0,
    httpRequestNodes: 0,
    codeNodes: 0,
    emailNodes: 0,
    credentialsCreated: 0,
    totalChanges: 0
  };
}

function countNodes(changes: NodeChange[], predicate: (type: string) => boolean): number {
  const names = new Set<string>();
  for (const change of changes) {
    if (predicate(change.nodeType)) names.add(change.nodeName);
  }
  return names.size;
}

function buildSummary(changes: NodeChange[], credentialsCreated: number): CloneChangeSummary {
  return {
    googleSheetsNodes: countNodes(changes, (type) => type === "n8n-nodes-base.googleSheets"),
    wordpressNodes: countNodes(changes, (type) => type === "n8n-nodes-base.wordpress"),
    httpRequestNodes: countNodes(changes, (type) => type === "n8n-nodes-base.httpRequest"),
    codeNodes: countNodes(changes, (type) => type === "n8n-nodes-base.code"),
    emailNodes: countNodes(changes, (type) => type.toLowerCase().includes("email") || type.toLowerCase().includes("smtp")),
    credentialsCreated,
    totalChanges: changes.length
  };
}

// --- Routes -----------------------------------------------------------------

// POST /api/cloner/connect — validate the n8n connection, open a 30-min session.
clonerRouter.post(
  "/connect",
  handle(async (request, response) => {
    const { instanceUrl, apiKey } = connectSchema.parse(request.body);
    const client = new N8nClient(instanceUrl, apiKey);
    await runExternal("Testing connection", () => client.testConnection());
    const workflows = await runExternal("Loading workflow list", () => client.listAllWorkflows());

    const id = randomUUID();
    sessions.set(id, { id, instanceUrl, apiKey, createdAt: Date.now() });
    response.json({ ok: true, sessionId: id, workflowCount: workflows.length, expiresInMs: SESSION_TTL_MS });
  })
);

// GET /api/cloner/workflows — list workflows (proxied from n8n) with light analysis + search.
clonerRouter.get(
  "/workflows",
  handle(async (request, response) => {
    const client = clientFor(request);
    const search = typeof request.query.search === "string" ? request.query.search.toLowerCase() : "";
    const workflows = await runExternal("Loading workflow list", () => client.listAllWorkflows());

    const summaries: N8nWorkflowSummary[] = workflows.map((workflow) => {
      const analysis = analyzeWorkflow(workflow);
      return {
        id: workflow.id ?? "",
        name: workflow.name ?? "",
        active: Boolean(workflow.active),
        nodeCount: analysis.totalNodes,
        domains: analysis.domains
      };
    });

    const filtered = search
      ? summaries.filter((summary) => summary.name.toLowerCase().includes(search) || summary.domains.some((domain) => domain.includes(search)))
      : summaries;

    response.json({ ok: true, workflows: filtered });
  })
);

// GET /api/cloner/workflow/:id — full workflow JSON + node analysis.
clonerRouter.get(
  "/workflow/:id",
  handle(async (request, response) => {
    const client = clientFor(request);
    const workflowId = Array.isArray(request.params.id) ? request.params.id[0] ?? "" : request.params.id;
    const workflow = await runExternal("Loading workflow", () => client.getWorkflow(workflowId));
    response.json({ ok: true, workflow, analysis: analyzeWorkflow(workflow) });
  })
);

// POST /api/cloner/analyze — analyze a workflow by id (proxy) or from a posted JSON body.
clonerRouter.post(
  "/analyze",
  handle(async (request, response) => {
    const body = analyzeSchema.parse(request.body);
    let workflow: N8nWorkflow;
    if (body.workflow) {
      workflow = body.workflow as unknown as N8nWorkflow;
    } else if (body.workflowId) {
      const workflowId = body.workflowId;
      workflow = await runExternal("Loading workflow", () => clientFor(request).getWorkflow(workflowId));
    } else {
      response.status(400).json({ ok: false, error: "Must provide workflowId or workflow" });
      return;
    }
    response.json({ ok: true, analysis: analyzeWorkflow(workflow) });
  })
);

// POST /api/cloner/preview — dry-run the clone in memory and report what would change.
clonerRouter.post(
  "/preview",
  handle(async (request, response) => {
    const body = previewSchema.parse(request.body);
    const session = getSession(request);
    const client = new N8nClient(session.instanceUrl, session.apiKey);
    const source = await runExternal("Loading source workflow", () => client.getWorkflow(body.sourceWorkflowId));
    const mapping: SiteMapping = body.mapping;

    const { workflow, changes } = cloneWorkflow(source, mapping);
    const uploaded = excelUploads.get(session.id);
    const preview: ClonePreview = {
      workflowName: workflow.name,
      totalNodes: (workflow.nodes ?? []).length,
      nodesToChange: new Set(changes.map((change) => change.nodeName)).size,
      changes,
      sheetPreview: {
        title: defaultSheetTitle(mapping),
        tabs: mapping.sheetTabMappings.map((tab) => tab.targetName),
        totalRows: uploaded ? sumMappedRows(uploaded, mapping) : 0
      }
    };

    response.json({ ok: true, preview });
  })
);

// POST /api/cloner/clone — execute: create sheet (optional) -> WP credential (optional) -> clone -> activate.
clonerRouter.post(
  "/clone",
  handle(async (request, response) => {
    const body = cloneSchema.parse(request.body);
    const session = getSession(request);
    const userId = request.userId ?? "";
    const client = new N8nClient(session.instanceUrl, session.apiKey);
    const source = await runExternal("Loading source workflow", () => client.getWorkflow(body.sourceWorkflowId));
    const mapping: SiteMapping = body.mapping;
    const options = body.options ?? {};

    // Record the job as in-progress up front so failures still appear in the history.
    const jobId = randomUUID();
    const startedAt = new Date().toISOString();
    await persist(() =>
      saveJob({
        id: jobId,
        userId,
        sourceWorkflowId: body.sourceWorkflowId,
        sourceWorkflowName: source.name ?? "",
        newDomain: mapping.newDomain,
        newSiteUrl: mapping.wpUrl,
        wpUsername: mapping.wpUsername,
        sheetId: mapping.newSheetId,
        sheetUrl: mapping.newSheetUrl,
        status: "cloning",
        mapping: sanitizeMapping(mapping),
        changes: [],
        errorMessage: null,
        createdAt: startedAt,
        updatedAt: startedAt
      })
    );

    try {
      const result: CloneResult = { ok: true, sheet: null, workflow: null, changes: [], summary: emptySummary() };
      let credentialsCreated = 0;

      // Phase A — create the Google Sheet from the uploaded Excel and rewire the mapping.
      if (options.createSheet) {
        const excel = excelUploads.get(session.id);
        if (!excel) throw new ClonerError("No Excel file found for this session — upload a file first (Step 3)", { status: 400 });
        const accessToken = await runExternal("Getting Google token", () => getGoogleAccessToken());
        const sheets = new GoogleSheetsClient(accessToken);
        const title = options.sheetTitle || defaultSheetTitle(mapping);
        const created = await runExternal("Creating Google Sheet", () =>
          sheets.createFromExcel(excel, title, mapping.sheetTabMappings, options.shareWithEmail)
        );

        mapping.newSheetId = created.spreadsheetId;
        mapping.newSheetUrl = created.url;
        mapping.newSheetTitle = title;
        for (const tab of created.tabs) {
          const tabMapping = mapping.sheetTabMappings.find((candidate) => candidate.targetName === tab.name);
          if (tabMapping) tabMapping.targetGid = tab.gid;
        }

        result.sheet = {
          spreadsheetId: created.spreadsheetId,
          url: created.url,
          tabsCreated: created.tabs.map((tab) => tab.name),
          rowsWritten: created.tabs.reduce((total, tab) => total + (tab.rowsWritten ?? 0), 0)
        };
      }

      // Phase A.5 — create a fresh WordPress credential when full details are supplied.
      if (mapping.wpUrl && mapping.wpUsername && mapping.wpAppPassword) {
        const credential = await runExternal("Creating WordPress credential", () =>
          client.createCredential({
            name: `${cleanLabel(mapping.newDomain)} - WordPress`,
            type: "wordpressApi",
            data: { username: mapping.wpUsername, password: mapping.wpAppPassword, url: mapping.wpUrl }
          })
        );
        mapping.wpCredentialId = credential.id;
        credentialsCreated += 1;
      }

      // Phase B — transform the workflow JSON and create it on the instance.
      const { workflow: clonedWorkflow, changes } = cloneWorkflow(source, mapping);
      const createdWorkflow = await runExternal("Creating cloned workflow", () => client.createWorkflow(clonedWorkflow));
      result.changes = changes;

      // Phase C — activate the new workflow when requested.
      let active = false;
      const newId = createdWorkflow.id;
      if (options.activate && newId) {
        await runExternal("Activating workflow", () => client.activateWorkflow(newId));
        active = true;
      }

      const newWorkflowId = createdWorkflow.id ?? "";
      result.workflow = {
        id: newWorkflowId,
        name: createdWorkflow.name ?? clonedWorkflow.name,
        url: `${session.instanceUrl.replace(/\/+$/, "")}/workflow/${newWorkflowId}`,
        active
      };
      result.summary = buildSummary(changes, credentialsCreated);

      // Persist the completed job + the Excel upload that fed it (best-effort).
      await persist(() =>
        updateJob(jobId, {
          status: "done",
          source_workflow_name: source.name ?? "",
          sheet_id: mapping.newSheetId,
          sheet_url: mapping.newSheetUrl,
          mapping: sanitizeMapping(mapping),
          changes
        })
      );
      const excelForJob = excelUploads.get(session.id);
      if (excelForJob) {
        await persist(() =>
          saveExcelUpload({
            id: randomUUID(),
            jobId,
            fileName: excelForJob.fileName,
            sheetCount: excelForJob.sheetCount,
            totalRows: excelForJob.sheets.reduce((total, sheet) => total + sheet.rowCount, 0),
            parsedData: excelForJob,
            createdAt: new Date().toISOString()
          })
        );
      }

      response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await persist(() => updateJob(jobId, { status: "failed", error_message: message }));
      throw error;
    }
  })
);

// GET /api/cloner/jobs — the authenticated user's clone history (newest first).
clonerRouter.get(
  "/jobs",
  handle(async (request, response) => {
    const userId = requireUserId(request);
    const limit = Math.min(Number(request.query.limit) || 50, 200);
    const jobs = await listJobs(userId, limit);
    response.json({ ok: true, jobs });
  })
);

// GET /api/cloner/jobs/:id — full detail for a single clone job (RLS-scoped to the user).
clonerRouter.get(
  "/jobs/:id",
  handle(async (request, response) => {
    const userId = requireUserId(request);
    const id = Array.isArray(request.params.id) ? request.params.id[0] ?? "" : request.params.id;
    const job = await getJob(id, userId);
    if (!job) {
      response.status(404).json({ ok: false, error: "Clone job not found" });
      return;
    }
    response.json({ ok: true, job });
  })
);

// POST /api/cloner/upload-excel — parse an uploaded .xlsx and cache its structure for the session.
clonerRouter.post(
  "/upload-excel",
  upload.single("file"),
  handle(async (request, response) => {
    const session = getSession(request);
    const file = request.file;
    if (!file) {
      response.status(400).json({ ok: false, error: "No file uploaded (use multipart field named 'file')" });
      return;
    }

    const parsed = parseExcel(file.buffer, { fileName: file.originalname });
    excelUploads.set(session.id, parsed);

    response.json({
      ok: true,
      fileName: parsed.fileName,
      sheets: parsed.sheets.map((sheet) => ({ name: sheet.name, columns: sheet.headers, rowCount: sheet.rowCount }))
    });
  })
);
