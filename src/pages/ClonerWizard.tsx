import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  CloudUpload,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Globe2,
  History,
  Home,
  Info,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Mail,
  PlugZap,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  User,
  Workflow,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, InputHTMLAttributes, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  clonerClone,
  clonerConnect,
  clonerGetWorkflow,
  clonerListJobs,
  clonerListWorkflows,
  clonerPreview,
  clonerUploadExcel
} from "../api";
import type { CloneOptions, UploadedExcelSheet } from "../api";
import { ThemeToggle } from "../components/ThemeToggle";
import type {
  ClonePreview,
  CloneResult,
  ClonerJobStatus,
  ClonerJobSummary,
  CredentialRefInfo,
  N8nWorkflowSummary,
  SheetTabMapping,
  SiteMapping,
  WorkflowAnalysis
} from "../../shared/types";

const STEPS = [
  { id: 1, label: "Connect", icon: PlugZap },
  { id: 2, label: "Select", icon: Search },
  { id: 3, label: "Upload", icon: FileSpreadsheet },
  { id: 4, label: "Configure", icon: Globe2 },
  { id: 5, label: "Clone", icon: CheckCircle2 }
] as const;

const DEFAULT_INSTANCE_URL = "https://websiseo.app.n8n.cloud/";
const NEW_TAB = "__new__";
const SKIP_TAB = "__skip__";

const URL_RE = /^https?:\/\/.+\..+/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip protocol + trailing slash: "https://www.dtapet.com/" -> "www.dtapet.com". */
function cleanDomain(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "").trim();
}

function credentialLabel(credential?: CredentialRefInfo | null): string {
  if (!credential || !credential.id) return "—";
  const id = credential.id.length > 8 ? `${credential.id.slice(0, 6)}…` : credential.id;
  return credential.name ? `${credential.name} (${id})` : id;
}

export default function ClonerWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  // Step 1 — connection (kept in memory only, never persisted to localStorage)
  const [instanceUrl, setInstanceUrl] = useState(DEFAULT_INSTANCE_URL);
  const [apiKey, setApiKey] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [workflowCount, setWorkflowCount] = useState<number | null>(null);
  const [expiresInMs, setExpiresInMs] = useState<number | null>(null);

  // Step 2 — workflow selection
  const [workflows, setWorkflows] = useState<N8nWorkflowSummary[]>([]);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [analysis, setAnalysis] = useState<WorkflowAnalysis | null>(null);

  // Step 3 — Excel upload
  const [excelName, setExcelName] = useState("");
  const [uploadedSheets, setUploadedSheets] = useState<UploadedExcelSheet[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string[][]>>({});
  const [tabChoices, setTabChoices] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 4 — new site details
  const [oldDomain, setOldDomain] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [wpUrl, setWpUrl] = useState("");
  const [wpUsername, setWpUsername] = useState("");
  const [wpAppPassword, setWpAppPassword] = useState("");
  const [sheetTitle, setSheetTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [gsheetsCredentialId, setGsheetsCredentialId] = useState("");
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState("smtp.gmail.com");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [activate, setActivate] = useState(true);
  const [wpTest, setWpTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [sheetsTest, setSheetsTest] = useState<{ ok: boolean; message: string } | null>(null);

  // Step 5 — preview + result
  const [preview, setPreview] = useState<ClonePreview | null>(null);
  const [result, setResult] = useState<CloneResult | null>(null);

  // Confirmation dialog, transient toast, and clone-history panel
  const [confirmClone, setConfirmClone] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [jobs, setJobs] = useState<ClonerJobSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const connected = Boolean(sessionId);

  // Auto-dismiss the toast after a few seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Source Google Sheet tabs referenced by the selected workflow (name + numeric gid).
  const sourceTabs = useMemo(() => {
    if (!analysis) return [] as Array<{ name: string; gid: number | null }>;
    const map = new Map<string, number | null>();
    for (const node of analysis.googleSheetsNodes) {
      const name = (node.sheetNameLabel ?? "").trim();
      if (!name || map.has(name)) continue;
      const raw = node.sheetGid;
      const gid = typeof raw === "number" ? raw : raw != null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null;
      map.set(name, gid);
    }
    return Array.from(map, ([name, gid]) => ({ name, gid }));
  }, [analysis]);

  // Existing googleSheetsOAuth2Api credentials to reuse, derived from the workflow analysis.
  const gsheetCredOptions = useMemo(() => {
    if (!analysis) return [] as Array<{ id: string; name: string }>;
    const map = new Map<string, string>();
    for (const credential of analysis.credentialsUsed) {
      if ((credential.type ?? "").toLowerCase().includes("googlesheets") && credential.id) {
        map.set(credential.id, credential.name ?? credential.id);
      }
    }
    for (const node of analysis.googleSheetsNodes) {
      if (node.credential?.id) map.set(node.credential.id, node.credential.name ?? node.credential.id);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [analysis]);

  const allDomains = useMemo(() => {
    const set = new Set<string>();
    for (const workflow of workflows) for (const domain of workflow.domains) set.add(domain);
    return Array.from(set).sort();
  }, [workflows]);

  const filteredWorkflows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return workflows.filter((workflow) => {
      const matchesSearch =
        !term || workflow.name.toLowerCase().includes(term) || workflow.domains.some((domain) => domain.includes(term));
      const matchesDomain = !domainFilter || workflow.domains.includes(domainFilter);
      return matchesSearch && matchesDomain;
    });
  }, [workflows, search, domainFilter]);

  function fail(err: unknown) {
    setError(err instanceof Error ? err.message : "An unexpected error occurred");
  }

  function effectiveChoice(sheetName: string): string {
    if (tabChoices[sheetName] != null) return tabChoices[sheetName];
    // Auto-match an Excel sheet to one of the workflow's tabs, else create a new tab.
    const lower = sheetName.toLowerCase();
    const exact = sourceTabs.find((tab) => tab.name.toLowerCase() === lower);
    if (exact) return exact.name;
    const contains = sourceTabs.find(
      (tab) => tab.name.toLowerCase().includes(lower) || lower.includes(tab.name.toLowerCase())
    );
    if (contains) return contains.name;
    return NEW_TAB;
  }

  function buildSheetTabMappings(): SheetTabMapping[] {
    const mappings: SheetTabMapping[] = [];
    for (const sheet of uploadedSheets) {
      const choice = effectiveChoice(sheet.name);
      if (choice === SKIP_TAB) continue;
      if (choice === NEW_TAB) {
        mappings.push({ excelSheet: sheet.name, sourceGid: null, sourceName: null, targetName: sheet.name, targetGid: null, isNewTab: true });
        continue;
      }
      const source = sourceTabs.find((tab) => tab.name === choice);
      mappings.push({
        excelSheet: sheet.name,
        sourceGid: source?.gid ?? null,
        sourceName: choice,
        targetName: choice,
        targetGid: null,
        isNewTab: false
      });
    }
    return mappings;
  }

  function buildMapping(): SiteMapping {
    const selectedCred = gsheetCredOptions.find((option) => option.id === gsheetsCredentialId);
    return {
      oldDomain,
      newDomain,
      wpUrl,
      wpUsername,
      wpAppPassword,
      newSheetId: "",
      newSheetUrl: "",
      newSheetTitle: sheetTitle,
      sheetTabMappings: buildSheetTabMappings(),
      gsheetsCredentialId,
      gsheetsCredentialName: selectedCred?.name ?? "",
      wpCredentialId: "",
      smtpEnabled,
      smtpHost,
      smtpPort: Number(smtpPort) || 587,
      smtpUser,
      smtpPass,
      smtpCredentialId: "",
      newWorkflowName: ""
    };
  }

  async function handleConnect() {
    if (!instanceUrl.trim() || !apiKey.trim()) {
      setError("Please enter both the Instance URL and API Key");
      return;
    }
    setError("");
    setBusy("Connecting to n8n and verifying…");
    try {
      const connect = await clonerConnect(instanceUrl.trim(), apiKey.trim());
      setSessionId(connect.sessionId);
      setWorkflowCount(connect.workflowCount);
      setExpiresInMs(connect.expiresInMs);
      // Prefetch the workflow list so step 2 is ready immediately.
      const list = await clonerListWorkflows(connect.sessionId);
      setWorkflows(list.workflows);
    } catch (err) {
      setSessionId("");
      fail(err);
    } finally {
      setBusy("");
    }
  }

  async function handleSelectWorkflow(workflow: N8nWorkflowSummary) {
    setSelectedWorkflowId(workflow.id);
    setAnalysis(null);
    setError("");
    setBusy(`Analyzing "${workflow.name}"…`);
    try {
      const detail = await clonerGetWorkflow(sessionId, workflow.id);
      setAnalysis(detail.analysis);
      // Seed the new-site form from the detected source domain + credential.
      setOldDomain(detail.analysis.domains[0] ?? "");
      const firstCred = detail.analysis.credentialsUsed.find((credential) =>
        (credential.type ?? "").toLowerCase().includes("googlesheets")
      );
      if (firstCred?.id) setGsheetsCredentialId(firstCred.id);
    } catch (err) {
      fail(err);
    } finally {
      setBusy("");
    }
  }

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Only .xlsx files are supported");
      return;
    }
    setError("");
    setBusy(`Uploading and parsing ${file.name}…`);
    try {
      const uploaded = await clonerUploadExcel(sessionId, file);
      setExcelName(uploaded.fileName);
      setUploadedSheets(uploaded.sheets);
      setTabChoices({});
      // Parse client-side as well to preview the first rows of each sheet.
      try {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const rows: Record<string, string[][]> = {};
        for (const name of workbook.SheetNames) {
          const sheet = workbook.Sheets[name];
          const json = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" }) as unknown[][];
          rows[name] = json.slice(0, 4).map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
        }
        setPreviewRows(rows);
      } catch {
        setPreviewRows({});
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy("");
    }
  }

  function onFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  function testWordPress() {
    if (!wpUrl.trim() || !/^https?:\/\//i.test(wpUrl.trim())) {
      setWpTest({ ok: false, message: "WordPress URL is missing or invalid (must start with http/https)" });
      return;
    }
    if (!wpUsername.trim() || !wpAppPassword.trim()) {
      setWpTest({ ok: false, message: "Please enter a username and App Password" });
      return;
    }
    setWpTest({ ok: true, message: "✓ Details are valid. WordPress connection will be verified during cloning." });
  }

  function testSheets() {
    if (!gsheetsCredentialId) {
      setSheetsTest({ ok: false, message: "Please select a Google Sheets OAuth2 credential" });
      return;
    }
    if (!sheetTitle.trim()) {
      setSheetsTest({ ok: false, message: "Please enter a title for the new sheet" });
      return;
    }
    if (buildSheetTabMappings().length === 0) {
      setSheetsTest({ ok: false, message: "No sheets to map — go back to Step 3" });
      return;
    }
    setSheetsTest({ ok: true, message: "✓ Credential selected and title set. Sheet will be created during cloning." });
  }

  async function handlePreview() {
    if (!newDomain.trim()) {
      setError("Please enter a new domain");
      return;
    }
    setError("");
    setBusy("Preparing preview of changes…");
    try {
      const response = await clonerPreview(sessionId, selectedWorkflowId, buildMapping());
      setPreview(response.preview);
      setResult(null);
      setStep(5);
    } catch (err) {
      fail(err);
    } finally {
      setBusy("");
    }
  }

  async function loadJobs() {
    setHistoryBusy(true);
    try {
      const response = await clonerListJobs(50);
      setJobs(response.jobs);
      setHistoryLoaded(true);
    } catch (err) {
      fail(err);
    } finally {
      setHistoryBusy(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && !historyLoaded) void loadJobs();
  }

  async function confirmAndClone() {
    setConfirmClone(false);
    await handleClone();
  }

  async function handleClone() {
    setError("");
    setBusy("Cloning workflow — creating sheet, credentials, and activating…");
    try {
      const options: CloneOptions = {
        activate,
        createSheet: uploadedSheets.length > 0 && buildSheetTabMappings().length > 0,
        sheetTitle: sheetTitle.trim() || undefined,
        shareWithEmail: shareEnabled && shareEmail.trim() ? shareEmail.trim() : undefined
      };
      const response = await clonerClone(sessionId, selectedWorkflowId, buildMapping(), options);
      setResult(response);
      const ok = response.ok && Boolean(response.workflow);
      setToast({
        tone: ok ? "success" : "error",
        message: ok ? "Workflow cloned successfully!" : "Clone completed with errors — check the results"
      });
      // Refresh history so the new clone appears immediately.
      setHistoryLoaded(false);
      if (historyOpen) void loadJobs();
    } catch (err) {
      fail(err);
      setToast({ tone: "error", message: err instanceof Error ? err.message : "Clone failed" });
    } finally {
      setBusy("");
    }
  }

  // Copy a value to the clipboard with a transient toast (visual-only, no API call).
  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast({ tone: "success", message: `${label} copied to clipboard` });
    } catch {
      setToast({ tone: "error", message: "Could not copy — please copy manually" });
    }
  }

  // Share a URL via the native share sheet, falling back to clipboard copy.
  async function shareUrl(url: string) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "n8n Workflow Clone", url });
      } catch {
        /* user dismissed the native share sheet */
      }
      return;
    }
    await copyText(url, "Link");
  }

  function resetForAnother() {
    setSelectedWorkflowId("");
    setAnalysis(null);
    setExcelName("");
    setUploadedSheets([]);
    setPreviewRows({});
    setTabChoices({});
    setOldDomain("");
    setNewDomain("");
    setWpUrl("");
    setWpUsername("");
    setWpAppPassword("");
    setSheetTitle("");
    setTitleEdited(false);
    setSmtpEnabled(false);
    setShareEnabled(false);
    setShareEmail("");
    setWpTest(null);
    setSheetsTest(null);
    setPreview(null);
    setResult(null);
    setError("");
    setStep(2);
  }

  function updateNewDomain(value: string) {
    setNewDomain(value);
    if (!titleEdited) {
      const clean = cleanDomain(value);
      setSheetTitle(clean ? `${clean} - N8N Automations` : "");
    }
  }

  const canAdvanceFrom: Record<number, boolean> = {
    1: connected,
    2: Boolean(selectedWorkflowId && analysis),
    3: uploadedSheets.length > 0,
    4: Boolean(newDomain.trim()),
    5: true
  };

  return (
    <div dir="ltr" className="relative min-h-screen bg-paper text-ink antialiased">
      {/* Subtle dotted texture behind everything, faded toward the bottom. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-dotgrid opacity-70 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
      />

      <header className="sticky top-0 z-30 border-b border-white/10 bg-gradient-to-r from-blue-600/95 to-indigo-700/95 shadow-lg shadow-blue-900/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative grid h-11 w-11 place-items-center rounded-xl bg-white/15 shadow-inner ring-1 ring-white/25">
              <Workflow size={20} className="text-white" />
              <Sparkles size={11} className="absolute -right-0.5 -top-0.5 text-amber-300" />
            </div>
            <div>
              <h1 className="flex items-center gap-2 text-base font-black text-white sm:text-lg">
                n8n Workflow Cloner
                <span className="hidden rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ring-1 ring-white/25 sm:inline">
                  Google Sheets
                </span>
              </h1>
              <p className="text-xs text-blue-100 sm:text-sm">5-step wizard to clone automation workflows to a new site</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur transition-all duration-200 hover:-translate-y-px hover:bg-white/20"
              onClick={() => navigate("/")}
            >
              <Home size={17} />
              <span className="max-sm:hidden">Dashboard</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1200px] px-4 py-7 sm:px-6 lg:px-8">
        <Stepper current={step} />

        {error ? (
          <Banner tone="error" onClose={() => setError("")}>
            <XCircle size={18} />
            {error}
          </Banner>
        ) : null}
        {busy ? (
          <Banner tone="info">
            <Loader2 size={18} className="animate-spin" />
            {busy}
          </Banner>
        ) : null}

        <section key={step} className="mt-6 animate-fade-up">
          {step === 1 ? renderConnect() : null}
          {step === 2 ? renderSelect() : null}
          {step === 3 ? renderExcel() : null}
          {step === 4 ? renderDetails() : null}
          {step === 5 ? renderResults() : null}
        </section>
      </main>

      {toast ? <Toast tone={toast.tone} message={toast.message} onClose={() => setToast(null)} /> : null}

      {confirmClone ? (
        <ConfirmDialog
          busy={Boolean(busy)}
          workflowName={preview?.workflowName || analysis?.workflowName || ""}
          newDomain={cleanDomain(newDomain)}
          activate={activate}
          onCancel={() => setConfirmClone(false)}
          onConfirm={() => void confirmAndClone()}
        />
      ) : null}
    </div>
  );

  // ---- Step 1: Connect -----------------------------------------------------
  function renderConnect() {
    const minutes = expiresInMs ? Math.round(expiresInMs / 60000) : 30;
    return (
      <>
        <Card
          icon={Link2}
          title="Step 1: Connect to n8n"
          subtitle="Connect your n8n automation platform. You’ll need your API key from n8n Settings → API."
        >
          <div className="space-y-5">
            <Field label="Instance URL" required helpText="Find this in your n8n browser URL bar.">
              <TextInput
                icon={Globe2}
                dir="ltr"
                placeholder="https://your-instance.app.n8n.cloud/"
                value={instanceUrl}
                valid={URL_RE.test(instanceUrl.trim())}
                onChange={(event) => setInstanceUrl(event.target.value)}
              />
            </Field>
            <Field label="API Key" required helpText="Generate from n8n → Settings → API → Create API Key.">
              <TextInput
                icon={KeyRound}
                dir="ltr"
                type="password"
                autoComplete="off"
                placeholder="n8n_api_…"
                value={apiKey}
                valid={apiKey.trim().length > 10}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </Field>
            <p className="flex items-center gap-2 rounded-lg bg-paper/70 px-3 py-2 text-xs font-bold text-slate ring-1 ring-line">
              <ShieldCheck size={15} className="shrink-0 text-emerald-500" />
              Your API key is kept in memory only for this session and is never stored in the browser.
            </p>
            <div>
              <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void handleConnect()}>
                {busy ? <Loader2 size={17} className="animate-spin" /> : <PlugZap size={17} />}
                Connect
              </button>
            </div>

            {connected ? (
              <div className="animate-pop-in rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-green-900 dark:from-green-950/40 dark:to-emerald-950/30">
                <p className="flex items-center gap-2 font-black text-green-700 dark:text-green-200">
                  <CheckCircle2 size={18} />
                  Connected! Found {workflowCount ?? workflows.length} workflow(s)
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-green-700/80 dark:text-green-200/80">
                  <Clock size={14} />
                  Connection expires in ~{minutes} minutes
                </p>
              </div>
            ) : null}
          </div>
          <WizardFooter onNext={() => setStep(2)} nextDisabled={!canAdvanceFrom[1]} nextLabel="Next" />
        </Card>

        <HistoryPanel
          open={historyOpen}
          busy={historyBusy}
          jobs={jobs}
          onToggle={toggleHistory}
          onRefresh={() => void loadJobs()}
        />
      </>
    );
  }

  // ---- Step 2: Select template --------------------------------------------
  function renderSelect() {
    return (
      <Card
        icon={Search}
        title="Step 2: Select Source Workflow"
        subtitle="Select the workflow template you want to clone. This workflow will be adapted for your new site."
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
          <TextInput
            icon={Search}
            placeholder="Search by name or domain…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="input" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
            <option value="">All domains ({allDomains.length})</option>
            {allDomains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-h-[520px] overflow-auto rounded-xl border border-line bg-surface">
            {filteredWorkflows.length === 0 ? (
              <p className="grid h-full min-h-[160px] place-items-center p-4 text-center text-sm text-slate">
                No matching workflows found.
              </p>
            ) : (
              filteredWorkflows.map((workflow) => (
                <WorkflowCard
                  key={workflow.id}
                  workflow={workflow}
                  selected={workflow.id === selectedWorkflowId}
                  onSelect={() => void handleSelectWorkflow(workflow)}
                />
              ))
            )}
          </div>

          <div className="rounded-xl border border-line bg-paper p-4">
            {analysis ? (
              <AnalysisView analysis={analysis} />
            ) : (
              <div className="grid h-full min-h-[200px] place-items-center px-6 text-center">
                <div>
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-500 dark:bg-blue-950 dark:text-blue-300">
                    <Database size={24} />
                  </div>
                  <p className="text-sm text-slate">Select a workflow from the list to see a detailed node analysis.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <WizardFooter onBack={() => setStep(1)} onNext={() => setStep(3)} nextDisabled={!canAdvanceFrom[2]} />
      </Card>
    );
  }

  // ---- Step 3: Upload Excel ------------------------------------------------
  function renderExcel() {
    const uploading = busy.toLowerCase().includes("uploading");
    return (
      <Card
        icon={FileSpreadsheet}
        title="Step 3: Upload Keyword Research File"
        subtitle="Upload your keyword research Excel file. Each sheet will become a tab in the new Google Sheet."
      >
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload Excel file"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            "group relative grid cursor-pointer place-items-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/25",
            dragging
              ? "scale-[1.01] border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40"
              : "border-line bg-paper/50 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:border-blue-700 dark:hover:bg-blue-950/20"
          ].join(" ")}
        >
          <div
            className={[
              "grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-600/30 transition-transform duration-200",
              dragging ? "animate-bounce" : "group-hover:scale-105"
            ].join(" ")}
          >
            <CloudUpload size={30} />
          </div>
          <p className="text-base font-black">{dragging ? "Drop it here!" : "Drag & drop your .xlsx file here"}</p>
          <p className="text-sm text-slate">
            or <span className="font-bold text-blue-600 dark:text-blue-400">click to browse</span>
          </p>
          <p className="text-xs text-slate">Supports .xlsx files up to 50MB</p>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={onFileInput} />

          {uploading ? (
            <div className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-blue-100 dark:bg-blue-950">
              <div className="animate-indeterminate rounded-full bg-gradient-to-r from-blue-500 to-indigo-500" />
            </div>
          ) : null}
        </div>

        {excelName ? (
          <div className="animate-pop-in mt-3 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm font-black text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-500 text-white">
              <Check size={14} />
            </span>
            File uploaded: {excelName}
          </div>
        ) : null}

        {uploadedSheets.length > 0 ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-black text-slate">Detected Sheets ({uploadedSheets.length})</p>
            {uploadedSheets.map((sheet) => {
              const rows = previewRows[sheet.name] ?? [];
              return (
                <div
                  key={sheet.name}
                  className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-blue-200 dark:hover:border-blue-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-black">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                        <Table2 size={15} />
                      </span>
                      {sheet.name}
                    </p>
                    <span className="rounded-md bg-paper px-2 py-1 text-xs font-bold text-slate ring-1 ring-line">
                      {sheet.rowCount} rows
                    </span>
                  </div>
                  {sheet.columns.length ? (
                    <p className="mt-2 text-xs text-slate">
                      <span className="font-bold">Columns: </span>
                      {sheet.columns.join(" | ")}
                    </p>
                  ) : null}

                  {rows.length ? (
                    <div className="mt-3 overflow-auto rounded-md border border-line">
                      <table className="w-full border-collapse text-xs">
                        <tbody>
                          {rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex === 0 ? "bg-paper font-black" : "border-t border-line"}>
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="max-w-[220px] truncate px-2 py-1 text-start">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}

                  <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-bold text-slate">↳ Map to sheet tab:</span>
                    <select
                      className="input h-9 w-auto"
                      value={effectiveChoice(sheet.name)}
                      onChange={(event) => setTabChoices((current) => ({ ...current, [sheet.name]: event.target.value }))}
                    >
                      {sourceTabs.map((tab) => (
                        <option key={tab.name} value={tab.name}>
                          {tab.name}
                        </option>
                      ))}
                      <option value={NEW_TAB}>Create new tab "{sheet.name}"</option>
                      <option value={SKIP_TAB}>Skip this sheet</option>
                    </select>
                  </label>
                </div>
              );
            })}
            <p className="flex items-center gap-2 rounded-xl border border-line bg-paper p-3 text-xs font-bold text-slate">
              <Database size={14} className="shrink-0 text-blue-500" />
              A new Google Sheet will be created with matching tabs, and data will be copied from your Excel file.
            </p>
          </div>
        ) : null}

        <WizardFooter onBack={() => setStep(2)} onNext={() => setStep(4)} nextDisabled={!canAdvanceFrom[3]} />
      </Card>
    );
  }

  // ---- Step 4: New site details -------------------------------------------
  function renderDetails() {
    return (
      <Card
        icon={Globe2}
        title="Step 4: New Site Details"
        subtitle="Enter your new site details. We’ll adapt the workflow to use these credentials."
      >
        <div className="space-y-6">
          <Section title="Domain" icon={Globe2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Source Domain (auto-detected)">
                <TextInput
                  icon={Globe2}
                  dir="ltr"
                  value={oldDomain}
                  onChange={(event) => setOldDomain(event.target.value)}
                />
              </Field>
              <Field label="New Domain" required>
                <TextInput
                  icon={Globe2}
                  dir="ltr"
                  placeholder="newsite.co.il"
                  value={newDomain}
                  valid={cleanDomain(newDomain).includes(".")}
                  onChange={(event) => updateNewDomain(event.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="WordPress" icon={Globe2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Site URL">
                <TextInput
                  icon={Link2}
                  dir="ltr"
                  placeholder="https://www.newsite.co.il"
                  value={wpUrl}
                  valid={URL_RE.test(wpUrl.trim())}
                  onChange={(event) => setWpUrl(event.target.value)}
                />
              </Field>
              <Field label="Username">
                <TextInput
                  icon={User}
                  dir="ltr"
                  placeholder="admin"
                  value={wpUsername}
                  onChange={(event) => setWpUsername(event.target.value)}
                />
              </Field>
              <Field label="App Password">
                <TextInput
                  icon={Lock}
                  dir="ltr"
                  type="password"
                  autoComplete="off"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={wpAppPassword}
                  onChange={(event) => setWpAppPassword(event.target.value)}
                />
              </Field>
              <div className="flex items-end">
                <button className="btn-secondary" onClick={testWordPress}>
                  <Search size={16} />
                  Validate WordPress
                </button>
              </div>
            </div>
            {wpTest ? <TestMessage result={wpTest} /> : null}
          </Section>

          <Section title="Google Sheets" icon={Table2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Sheet Title">
                <TextInput
                  icon={Table2}
                  value={sheetTitle}
                  valid={sheetTitle.trim().length > 2}
                  onChange={(event) => {
                    setTitleEdited(true);
                    setSheetTitle(event.target.value);
                  }}
                />
              </Field>
              <Field label="OAuth2 Credential (reuse existing)">
                <select className="input" value={gsheetsCredentialId} onChange={(event) => setGsheetsCredentialId(event.target.value)}>
                  <option value="">— Select a credential —</option>
                  {gsheetCredOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} ({option.id.slice(0, 6)}…)
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end">
                <button className="btn-secondary" onClick={testSheets}>
                  <Search size={16} />
                  Validate Sheets
                </button>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate">
              <Table2 size={14} className="text-blue-500" />
              A new sheet will be created with {buildSheetTabMappings().length} tab(s).
            </p>
            {sheetsTest ? <TestMessage result={sheetsTest} /> : null}
          </Section>

          <Section title="SMTP (Optional)" icon={Mail}>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={smtpEnabled} onChange={(event) => setSmtpEnabled(event.target.checked)} />
              Enable SMTP notifications
            </label>
            {smtpEnabled ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field label="Host">
                  <TextInput icon={Globe2} dir="ltr" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} />
                </Field>
                <Field label="Port">
                  <TextInput dir="ltr" inputMode="numeric" value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} />
                </Field>
                <Field label="Email">
                  <TextInput icon={Mail} dir="ltr" value={smtpUser} valid={EMAIL_RE.test(smtpUser.trim())} onChange={(event) => setSmtpUser(event.target.value)} />
                </Field>
                <Field label="Password">
                  <TextInput icon={Lock} dir="ltr" type="password" autoComplete="off" value={smtpPass} onChange={(event) => setSmtpPass(event.target.value)} />
                </Field>
              </div>
            ) : null}
          </Section>

          <Section title="Sheet Permissions" icon={KeyRound}>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={shareEnabled} onChange={(event) => setShareEnabled(event.target.checked)} />
              Share the sheet with an email address
            </label>
            {shareEnabled ? (
              <div className="mt-3 max-w-sm">
                <TextInput icon={Mail} dir="ltr" placeholder="user@gmail.com" value={shareEmail} valid={EMAIL_RE.test(shareEmail.trim())} onChange={(event) => setShareEmail(event.target.value)} />
              </div>
            ) : null}
            <label className="mt-4 flex w-fit cursor-pointer items-center gap-2 text-sm font-bold">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={activate} onChange={(event) => setActivate(event.target.checked)} />
              Activate the workflow automatically after cloning
            </label>
          </Section>
        </div>

        <WizardFooter
          onBack={() => setStep(3)}
          onNext={() => void handlePreview()}
          nextDisabled={!canAdvanceFrom[4] || Boolean(busy)}
          nextLoading={Boolean(busy)}
          nextLabel="Preview"
          nextIcon={Eye}
        />
      </Card>
    );
  }

  // ---- Step 5: Preview + results ------------------------------------------
  function renderResults() {
    if (result) return renderCloneResult(result);
    if (preview) return renderPreview(preview);
    return (
      <Card icon={CheckCircle2} title="Step 5: Results">
        <p className="text-sm text-slate">No preview available. Go back to Step 4 to generate a preview.</p>
        <WizardFooter onBack={() => setStep(4)} />
      </Card>
    );
  }

  function renderPreview(data: ClonePreview) {
    return (
      <Card
        icon={Eye}
        title="Step 5: Preview Changes"
        subtitle="Review the changes and execute the clone. Your new workflow will be ready to use."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="New Workflow Name" value={data.workflowName} />
          <Stat label="Total Nodes" value={String(data.totalNodes)} />
          <Stat label="Nodes to Change" value={String(data.nodesToChange)} accent />
        </div>

        <div className="mt-4 rounded-xl border border-line bg-paper p-4">
          <p className="flex items-center gap-2 font-black">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
              <Table2 size={15} />
            </span>
            New Google Sheet: {data.sheetPreview.title}
          </p>
          <p className="mt-1.5 text-sm text-slate">
            Tabs: {data.sheetPreview.tabs.join(", ") || "—"} · {data.sheetPreview.totalRows} rows total
          </p>
        </div>

        {data.changes.length ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-black text-slate">Expected Changes ({data.changes.length})</p>
            <ChangeList changes={data.changes} />
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-line bg-paper p-3 text-sm text-slate">
            Full changes (including new sheet IDs) will be applied during cloning.
          </p>
        )}

        <WizardFooter
          onBack={() => {
            setPreview(null);
            setStep(4);
          }}
          onNext={() => setConfirmClone(true)}
          nextDisabled={Boolean(busy)}
          nextLoading={Boolean(busy)}
          nextLabel="Clone Workflow"
          nextIcon={Copy}
        />
      </Card>
    );
  }

  function renderCloneResult(data: CloneResult) {
    const ok = data.ok && Boolean(data.workflow);
    return (
      <Panel className="relative overflow-hidden">
        {ok ? <Confetti /> : null}

        <div className="flex flex-col items-center gap-3 pb-2 pt-1 text-center">
          <div
            className={[
              "animate-pop-in grid h-16 w-16 place-items-center rounded-full text-white shadow-lg",
              ok
                ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-emerald-500/40"
                : "bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/40"
            ].join(" ")}
          >
            {ok ? <Check size={34} /> : <AlertTriangle size={32} />}
          </div>
          <h2 className="text-2xl font-black tracking-tight">
            {ok ? "Workflow Cloned Successfully!" : "Clone Completed with Errors"}
          </h2>
          <p className="max-w-md text-sm text-slate">
            {ok
              ? "Your new workflow and Google Sheet are ready to use."
              : "Some steps did not complete — review the change log below for details."}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          {data.sheet ? (
            <div className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-black">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                      <Table2 size={15} />
                    </span>
                    New Google Sheet
                  </p>
                  <a
                    className="mt-1.5 inline-flex items-center gap-1 break-all text-sm font-bold text-primary dark:text-blue-400 underline"
                    href={data.sheet.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.sheet.url}
                    <ExternalLink size={13} />
                  </a>
                  <p className="mt-1 text-sm text-slate">
                    Tabs: {data.sheet.tabsCreated.join(", ") || "—"} · {data.sheet.rowsWritten} rows written
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Copy sheet link"
                  title="Copy sheet link"
                  className="shrink-0 rounded-lg border border-line p-2 text-slate transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40"
                  onClick={() => void copyText(data.sheet!.url, "Sheet link")}
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
          ) : null}

          {data.workflow ? (
            <div className="rounded-xl border border-line bg-paper p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-black">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                      <Copy size={15} />
                    </span>
                    New Workflow: {data.workflow.name}
                  </p>
                  <p className="mt-1.5 text-sm text-slate">
                    ID: {data.workflow.id} · Status: {data.workflow.active ? "✅ Active" : "⏸️ Inactive"}
                  </p>
                  <a
                    className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-primary dark:text-blue-400 underline"
                    href={data.workflow.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {data.workflow.url}
                    <ExternalLink size={13} />
                  </a>
                </div>
                <button
                  type="button"
                  aria-label="Copy workflow link"
                  title="Copy workflow link"
                  className="shrink-0 rounded-lg border border-line p-2 text-slate transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40"
                  onClick={() => void copyText(data.workflow!.url, "Workflow link")}
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-line bg-paper p-4">
          <p className="mb-3 text-sm font-black text-slate">Change Summary</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryRow icon={Table2} label="Google Sheets nodes" value={data.summary.googleSheetsNodes} />
            <SummaryRow icon={Globe2} label="WordPress nodes" value={data.summary.wordpressNodes} />
            <SummaryRow icon={Link2} label="HTTP Request nodes" value={data.summary.httpRequestNodes} />
            <SummaryRow icon={Code2} label="Code nodes" value={data.summary.codeNodes} />
            <SummaryRow icon={Mail} label="Email nodes" value={data.summary.emailNodes} />
            <SummaryRow icon={KeyRound} label="Credentials Created" value={data.summary.credentialsCreated} />
          </div>
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">
            <Sparkles size={13} />
            Total {data.summary.totalChanges} changes
          </p>
        </div>

        {data.changes.length ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-black text-slate">Full Change Log ({data.changes.length})</p>
            <ChangeList changes={data.changes} />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
          {data.workflow ? (
            <a className="btn-primary" href={data.workflow.url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open in n8n
              <ArrowRight size={16} />
            </a>
          ) : null}
          {data.sheet ? (
            <a className="btn-secondary" href={data.sheet.url} target="_blank" rel="noreferrer">
              <Table2 size={16} />
              Open Sheet
            </a>
          ) : null}
          {data.workflow || data.sheet ? (
            <button className="btn-secondary" onClick={() => void shareUrl(data.workflow?.url || data.sheet?.url || "")}>
              <Share2 size={16} />
              Share
            </button>
          ) : null}
          <button className="btn-secondary" onClick={resetForAnother}>
            <RefreshCw size={16} />
            Clone Another
          </button>
          <button className="btn-secondary" onClick={() => navigate("/")}>
            <Home size={16} />
            Dashboard
          </button>
        </div>
      </Panel>
    );
  }
}

// ============================================================================
// Presentational helpers
// ============================================================================

function Stepper({ current }: { current: number }) {
  const progress = STEPS.length > 1 ? ((current - 1) / (STEPS.length - 1)) * 100 : 0;
  return (
    <nav aria-label="Progress" className="rounded-2xl border border-line bg-surface/70 px-4 py-5 shadow-sm backdrop-blur sm:px-8">
      <div className="relative">
        {/* Connecting track + animated gradient progress fill, inset to align with the step
            circle centres (each circle is 2.5rem wide, so its centre sits 1.25rem from the edge). */}
        <div className="absolute left-5 right-5 top-5 h-1 -translate-y-1/2 rounded-full bg-line" aria-hidden="true" />
        <div
          className="absolute left-5 top-5 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-500 transition-all duration-700 ease-out"
          style={{ width: `calc((100% - 2.5rem) * ${progress} / 100)` }}
          aria-hidden="true"
        />
        <ol className="relative flex items-start justify-between">
          {STEPS.map((stepItem) => {
            const Icon = stepItem.icon;
            const done = current > stepItem.id;
            const active = current === stepItem.id;
            return (
              <li key={stepItem.id} className="flex flex-col items-center gap-2">
                <div className={["relative transition-transform duration-300", active ? "scale-110" : ""].join(" ")}>
                  {active ? (
                    <span className="absolute inset-0 animate-ping rounded-full bg-blue-400/40" aria-hidden="true" />
                  ) : null}
                  <div
                    aria-current={active ? "step" : undefined}
                    aria-label={stepItem.label}
                    className={[
                      "relative grid h-10 w-10 place-items-center rounded-full border-2 ring-4 ring-surface transition-all duration-300",
                      active
                        ? "border-transparent bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/40"
                        : done
                          ? "border-transparent bg-gradient-to-br from-green-500 to-emerald-500 text-white shadow-md shadow-emerald-500/30"
                          : "border-line bg-surface text-slate"
                    ].join(" ")}
                  >
                    {done ? (
                      <Check size={20} className="animate-pop-in" />
                    ) : active ? (
                      <Icon size={18} />
                    ) : (
                      <span className="text-sm font-black">{stepItem.id}</span>
                    )}
                  </div>
                </div>
                <span
                  className={[
                    "text-xs font-black transition-colors",
                    active ? "text-blue-700 dark:text-blue-400" : done ? "text-emerald-600 dark:text-emerald-400" : "text-slate"
                  ].join(" ")}
                >
                  {stepItem.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

/** Gradient-bordered surface panel. Used directly for results and inside Card. */
function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-blue-200/70 via-line to-transparent p-px shadow-panel dark:from-blue-900/40 dark:via-line">
      <div className={["rounded-2xl bg-surface p-6 sm:p-8", className ?? ""].join(" ")}>{children}</div>
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  subtitle,
  children
}: {
  icon: typeof Globe2;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Panel>
      <div className="mb-6 flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 ring-1 ring-blue-100 dark:from-blue-950 dark:to-indigo-950 dark:text-blue-300 dark:ring-blue-900">
          <Icon size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-black tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </Panel>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Globe2; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-paper/60 p-5 transition-colors hover:border-blue-200 dark:hover:border-blue-900">
      <div className="mb-4 flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
          <Icon size={15} />
        </div>
        <h3 className="text-sm font-black uppercase tracking-wide text-slate">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  helpText,
  children
}: {
  label: string;
  required?: boolean;
  helpText?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-black text-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {helpText ? (
        <span className="mt-1.5 flex items-center gap-1 text-xs text-slate">
          <Info size={12} className="shrink-0" />
          {helpText}
        </span>
      ) : null}
    </label>
  );
}

/** Text input with an optional leading icon and a trailing validity checkmark. */
type TextInputProps = { icon?: typeof Globe2; valid?: boolean } & InputHTMLAttributes<HTMLInputElement>;

function TextInput({ icon: Icon, valid, className, ...rest }: TextInputProps) {
  return (
    <div className="relative">
      {Icon ? (
        <Icon size={16} className="pointer-events-none absolute inset-y-0 start-3 z-10 my-auto text-slate" />
      ) : null}
      <input
        {...rest}
        className={[
          "input",
          Icon ? "ps-9" : "",
          valid ? "pe-9 border-green-400 dark:border-green-700" : "",
          className ?? ""
        ].join(" ")}
      />
      {valid ? (
        <CheckCircle2 size={16} className="animate-pop-in pointer-events-none absolute inset-y-0 end-3 my-auto text-green-500" />
      ) : null}
    </div>
  );
}

function Banner({ tone, children, onClose }: { tone: "error" | "info"; children: ReactNode; onClose?: () => void }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`animate-fade-up mt-4 flex items-center gap-2 rounded-xl border p-3 text-sm font-bold ${tones[tone]}`}
    >
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-md p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

function TestMessage({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <p
      className={[
        "animate-fade-up mt-3 flex items-center gap-2 rounded-xl border p-2.5 text-sm font-bold",
        result.ok
          ? "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      ].join(" ")}
    >
      {result.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      {result.message}
    </p>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={[
        "rounded-xl border p-3",
        accent
          ? "border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 dark:border-blue-900 dark:from-blue-950/50 dark:to-indigo-950/40"
          : "border-line bg-paper"
      ].join(" ")}
    >
      <p className="text-xs font-black uppercase text-slate">{label}</p>
      <p className={["mt-1 truncate text-sm font-black", accent ? "text-blue-700 dark:text-blue-300" : ""].join(" ")} title={value}>
        {value || "—"}
      </p>
    </div>
  );
}

function SummaryRow({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <span className="flex items-center gap-2 font-bold text-slate">
        <Icon size={14} className="text-blue-500" />
        {label}
      </span>
      <span
        className={[
          "grid h-6 min-w-[1.5rem] place-items-center rounded-md px-1.5 text-xs font-black",
          value > 0 ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200" : "bg-paper text-slate"
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function ChangeList({ changes }: { changes: CloneResult["changes"] }) {
  return (
    <div className="max-h-[360px] space-y-2 overflow-auto rounded-xl border border-line bg-paper p-3">
      {changes.map((change, index) => (
        <div key={`${change.nodeName}-${index}`} className="rounded-md border border-line bg-surface p-3">
          <p className="flex items-center gap-2 text-sm font-black">
            <CheckCircle2 size={14} className="text-green-600" />
            {change.nodeName}
            <span className="rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-bold text-slate ring-1 ring-line">{change.change}</span>
          </p>
          {change.old != null || change.new != null ? (
            <p dir="ltr" className="mt-1 break-all text-start text-xs text-slate">
              {change.old ?? "∅"} <span className="text-primary dark:text-blue-400">→</span> {change.new ?? "∅"}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function WizardFooter({
  onBack,
  onNext,
  nextDisabled,
  nextLoading,
  nextLabel = "Next",
  nextIcon: NextIcon = ArrowRight
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  nextLabel?: string;
  nextIcon?: typeof ArrowRight;
}) {
  return (
    <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-5">
      {onBack ? (
        <button className="btn-secondary" onClick={onBack}>
          <ArrowLeft size={16} />
          Back
        </button>
      ) : (
        <span />
      )}
      {onNext ? (
        <button className="btn-primary" onClick={onNext} disabled={nextDisabled}>
          {nextLabel}
          {nextLoading ? <Loader2 size={16} className="animate-spin" /> : <NextIcon size={16} />}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

/** Workflow row in the step-2 picker: status dot, domain badges, node count. */
function WorkflowCard({
  workflow,
  selected,
  onSelect
}: {
  workflow: N8nWorkflowSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={[
        "group relative flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3.5 text-start transition-all last:border-b-0",
        selected
          ? "bg-gradient-to-r from-blue-50 to-transparent dark:from-blue-950/50"
          : "hover:bg-blue-50/50 dark:hover:bg-blue-950/20"
      ].join(" ")}
    >
      {selected ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500" aria-hidden="true" />
      ) : null}
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={[
            "h-2.5 w-2.5 shrink-0 rounded-full ring-2",
            workflow.active
              ? "bg-emerald-500 ring-emerald-500/20"
              : "bg-gray-300 ring-gray-300/40 dark:bg-gray-600 dark:ring-gray-600/40"
          ].join(" ")}
          title={workflow.active ? "Active" : "Inactive"}
        />
        <span className="min-w-0">
          <span className="block truncate text-sm font-black transition-colors group-hover:text-blue-700 dark:group-hover:text-blue-300">
            {workflow.name || "(unnamed)"}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {workflow.domains.length ? (
              <>
                {workflow.domains.slice(0, 2).map((domain) => (
                  <span
                    key={domain}
                    className="inline-flex items-center gap-1 rounded-md bg-paper px-1.5 py-0.5 text-[11px] font-bold text-slate ring-1 ring-line"
                  >
                    <Globe2 size={10} />
                    {domain}
                  </span>
                ))}
                {workflow.domains.length > 2 ? (
                  <span className="text-[11px] font-bold text-slate">+{workflow.domains.length - 2}</span>
                ) : null}
              </>
            ) : (
              <span className="text-xs text-slate">No domain detected</span>
            )}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="rounded-md bg-paper px-2 py-1 text-xs font-bold text-slate ring-1 ring-line">{workflow.nodeCount} nodes</span>
        <ArrowRight
          size={16}
          className={selected ? "text-blue-600" : "text-slate opacity-0 transition group-hover:opacity-100"}
        />
      </span>
    </button>
  );
}

/** Lightweight CSS confetti burst shown on a successful clone. */
function Confetti() {
  const colors = ["#3b82f6", "#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#14b8a6"];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0 overflow-visible">
      <div className="relative mx-auto h-0 max-w-md">
        {Array.from({ length: 28 }).map((_, index) => (
          <span
            key={index}
            className="confetti-piece absolute top-0 h-2 w-2 rounded-[2px]"
            style={{
              left: `${(index * 37) % 100}%`,
              backgroundColor: colors[index % colors.length],
              animationDelay: `${(index % 7) * 0.12}s`
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---- Workflow analysis breakdown (step 2 preview panel) --------------------

function AnalysisView({ analysis }: { analysis: WorkflowAnalysis }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 font-black">
          <Database size={16} className="text-primary dark:text-blue-400" />
          Analysis: {analysis.workflowName || "(unnamed)"}
        </p>
        <p className="mt-1 text-xs text-slate">
          <span className="font-bold">Domains detected: </span>
          {analysis.domains.length ? analysis.domains.join(", ") : "—"}
        </p>
      </div>

      <AnalysisGroup
        icon={Table2}
        title={`Google Sheets: ${analysis.googleSheetsNodes.length} nodes`}
        items={analysis.googleSheetsNodes.map(
          (node) => `${node.nodeName} → ${node.sheetNameLabel || "?"}${node.sheetGid != null ? ` (gid: ${node.sheetGid})` : ""}`
        )}
      />
      <AnalysisGroup
        icon={Globe2}
        title={`WordPress: ${analysis.wordpressNodes.length} nodes`}
        items={analysis.wordpressNodes.map((node) => `${node.nodeName} → ${credentialLabel(node.credential)}`)}
      />
      <AnalysisGroup
        icon={Link2}
        title={`HTTP Requests: ${analysis.httpRequestNodes.length} nodes`}
        items={analysis.httpRequestNodes.map((node) => `${node.nodeName} → ${node.url || node.method}`)}
      />
      <AnalysisGroup
        icon={Code2}
        title={`Code nodes: ${analysis.codeNodes.length} nodes (${analysis.codeNodes.filter((node) => node.hasDomainRefs).length} with domain references)`}
        items={[]}
      />
      {analysis.emailNodes.length ? (
        <AnalysisGroup
          icon={Mail}
          title={`Email / SMTP: ${analysis.emailNodes.length} nodes`}
          items={analysis.emailNodes.map((node) => node.nodeName)}
        />
      ) : null}

      <div>
        <p className="flex items-center gap-2 text-sm font-black">
          <KeyRound size={15} className="text-primary dark:text-blue-400" />
          Existing Credentials
        </p>
        <ul className="mt-1 space-y-1">
          {analysis.credentialsUsed.length ? (
            analysis.credentialsUsed.map((credential, index) => (
              <li key={`${credential.id ?? credential.name ?? index}`} className="ps-5 text-xs text-slate">
                ├─ {credential.type ?? "credential"}: {credential.name ?? "—"} {credential.id ? `(${credential.id.slice(0, 6)}…)` : ""}
              </li>
            ))
          ) : (
            <li className="ps-5 text-xs text-slate">—</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function AnalysisGroup({ icon: Icon, title, items }: { icon: typeof Globe2; title: string; items: string[] }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-black">
        <Icon size={15} className="text-primary dark:text-blue-400" />
        {title}
      </p>
      {items.length ? (
        <ul className="mt-1 space-y-1">
          {items.map((item, index) => (
            <li key={index} className="ps-5 text-xs text-slate">
              ├─ <span dir="ltr">{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---- Toast, confirmation dialog, and clone history -------------------------

function Toast({ tone, message, onClose }: { tone: "success" | "error"; message: string; onClose: () => void }) {
  const tones = {
    success: "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/60 dark:text-green-100",
    error: "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-100"
  };
  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className={`animate-fade-up flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black shadow-panel ${tones[tone]}`}>
        {tone === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <span>{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ms-2 rounded-md p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  busy,
  workflowName,
  newDomain,
  activate,
  onCancel,
  onConfirm
}: {
  busy: boolean;
  workflowName: string;
  newDomain: string;
  activate: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  // Focus the dialog on open and let Escape dismiss it (unless a clone is already in flight).
  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-clone-title"
    >
      <div className="animate-pop-in w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-lg">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300">
            <AlertTriangle size={18} />
          </span>
          <h2 id="confirm-clone-title" className="text-lg font-black">
            Confirm Clone
          </h2>
        </div>
        <p className="text-sm text-slate">
          This will create a new Google Sheet, credentials, and a new workflow in n8n
          {activate ? " and activate it automatically" : ""}. Make sure all details are correct before proceeding.
        </p>
        <div className="mt-3 space-y-1 rounded-xl border border-line bg-paper p-3 text-sm">
          <p>
            <span className="font-bold text-slate">Workflow: </span>
            <span className="font-black">{workflowName || "—"}</span>
          </p>
          <p dir="ltr" className="text-start">
            <span className="font-bold text-slate">New Domain: </span>
            <span className="font-black">{newDomain || "—"}</span>
          </p>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button ref={cancelRef} className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
            Yes, Clone
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_META: Record<ClonerJobStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" },
  connecting: { label: "Connecting", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" },
  uploading: { label: "Uploading", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  cloning: { label: "Cloning", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  done: { label: "Done", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" }
};

function StatusBadge({ status }: { status: ClonerJobStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-black ${meta.className}`}>{meta.label}</span>;
}

function formatJobDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" });
}

function HistoryPanel({
  open,
  busy,
  jobs,
  onToggle,
  onRefresh
}: {
  open: boolean;
  busy: boolean;
  jobs: ClonerJobSummary[];
  onToggle: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between gap-2 p-4">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-start">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300">
            <History size={16} />
          </span>
          <span className="text-sm font-black">Recent Clone History</span>
          {jobs.length ? (
            <span className="rounded-md bg-paper px-2 py-0.5 text-xs font-bold text-slate ring-1 ring-line">{jobs.length}</span>
          ) : null}
        </button>
        {open ? (
          <button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={onRefresh} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-line p-4">
          {busy && jobs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate">
              <Loader2 size={16} className="animate-spin" />
              Loading history…
            </p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate">No clones yet. Your first clone will appear here.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-xl border border-line bg-paper p-3 transition-colors hover:border-blue-200 dark:hover:border-blue-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusBadge status={job.status} />
                      <span className="truncate text-sm font-black">{job.sourceWorkflowName || "(unnamed)"}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate">
                      <Clock size={12} />
                      {formatJobDate(job.createdAt)}
                    </span>
                  </div>
                  <p dir="ltr" className="mt-1 truncate text-start text-xs text-slate" title={job.newDomain}>
                    {job.newDomain || "—"}
                  </p>
                  {job.errorMessage ? (
                    <p className="mt-1 break-all text-xs font-bold text-red-600 dark:text-red-300">{job.errorMessage}</p>
                  ) : null}
                  {job.sheetUrl || job.newSiteUrl ? (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs font-bold">
                      {job.sheetUrl ? (
                        <a
                          className="inline-flex items-center gap-1 text-primary dark:text-blue-400 underline"
                          href={job.sheetUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Table2 size={12} />
                          Sheet
                        </a>
                      ) : null}
                      {job.newSiteUrl ? (
                        <a
                          className="inline-flex items-center gap-1 text-primary dark:text-blue-400 underline"
                          href={job.newSiteUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Globe2 size={12} />
                          Site
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
