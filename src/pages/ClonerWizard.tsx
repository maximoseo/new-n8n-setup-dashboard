import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  Globe2,
  History,
  Home,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  PlugZap,
  RefreshCw,
  Search,
  Table2,
  Upload,
  X,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
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
  { id: 1, label: "חיבור ל-n8n", icon: PlugZap },
  { id: 2, label: "בחירת תבנית", icon: Search },
  { id: 3, label: "העלאת Excel", icon: FileSpreadsheet },
  { id: 4, label: "פרטי אתר חדש", icon: Globe2 },
  { id: 5, label: "תוצאות", icon: CheckCircle2 }
] as const;

const DEFAULT_INSTANCE_URL = "https://websiseo.app.n8n.cloud/";
const NEW_TAB = "__new__";
const SKIP_TAB = "__skip__";

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
    setError(err instanceof Error ? err.message : "אירעה שגיאה בלתי צפויה");
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
      setError("יש להזין כתובת Instance ו-API Key");
      return;
    }
    setError("");
    setBusy("מתחבר ל-n8n ובודק את החיבור…");
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
    setBusy(`מנתח את "${workflow.name}"…`);
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
      setError("יש להעלות קובץ ‎.xlsx‎ בלבד");
      return;
    }
    setError("");
    setBusy(`מעלה ומנתח את ${file.name}…`);
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
      setWpTest({ ok: false, message: "כתובת WordPress חסרה או לא תקינה (חייבת להתחיל ב-http/https)" });
      return;
    }
    if (!wpUsername.trim() || !wpAppPassword.trim()) {
      setWpTest({ ok: false, message: "יש למלא שם משתמש ו-App Password" });
      return;
    }
    setWpTest({ ok: true, message: "✓ הפרטים מלאים ותקינים. החיבור ל-WordPress ייבדק בעת השכפול." });
  }

  function testSheets() {
    if (!gsheetsCredentialId) {
      setSheetsTest({ ok: false, message: "יש לבחור אישור Google Sheets OAuth2" });
      return;
    }
    if (!sheetTitle.trim()) {
      setSheetsTest({ ok: false, message: "יש להזין כותרת לגיליון החדש" });
      return;
    }
    if (buildSheetTabMappings().length === 0) {
      setSheetsTest({ ok: false, message: "אין גיליונות למיפוי — חזרה לשלב 3" });
      return;
    }
    setSheetsTest({ ok: true, message: "✓ נבחר אישור והוגדרה כותרת. הגיליון ייווצר בעת השכפול." });
  }

  async function handlePreview() {
    if (!newDomain.trim()) {
      setError("יש להזין דומיין חדש");
      return;
    }
    setError("");
    setBusy("מכין תצוגה מקדימה של השינויים…");
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
    setBusy("משכפל את הוורקפלואו — יוצר גיליון, אישורים ומפעיל…");
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
        message: ok ? "הוורקפלואו שוכפל בהצלחה" : "השכפול הסתיים עם שגיאות — בדוק את התוצאות"
      });
      // Refresh history so the new clone appears immediately.
      setHistoryLoaded(false);
      if (historyOpen) void loadJobs();
    } catch (err) {
      fail(err);
      setToast({ tone: "error", message: err instanceof Error ? err.message : "השכפול נכשל" });
    } finally {
      setBusy("");
    }
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
      setSheetTitle(clean ? `${clean} - N8N אוטומציות` : "");
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
    <div dir="rtl" className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-ink text-sm font-black text-paper">
              <Copy size={18} />
            </div>
            <div>
              <h1 className="text-lg font-black">שכפול וורקפלואו n8n + Google Sheets</h1>
              <p className="text-sm text-slate">אשף בן 5 שלבים לשכפול אוטומציה לאתר חדש</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button className="btn-secondary" onClick={() => navigate("/")}>
              <Home size={17} />
              דף הבית
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-5 py-6">
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

        <section className="mt-5">
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
      <Card icon={Link2} title="שלב 1: חיבור לחשבון n8n">
        <div className="grid gap-4">
          <Field label="כתובת Instance" required>
            <input
              className="input"
              dir="ltr"
              placeholder="https://your-instance.app.n8n.cloud/"
              value={instanceUrl}
              onChange={(event) => setInstanceUrl(event.target.value)}
            />
          </Field>
          <Field label="API Key" required>
            <input
              className="input"
              dir="ltr"
              type="password"
              autoComplete="off"
              placeholder="n8n_api_…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </Field>
          <p className="flex items-center gap-2 text-xs font-bold text-slate">
            <KeyRound size={14} />
            המפתח נשמר בזיכרון בלבד למשך הסשן ולא נשמר בדפדפן (localStorage).
          </p>
          <div>
            <button className="btn-primary" disabled={Boolean(busy)} onClick={() => void handleConnect()}>
              {busy ? <Loader2 size={17} className="animate-spin" /> : <PlugZap size={17} />}
              בדוק חיבור
            </button>
          </div>

          {connected ? (
            <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
              <p className="flex items-center gap-2 font-black text-green-700 dark:text-green-200">
                <CheckCircle2 size={18} />
                חיבור הצליח! נמצאו {workflowCount ?? workflows.length} וורקפלואוים
              </p>
              <p className="mt-1 text-sm font-bold text-green-700/80 dark:text-green-200/80">
                ⏱️ החיבור יפוג בעוד כ-{minutes} דקות
              </p>
            </div>
          ) : null}
        </div>
        <WizardFooter
          onNext={() => setStep(2)}
          nextDisabled={!canAdvanceFrom[1]}
          nextLabel="הבא"
        />
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
      <Card icon={Search} title="שלב 2: בחירת וורקפלואו מקור">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_240px]">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute inset-y-0 end-3 my-auto text-slate" />
            <input
              className="input pe-9"
              placeholder="חיפוש לפי שם או דומיין…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select className="input" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
            <option value="">כל הדומיינים ({allDomains.length})</option>
            {allDomains.map((domain) => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="max-h-[520px] overflow-auto rounded-md border border-line">
            {filteredWorkflows.length === 0 ? (
              <p className="p-4 text-sm text-slate">לא נמצאו וורקפלואוים תואמים.</p>
            ) : (
              filteredWorkflows.map((workflow) => {
                const selected = workflow.id === selectedWorkflowId;
                return (
                  <button
                    key={workflow.id}
                    onClick={() => void handleSelectWorkflow(workflow)}
                    className={[
                      "flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-start transition last:border-b-0",
                      selected ? "bg-primary/10" : "hover:bg-paper"
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{workflow.name || "(ללא שם)"}</span>
                      <span className="mt-0.5 block truncate text-xs text-slate">
                        {workflow.domains.length ? workflow.domains.join(", ") : "ללא דומיין מזוהה"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="rounded-sm bg-paper px-2 py-1 text-xs font-bold text-slate">{workflow.nodeCount} nodes</span>
                      {workflow.active ? (
                        <CheckCircle2 size={16} className="text-green-600" />
                      ) : (
                        <span className="text-xs font-bold text-slate">כבוי</span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="rounded-md border border-line bg-paper p-4">
            {analysis ? (
              <AnalysisView analysis={analysis} />
            ) : (
              <p className="grid h-full min-h-[200px] place-items-center text-center text-sm text-slate">
                בחר/י וורקפלואו מהרשימה כדי לראות ניתוח מפורט של ה-nodes.
              </p>
            )}
          </div>
        </div>

        <WizardFooter
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          nextDisabled={!canAdvanceFrom[2]}
        />
      </Card>
    );
  }

  // ---- Step 3: Upload Excel ------------------------------------------------
  function renderExcel() {
    return (
      <Card icon={FileSpreadsheet} title="שלב 3: העלאת קובץ מחקר מילות מפתח">
        <div
          role="button"
          tabIndex={0}
          aria-label="העלאת קובץ Excel"
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
            "focus:outline-none focus:ring-4 focus:ring-blue-100 dark:focus:ring-blue-950",
            "grid cursor-pointer place-items-center gap-2 rounded-md border-2 border-dashed p-10 text-center transition",
            dragging ? "border-primary bg-primary/5" : "border-line bg-paper hover:border-primary"
          ].join(" ")}
        >
          <Upload size={32} className="text-primary" />
          <p className="font-black">גרור קובץ ‎.xlsx‎ לכאן</p>
          <p className="text-sm text-slate">או לחץ לבחירת קובץ</p>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={onFileInput} />
        </div>

        {excelName ? (
          <p className="mt-3 flex items-center gap-2 text-sm font-black text-green-700 dark:text-green-300">
            <CheckCircle2 size={16} />
            קובץ הועלה: {excelName}
          </p>
        ) : null}

        {uploadedSheets.length > 0 ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-black text-slate">גיליונות שזוהו</p>
            {uploadedSheets.map((sheet) => {
              const rows = previewRows[sheet.name] ?? [];
              return (
                <div key={sheet.name} className="rounded-md border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 font-black">
                      <Table2 size={16} className="text-primary" />
                      {sheet.name}
                    </p>
                    <span className="rounded-sm bg-paper px-2 py-1 text-xs font-bold text-slate">{sheet.rowCount} שורות</span>
                  </div>
                  {sheet.columns.length ? (
                    <p className="mt-2 text-xs text-slate">
                      <span className="font-bold">עמודות: </span>
                      {sheet.columns.join(" | ")}
                    </p>
                  ) : null}

                  {rows.length ? (
                    <div className="mt-3 overflow-auto rounded-sm border border-line">
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
                    <span className="font-bold text-slate">↳ מיפוי לגיליון:</span>
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
                      <option value={NEW_TAB}>צור גיליון חדש "{sheet.name}"</option>
                      <option value={SKIP_TAB}>אל תכלול גיליון זה</option>
                    </select>
                  </label>
                </div>
              );
            })}
            <p className="flex items-center gap-2 rounded-md border border-line bg-paper p-3 text-xs font-bold text-slate">
              <Database size={14} />
              המערכת תיצור Google Sheet חדש עם אותם טאבים ותעתיק את הנתונים מהאקסל.
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
      <Card icon={Globe2} title="שלב 4: פרטי אתר חדש">
        <div className="space-y-6">
          <Section title="דומיין" icon={Globe2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="דומיין מקור (מזוהה אוטומטית)">
                <input className="input" dir="ltr" value={oldDomain} onChange={(event) => setOldDomain(event.target.value)} />
              </Field>
              <Field label="דומיין חדש" required>
                <input
                  className="input"
                  dir="ltr"
                  placeholder="newsite.co.il"
                  value={newDomain}
                  onChange={(event) => updateNewDomain(event.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="WordPress" icon={Globe2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="כתובת אתר">
                <input className="input" dir="ltr" placeholder="https://www.newsite.co.il" value={wpUrl} onChange={(event) => setWpUrl(event.target.value)} />
              </Field>
              <Field label="שם משתמש">
                <input className="input" dir="ltr" placeholder="admin" value={wpUsername} onChange={(event) => setWpUsername(event.target.value)} />
              </Field>
              <Field label="App Password">
                <input
                  className="input"
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
                  בדוק WordPress
                </button>
              </div>
            </div>
            {wpTest ? <TestMessage result={wpTest} /> : null}
          </Section>

          <Section title="Google Sheets" icon={Table2}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="כותרת הגיליון">
                <input
                  className="input"
                  value={sheetTitle}
                  onChange={(event) => {
                    setTitleEdited(true);
                    setSheetTitle(event.target.value);
                  }}
                />
              </Field>
              <Field label="אישור OAuth2 (לשימוש חוזר)">
                <select className="input" value={gsheetsCredentialId} onChange={(event) => setGsheetsCredentialId(event.target.value)}>
                  <option value="">— בחר אישור —</option>
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
                  בדוק Sheets
                </button>
              </div>
            </div>
            <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate">
              <Table2 size={14} />
              ייווצר גיליון חדש עם {buildSheetTabMappings().length} טאבים.
            </p>
            {sheetsTest ? <TestMessage result={sheetsTest} /> : null}
          </Section>

          <Section title="SMTP (אופציונלי)" icon={Mail}>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={smtpEnabled} onChange={(event) => setSmtpEnabled(event.target.checked)} />
              הפעל עדכון SMTP
            </label>
            {smtpEnabled ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <Field label="שרת">
                  <input className="input" dir="ltr" value={smtpHost} onChange={(event) => setSmtpHost(event.target.value)} />
                </Field>
                <Field label="פורט">
                  <input className="input" dir="ltr" inputMode="numeric" value={smtpPort} onChange={(event) => setSmtpPort(event.target.value)} />
                </Field>
                <Field label="מייל">
                  <input className="input" dir="ltr" value={smtpUser} onChange={(event) => setSmtpUser(event.target.value)} />
                </Field>
                <Field label="סיסמה">
                  <input className="input" dir="ltr" type="password" autoComplete="off" value={smtpPass} onChange={(event) => setSmtpPass(event.target.value)} />
                </Field>
              </div>
            ) : null}
          </Section>

          <Section title="הרשאות גיליון" icon={KeyRound}>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={shareEnabled} onChange={(event) => setShareEnabled(event.target.checked)} />
              שתף את הגיליון עם כתובת מייל
            </label>
            {shareEnabled ? (
              <div className="mt-3 max-w-sm">
                <input className="input" dir="ltr" placeholder="user@gmail.com" value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} />
              </div>
            ) : null}
            <label className="mt-4 flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={activate} onChange={(event) => setActivate(event.target.checked)} />
              הפעל את הוורקפלואו אוטומטית לאחר השכפול
            </label>
          </Section>
        </div>

        <WizardFooter
          onBack={() => setStep(3)}
          onNext={() => void handlePreview()}
          nextDisabled={!canAdvanceFrom[4] || Boolean(busy)}
          nextLoading={Boolean(busy)}
          nextLabel="תצוגה מקדימה"
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
      <Card icon={CheckCircle2} title="שלב 5: תוצאות">
        <p className="text-sm text-slate">אין תצוגה מקדימה זמינה. חזרה לשלב 4 כדי להפיק תצוגה מקדימה.</p>
        <WizardFooter onBack={() => setStep(4)} />
      </Card>
    );
  }

  function renderPreview(data: ClonePreview) {
    return (
      <Card icon={Eye} title="שלב 5: תצוגה מקדימה של השינויים">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="שם הוורקפלואו החדש" value={data.workflowName} />
          <Stat label="סה״כ nodes" value={String(data.totalNodes)} />
          <Stat label="nodes לשינוי" value={String(data.nodesToChange)} />
        </div>

        <div className="mt-4 rounded-md border border-line bg-paper p-4">
          <p className="flex items-center gap-2 font-black">
            <Table2 size={16} className="text-primary" />
            גיליון Google חדש: {data.sheetPreview.title}
          </p>
          <p className="mt-1 text-sm text-slate">
            טאבים: {data.sheetPreview.tabs.join(", ") || "—"} · סה״כ {data.sheetPreview.totalRows} שורות
          </p>
        </div>

        {data.changes.length ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-black text-slate">שינויים צפויים ({data.changes.length})</p>
            <ChangeList changes={data.changes} />
          </div>
        ) : (
          <p className="mt-4 rounded-md border border-line bg-paper p-3 text-sm text-slate">
            השינויים המלאים (כולל מזהי הגיליון החדש) יבוצעו בעת השכפול.
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
          nextLabel="שכפל וורקפלואו"
          nextIcon={Copy}
        />
      </Card>
    );
  }

  function renderCloneResult(data: CloneResult) {
    const ok = data.ok && Boolean(data.workflow);
    return (
      <Card icon={ok ? CheckCircle2 : AlertTriangle} title={ok ? "שלב 5: וורקפלואו שוכפל בהצלחה!" : "שלב 5: השכפול הסתיים עם שגיאות"}>
        {data.sheet ? (
          <div className="rounded-md border border-line bg-paper p-4">
            <p className="flex items-center gap-2 font-black">
              <Table2 size={16} className="text-primary" />
              Google Sheet חדש
            </p>
            <a className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-primary underline" href={data.sheet.url} target="_blank" rel="noreferrer">
              {data.sheet.url}
              <ExternalLink size={13} />
            </a>
            <p className="mt-1 text-sm text-slate">
              טאבים: {data.sheet.tabsCreated.join(", ") || "—"} · {data.sheet.rowsWritten} שורות נכתבו
            </p>
          </div>
        ) : null}

        {data.workflow ? (
          <div className="mt-3 rounded-md border border-line bg-paper p-4">
            <p className="flex items-center gap-2 font-black">
              <Copy size={16} className="text-primary" />
              וורקפלואו חדש: {data.workflow.name}
            </p>
            <p className="mt-1 text-sm text-slate">
              ID: {data.workflow.id} · סטטוס: {data.workflow.active ? "✅ פעיל" : "⏸️ כבוי"}
            </p>
            <a className="mt-1 inline-flex items-center gap-1 break-all text-sm font-bold text-primary underline" href={data.workflow.url} target="_blank" rel="noreferrer">
              {data.workflow.url}
              <ExternalLink size={13} />
            </a>
          </div>
        ) : null}

        <div className="mt-4 rounded-md border border-line bg-paper p-4">
          <p className="mb-2 text-sm font-black text-slate">סיכום שינויים</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryRow label="Google Sheets nodes" value={data.summary.googleSheetsNodes} />
            <SummaryRow label="WordPress nodes" value={data.summary.wordpressNodes} />
            <SummaryRow label="HTTP Request nodes" value={data.summary.httpRequestNodes} />
            <SummaryRow label="Code nodes" value={data.summary.codeNodes} />
            <SummaryRow label="Email nodes" value={data.summary.emailNodes} />
            <SummaryRow label="אישורים שנוצרו" value={data.summary.credentialsCreated} />
          </div>
          <p className="mt-2 text-xs font-bold text-slate">סה״כ {data.summary.totalChanges} שינויים</p>
        </div>

        {data.changes.length ? (
          <div className="mt-4">
            <p className="mb-2 text-sm font-black text-slate">לוג שינויים מלא ({data.changes.length})</p>
            <ChangeList changes={data.changes} />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {data.workflow ? (
            <a className="btn-primary" href={data.workflow.url} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              פתח ב-n8n
            </a>
          ) : null}
          {data.sheet ? (
            <a className="btn-secondary" href={data.sheet.url} target="_blank" rel="noreferrer">
              <Table2 size={16} />
              פתח גיליון
            </a>
          ) : null}
          <button className="btn-secondary" onClick={resetForAnother}>
            <RefreshCw size={16} />
            שכפל שוב
          </button>
          <button className="btn-secondary" onClick={() => navigate("/")}>
            <Home size={16} />
            דף הבית
          </button>
        </div>
      </Card>
    );
  }
}

// ============================================================================
// Presentational helpers
// ============================================================================

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((stepItem, index) => {
        const Icon = stepItem.icon;
        const done = current > stepItem.id;
        const active = current === stepItem.id;
        return (
          <li key={stepItem.id} className="flex flex-1 items-center gap-2">
            <div
              className={[
                "flex min-w-0 flex-1 items-center gap-2 rounded-md border px-3 py-2",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : done
                    ? "border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
                    : "border-line bg-surface text-slate"
              ].join(" ")}
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-xs font-black">
                {done ? <CheckCircle2 size={14} /> : stepItem.id}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon size={15} className="shrink-0" />
                <span className="truncate text-sm font-black max-sm:hidden">{stepItem.label}</span>
              </span>
            </div>
            {index < STEPS.length - 1 ? <span className="h-px w-3 shrink-0 bg-line max-sm:hidden" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Card({ icon: Icon, title, children }: { icon: typeof Globe2; title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-panel">
      <div className="mb-5 flex items-center gap-2">
        <Icon size={20} className="text-primary" />
        <h2 className="text-xl font-black">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Globe2; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-paper p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={16} className="text-primary" />
        <h3 className="text-sm font-black uppercase tracking-wide text-slate">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-black text-ink">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Banner({ tone, children, onClose }: { tone: "error" | "info"; children: ReactNode; onClose?: () => void }) {
  const tones = {
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
  };
  return (
    <div className={`mt-4 flex items-center gap-2 rounded-md border p-3 text-sm font-bold ${tones[tone]}`}>
      <span className="flex flex-1 items-center gap-2">{children}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="shrink-0 rounded-sm p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
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
        "mt-3 flex items-center gap-2 rounded-md border p-2.5 text-sm font-bold",
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className="text-xs font-black uppercase text-slate">{label}</p>
      <p className="mt-1 truncate text-sm font-black" title={value}>
        {value || "—"}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-surface px-3 py-2 text-sm">
      <span className="font-bold text-slate">{label}</span>
      <span className="font-black">{value}</span>
    </div>
  );
}

function ChangeList({ changes }: { changes: CloneResult["changes"] }) {
  return (
    <div className="max-h-[360px] space-y-2 overflow-auto rounded-md border border-line bg-paper p-3">
      {changes.map((change, index) => (
        <div key={`${change.nodeName}-${index}`} className="rounded-sm border border-line bg-surface p-3">
          <p className="flex items-center gap-2 text-sm font-black">
            <CheckCircle2 size={14} className="text-green-600" />
            {change.nodeName}
            <span className="rounded-sm bg-paper px-1.5 py-0.5 text-[11px] font-bold text-slate">{change.change}</span>
          </p>
          {change.old != null || change.new != null ? (
            <p dir="ltr" className="mt-1 break-all text-start text-xs text-slate">
              {change.old ?? "∅"} <span className="text-primary">→</span> {change.new ?? "∅"}
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
  nextLabel = "הבא",
  nextIcon: NextIcon = ArrowLeft
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  nextLabel?: string;
  nextIcon?: typeof ArrowLeft;
}) {
  return (
    <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
      {onBack ? (
        <button className="btn-secondary" onClick={onBack}>
          <ArrowRight size={16} />
          חזרה
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

// ---- Workflow analysis breakdown (step 2 preview panel) --------------------

function AnalysisView({ analysis }: { analysis: WorkflowAnalysis }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="flex items-center gap-2 font-black">
          <Database size={16} className="text-primary" />
          ניתוח: {analysis.workflowName || "(ללא שם)"}
        </p>
        <p className="mt-1 text-xs text-slate">
          <span className="font-bold">דומיינים שזוהו: </span>
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
        title={`Code nodes: ${analysis.codeNodes.length} nodes (${analysis.codeNodes.filter((node) => node.hasDomainRefs).length} עם הפניות לדומיין)`}
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
          <KeyRound size={15} className="text-primary" />
          אישורים קיימים
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
        <Icon size={15} className="text-primary" />
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
    <div dir="rtl" className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className={`flex items-center gap-2 rounded-md border px-4 py-3 text-sm font-black shadow-panel ${tones[tone]}`}>
        {tone === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <span>{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="סגור"
          className="ms-2 rounded-sm p-1 transition hover:bg-black/5 dark:hover:bg-white/10"
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
  return (
    <div dir="rtl" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-md border border-line bg-surface p-6 shadow-panel">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={20} className="text-amber-500" />
          <h2 className="text-lg font-black">אישור ביצוע שכפול</h2>
        </div>
        <p className="text-sm text-slate">
          הפעולה תיצור גיליון Google חדש, אישורים ו-Workflow חדש ב-n8n
          {activate ? " ותפעיל אותו אוטומטית" : ""}. ודא/י שכל הפרטים נכונים לפני ההמשך.
        </p>
        <div className="mt-3 space-y-1 rounded-md border border-line bg-paper p-3 text-sm">
          <p>
            <span className="font-bold text-slate">וורקפלואו: </span>
            <span className="font-black">{workflowName || "—"}</span>
          </p>
          <p dir="ltr" className="text-start">
            <span className="font-bold text-slate">דומיין חדש: </span>
            <span className="font-black">{newDomain || "—"}</span>
          </p>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            ביטול
          </button>
          <button className="btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
            כן, בצע שכפול
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_META: Record<ClonerJobStatus, { label: string; className: string }> = {
  pending: { label: "ממתין", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  connecting: { label: "מתחבר", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  uploading: { label: "מעלה", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  cloning: { label: "משכפל", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  done: { label: "הושלם", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  failed: { label: "נכשל", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" }
};

function StatusBadge({ status }: { status: ClonerJobStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  return <span className={`rounded-sm px-2 py-0.5 text-[11px] font-black ${meta.className}`}>{meta.label}</span>;
}

function formatJobDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
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
    <div className="mt-4 rounded-md border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between gap-2 p-4">
        <button type="button" onClick={onToggle} className="flex items-center gap-2 text-start">
          <History size={18} className="text-primary" />
          <span className="text-sm font-black">היסטוריית שכפולים אחרונים</span>
          {jobs.length ? (
            <span className="rounded-sm bg-paper px-2 py-0.5 text-xs font-bold text-slate">{jobs.length}</span>
          ) : null}
        </button>
        {open ? (
          <button type="button" className="btn-secondary h-8 px-2 text-xs" onClick={onRefresh} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            רענן
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="border-t border-line p-4">
          {busy && jobs.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-slate">
              <Loader2 size={16} className="animate-spin" />
              טוען היסטוריה…
            </p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-slate">אין עדיין שכפולים. השכפול הראשון יופיע כאן.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="rounded-md border border-line bg-paper p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusBadge status={job.status} />
                      <span className="truncate text-sm font-black">{job.sourceWorkflowName || "(ללא שם)"}</span>
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
                          className="inline-flex items-center gap-1 text-primary underline"
                          href={job.sheetUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Table2 size={12} />
                          גיליון
                        </a>
                      ) : null}
                      {job.newSiteUrl ? (
                        <a
                          className="inline-flex items-center gap-1 text-primary underline"
                          href={job.newSiteUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Globe2 size={12} />
                          אתר
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
