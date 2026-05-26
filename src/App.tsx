import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Code2,
  Database,
  Download,
  Eye,
  FileJson,
  Github,
  Globe2,
  Lock,
  LogOut,
  Palette,
  Play,
  RefreshCw,
  Rocket,
  Search,
  Send,
  Settings,
  Sparkles,
  Workflow,
  XCircle
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { createSite, fetchSites, generateArtifacts, runDiscovery, updateSite } from "./api";
import { ThemeToggle } from "./components/ThemeToggle";
import { useAuth } from "./contexts/AuthContext";
import type { ChecklistItem, PromptBundle, Site, SiteInput, SiteStatus, StyleProfile } from "../shared/types";

const stages: Array<{ id: SiteStatus | "chat" | "github"; label: string; icon: typeof Globe2 }> = [
  { id: "input", label: "Input", icon: Globe2 },
  { id: "discovery", label: "Discovery", icon: Search },
  { id: "keywords", label: "Keywords", icon: Database },
  { id: "prompts", label: "Prompts", icon: Sparkles },
  { id: "workflow", label: "Workflow", icon: Workflow },
  { id: "template", label: "Template", icon: Code2 },
  { id: "testing", label: "Test & Preview", icon: Play },
  { id: "chat", label: "Chat Refinement", icon: Send },
  { id: "github", label: "GitHub Preview", icon: Github },
  { id: "deployed", label: "Deploy", icon: Rocket }
];

const emptyInput: SiteInput = {
  url: "",
  googleSheetsUrl: "",
  webhookUrl: "",
  language: "en",
  siteType: "regular"
};

export default function App() {
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [activeSiteId, setActiveSiteId] = useState<string>("");
  const [activeStage, setActiveStage] = useState<string>("input");
  const [form, setForm] = useState<SiteInput>(emptyInput);
  const [loading, setLoading] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    fetchSites()
      .then(({ sites }) => {
        setSites(sites);
        if (sites[0]) {
          setActiveSiteId(sites[0].id);
          setActiveStage(nextBestStage(sites[0]));
        }
      })
      .catch((error) => setError(error.message));
  }, []);

  const activeSite = useMemo(() => sites.find((site) => site.id === activeSiteId), [activeSiteId, sites]);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  function replaceSite(site: Site) {
    setSites((current) => [site, ...current.filter((item) => item.id !== site.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setActiveSiteId(site.id);
  }

  async function handleCreateAndDiscover() {
    setError("");
    setLoading("Creating site and running discovery");

    try {
      const created = await createSite(form);
      replaceSite(created.site);
      setActiveStage("discovery");

      setLoading("Fetching homepage, sitemap, brand data, and contacts");
      const discovered = await runDiscovery(created.site.id);
      replaceSite(discovered.site);

      setLoading("Generating prompts, workflow JSON, keyword seed plan, and template");
      const generated = await generateArtifacts(discovered.site.id);
      replaceSite(generated.site);
      setActiveStage("template");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading("");
    }
  }

  async function handleRegenerate(site = activeSite) {
    if (!site) return;
    setLoading("Regenerating artifacts");
    setError("");

    try {
      const generated = await generateArtifacts(site.id);
      replaceSite(generated.site);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unexpected error");
    } finally {
      setLoading("");
    }
  }

  async function handlePatchSite(siteId: string, patch: Partial<Site>) {
    setError("");
    const updated = await updateSite(siteId, patch);
    replaceSite(updated.site);
    return updated.site;
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-surface backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-ink text-sm font-black text-paper">NS</div>
            <div>
              <h1 className="text-lg font-black tracking-normal">New Site Onboarding Dashboard</h1>
              <p className="text-sm text-slate">{user?.email ?? "Automated n8n blog pipeline setup"}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ThemeToggle />
            <button className="btn-secondary" onClick={() => setSettingsOpen((value) => !value)}>
              <Settings size={17} />
              Settings
            </button>
            <button className="btn-secondary" onClick={() => void handleSignOut()}>
              <LogOut size={17} />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1500px] grid-cols-[290px_minmax(0,1fr)] gap-5 px-5 py-5 max-lg:grid-cols-1">
        <aside className="h-fit rounded-md border border-line bg-surface p-4 shadow-panel">
          <button
            className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800"
            onClick={() => {
              setActiveSiteId("");
              setActiveStage("input");
              setForm(emptyInput);
            }}
          >
            <Globe2 size={17} />
            Create New Site
          </button>

          <div className="mb-5 space-y-2">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const unlocked = !activeSite || index <= unlockedStageIndex(activeSite);
              const selected = activeStage === stage.id;
              return (
                <button
                  key={stage.id}
                  className={[
                    "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                    selected ? "border-primary bg-primary/10 text-primary" : "border-transparent text-slate hover:border-line hover:bg-paper",
                    unlocked ? "" : "cursor-not-allowed opacity-45"
                  ].join(" ")}
                  disabled={!unlocked}
                  onClick={() => setActiveStage(stage.id)}
                >
                  <span className="flex items-center gap-2 font-bold">
                    <Icon size={16} />
                    {stage.label}
                  </span>
                  {!unlocked ? <Lock size={14} /> : <span className="text-xs font-black">{index + 1}</span>}
                </button>
              );
            })}
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-xs font-black uppercase text-slate">Sites</p>
            <div className="space-y-2">
              {sites.length === 0 ? (
                <p className="rounded-md bg-paper p-3 text-sm text-slate">No sites yet.</p>
              ) : (
                sites.map((site) => (
                  <button
                    key={site.id}
                    className={[
                      "w-full rounded-md border p-3 text-left transition",
                      activeSiteId === site.id ? "border-primary bg-primary/10" : "border-line bg-surface hover:border-primary"
                    ].join(" ")}
                    onClick={() => {
                      setActiveSiteId(site.id);
                      setActiveStage(nextBestStage(site));
                    }}
                  >
                    <span className="block text-sm font-black">{site.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate">{site.url}</span>
                    <span className="mt-2 inline-flex rounded-sm bg-paper px-2 py-1 text-xs font-bold text-slate">{site.status}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          {settingsOpen ? <SettingsPanel /> : null}
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <XCircle size={18} />
              {error}
            </div>
          ) : null}
          {loading ? (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <RefreshCw size={18} className="animate-spin" />
              {loading}
            </div>
          ) : null}

          {!activeSite || activeStage === "input" ? (
            <InputPanel form={form} setForm={setForm} onSubmit={handleCreateAndDiscover} loading={Boolean(loading)} />
          ) : (
            <Workspace
              site={activeSite}
              activeStage={activeStage}
              setActiveStage={setActiveStage}
              onPatchSite={handlePatchSite}
              onRegenerate={handleRegenerate}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function InputPanel({
  form,
  setForm,
  onSubmit,
  loading
}: {
  form: SiteInput;
  setForm: (input: SiteInput) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const canSubmit = form.url && form.googleSheetsUrl && form.webhookUrl;

  return (
    <div className="rounded-md border border-line bg-surface p-6 shadow-shell">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black">Create New Site</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate">
            Enter the required pipeline fields. Discovery starts immediately after creation.
          </p>
        </div>
        <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm font-bold text-slate">Milestone 1 + discovery slice</div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Site URL" required>
          <input
            className="input"
            placeholder="https://example.com"
            value={form.url}
            onChange={(event) => setForm({ ...form, url: event.target.value })}
          />
        </Field>
        <Field label="Google Sheets URL" required>
          <input
            className="input"
            placeholder="https://docs.google.com/spreadsheets/..."
            value={form.googleSheetsUrl}
            onChange={(event) => setForm({ ...form, googleSheetsUrl: event.target.value })}
          />
        </Field>
        <Field label="Web App Pass / n8n webhook" required>
          <input
            className="input"
            placeholder="https://n8n.example/webhook/..."
            value={form.webhookUrl}
            onChange={(event) => setForm({ ...form, webhookUrl: event.target.value })}
          />
        </Field>
        <Field label="About page URL">
          <input
            className="input"
            placeholder="Auto-detected"
            value={form.aboutPageUrl ?? ""}
            onChange={(event) => setForm({ ...form, aboutPageUrl: event.target.value })}
          />
        </Field>
        <Field label="Sitemap XML URL">
          <input
            className="input"
            placeholder="Auto-detected"
            value={form.sitemapUrl ?? ""}
            onChange={(event) => setForm({ ...form, sitemapUrl: event.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Site Language">
            <select
              className="input"
              value={form.language}
              onChange={(event) => setForm({ ...form, language: event.target.value as SiteInput["language"] })}
            >
              <option value="en">English</option>
              <option value="he">Hebrew</option>
            </select>
          </Field>
          <Field label="Site Type">
            <select
              className="input"
              value={form.siteType}
              onChange={(event) => setForm({ ...form, siteType: event.target.value as SiteInput["siteType"] })}
            >
              <option value="regular">Regular B2B</option>
              <option value="ecommerce">E-commerce</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          className="inline-flex items-center gap-2 rounded-md bg-ink px-5 py-3 text-sm font-black text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSubmit || loading}
          onClick={onSubmit}
        >
          <Play size={17} />
          Create and Discover
        </button>
      </div>
    </div>
  );
}

function Workspace({
  site,
  activeStage,
  setActiveStage,
  onPatchSite,
  onRegenerate
}: {
  site: Site;
  activeStage: string;
  setActiveStage: (stage: string) => void;
  onPatchSite: (siteId: string, patch: Partial<Site>) => Promise<Site>;
  onRegenerate: (site?: Site) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-line bg-surface p-5 shadow-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">{site.name}</h2>
            <a className="mt-1 block text-sm font-bold text-primary underline" href={site.url} target="_blank" rel="noreferrer">
              {site.url}
            </a>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Language" value={`${site.language.toUpperCase()} / ${site.direction.toUpperCase()}`} />
            <Metric label="Site type" value={site.siteType} />
            <Metric label="Palette" value={`${site.styleProfile.palette.length} colors`} />
            <Metric label="Checklist" value={`${site.htmlTemplate.checklist.filter((item) => item.passed).length}/${site.htmlTemplate.checklist.length}`} />
          </div>
        </div>
      </div>

      {activeStage === "discovery" ? <DiscoveryPanel site={site} onPatchSite={onPatchSite} onRegenerate={onRegenerate} /> : null}
      {activeStage === "keywords" ? <KeywordPanel site={site} /> : null}
      {activeStage === "prompts" ? <PromptPanel site={site} onPatchSite={onPatchSite} /> : null}
      {activeStage === "workflow" ? <WorkflowPanel site={site} /> : null}
      {activeStage === "template" || activeStage === "testing" ? (
        <TemplatePanel site={site} onPatchSite={onPatchSite} onRegenerate={onRegenerate} testing={activeStage === "testing"} />
      ) : null}
      {activeStage === "chat" ? <ChatPanel site={site} onPatchSite={onPatchSite} onRegenerate={onRegenerate} /> : null}
      {activeStage === "github" ? <IntegrationPanel site={site} kind="github" /> : null}
      {activeStage === "deployed" ? <IntegrationPanel site={site} kind="deploy" /> : null}

      <div className="flex justify-between">
        <button className="btn-secondary" onClick={() => setActiveStage(previousStage(activeStage))}>
          Previous
        </button>
        <button className="btn-primary" onClick={() => setActiveStage(nextStage(activeStage))}>
          Next
        </button>
      </div>
    </div>
  );
}

function DiscoveryPanel({
  site,
  onPatchSite,
  onRegenerate
}: {
  site: Site;
  onPatchSite: (siteId: string, patch: Partial<Site>) => Promise<Site>;
  onRegenerate: (site?: Site) => Promise<void>;
}) {
  async function applyPrimaryColor(color: string) {
    const updated = await onPatchSite(site.id, {
      styleProfile: {
        ...site.styleProfile,
        primaryColor: color
      }
    });
    await onRegenerate(updated);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel title="Discovery Results" icon={Search}>
        <div className="space-y-3">
          {site.checks.map((check) => (
            <div key={check.id} className="flex items-start gap-3 rounded-md border border-line bg-paper p-3">
              {check.status === "pass" ? (
                <CheckCircle2 className="mt-0.5 text-green-600" size={18} />
              ) : check.status === "fail" ? (
                <XCircle className="mt-0.5 text-red-600" size={18} />
              ) : (
                <AlertTriangle className="mt-0.5 text-amber-600" size={18} />
              )}
              <div>
                <p className="font-black">{check.label}</p>
                <p className="text-sm text-slate">{check.message || check.status}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Style Profile" icon={Palette}>
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-black">Palette</p>
            <div className="grid grid-cols-5 gap-2">
              {site.styleProfile.palette.map((color) => (
                <button
                  key={color}
                  className="h-12 rounded-md border border-line shadow-sm"
                  style={{ backgroundColor: color }}
                  title={`Use ${color} as primary`}
                  onClick={() => void applyPrimaryColor(color)}
                />
              ))}
            </div>
          </div>

          <ProfileRows profile={site.styleProfile} />

          <div className="rounded-md border border-line bg-paper p-3">
            <p className="text-sm font-black">Logo</p>
            <p className="break-all text-sm text-slate">{site.logoUrl || "No logo candidate"}</p>
            <span className={site.logoVerified ? "badge-pass" : "badge-warn"}>{site.logoVerified ? "image verified" : "not verified"}</span>
          </div>

          <div className="rounded-md border border-line bg-paper p-3">
            <p className="text-sm font-black">Contact</p>
            <p className="text-sm text-slate">Phone: {site.phone || "Not found"}</p>
            <p className="break-all text-sm text-slate">Contact page: {site.contactPageUrl || "Not found"}</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function KeywordPanel({ site }: { site: Site }) {
  return (
    <Panel title="Keyword Research" icon={Database}>
      <div className="overflow-hidden rounded-md border border-line">
        <table className="w-full min-w-[780px] border-collapse bg-surface text-sm">
          <thead className="bg-ink text-left text-white">
            <tr>
              <th className="p-3">Keyword</th>
              <th className="p-3">Volume</th>
              <th className="p-3">Difficulty</th>
              <th className="p-3">CPC</th>
              <th className="p-3">Current Rank</th>
              <th className="p-3">Cluster Group</th>
              <th className="p-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {site.keywords.map((keyword) => (
              <tr key={keyword.id} className="border-b border-line last:border-b-0">
                <td className="p-3 font-bold">{keyword.keyword}</td>
                <td className="p-3 text-slate">{keyword.volume ?? "API pending"}</td>
                <td className="p-3 text-slate">{keyword.difficulty ?? "API pending"}</td>
                <td className="p-3 text-slate">{keyword.cpc ?? "API pending"}</td>
                <td className="p-3 text-slate">{keyword.currentRank ?? "Unknown"}</td>
                <td className="p-3">{keyword.clusterGroup}</td>
                <td className="p-3">
                  <span className="rounded-sm bg-paper px-2 py-1 text-xs font-bold text-slate">{keyword.source}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function PromptPanel({
  site,
  onPatchSite
}: {
  site: Site;
  onPatchSite: (siteId: string, patch: Partial<Site>) => Promise<Site>;
}) {
  const [tab, setTab] = useState<keyof Omit<PromptBundle, "validation">>("writingBlog");
  const [draft, setDraft] = useState(site.prompts[tab]);

  useEffect(() => {
    setDraft(site.prompts[tab]);
  }, [site.prompts, tab]);

  async function savePrompt() {
    await onPatchSite(site.id, {
      prompts: {
        ...site.prompts,
        [tab]: draft
      }
    });
  }

  return (
    <Panel title="Prompt Generation Engine" icon={Sparkles}>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["writingBlog", "Writing Blog"],
          ["imagePlanning", "Image Planning"],
          ["htmlRedesign", "HTML Redesign"]
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? "tab-active" : "tab"} onClick={() => setTab(id as typeof tab)}>
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <textarea className="code-editor min-h-[460px]" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <div className="space-y-3">
          <StatusCard
            label="n8n expressions"
            ok={site.prompts.validation.n8nExpressionsIntact}
            detail={`${site.prompts.validation.expressionCount} expressions detected`}
          />
          <StatusCard
            label="Style variables"
            ok={site.prompts.validation.unresolvedVariables.length === 0}
            detail={
              site.prompts.validation.unresolvedVariables.length
                ? site.prompts.validation.unresolvedVariables.join(", ")
                : "All template variables replaced"
            }
          />
          <button className="btn-primary w-full" onClick={() => void savePrompt()}>
            Save Prompt
          </button>
          <button className="btn-secondary w-full" onClick={() => void navigator.clipboard.writeText(draft)}>
            <Clipboard size={16} />
            Copy to Clipboard
          </button>
        </div>
      </div>
    </Panel>
  );
}

function WorkflowPanel({ site }: { site: Site }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[440px_minmax(0,1fr)]">
      <Panel title="Node Preview" icon={Workflow}>
        <div className="space-y-3">
          {site.workflow.nodePreview.map((node) => (
            <div key={node.id} className="rounded-md border border-line bg-paper p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-black">{node.name}</p>
                <span className={node.status === "configured" ? "badge-pass" : "badge-warn"}>{node.status.replace("_", " ")}</span>
              </div>
              <p className="mt-1 text-sm text-slate">{node.type}</p>
              <p className="mt-2 break-all text-xs font-bold text-slate">{node.details}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Workflow JSON" icon={FileJson}>
        <div className="mb-3 flex justify-end">
          <button className="btn-secondary" onClick={() => downloadJson(site)}>
            <Download size={16} />
            Download JSON
          </button>
        </div>
        <pre className="max-h-[640px] overflow-auto rounded-md bg-ink p-4 text-xs leading-6 text-white">
          {JSON.stringify(site.workflow.json, null, 2)}
        </pre>
      </Panel>
    </div>
  );
}

function TemplatePanel({
  site,
  onPatchSite,
  onRegenerate,
  testing
}: {
  site: Site;
  onPatchSite: (siteId: string, patch: Partial<Site>) => Promise<Site>;
  onRegenerate: (site?: Site) => Promise<void>;
  testing: boolean;
}) {
  const [mode, setMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [code, setCode] = useState(site.htmlTemplate.html);

  useEffect(() => {
    setCode(site.htmlTemplate.html);
  }, [site.htmlTemplate.html]);

  const width = mode === "desktop" ? "100%" : mode === "tablet" ? 820 : 390;

  async function saveTemplate() {
    await onPatchSite(site.id, {
      htmlTemplate: {
        ...site.htmlTemplate,
        html: code
      }
    });
  }

  return (
    <div className="space-y-5">
      {testing ? (
        <Panel title="Internal Test Runner" icon={Play}>
          <div className="grid gap-3 md:grid-cols-3">
            <StatusCard label="Sample keyword" ok={site.keywords.length > 0} detail={site.keywords[0]?.keyword ?? "No keyword selected"} />
            <StatusCard label="Prompt chain" ok={Boolean(site.prompts.writingBlog)} detail="Writing, image planning, HTML redesign" />
            <StatusCard
              label="WordPress check"
              ok={site.htmlTemplate.checklist.every((item) => item.passed)}
              detail={`${site.htmlTemplate.checklist.filter((item) => item.passed).length}/${site.htmlTemplate.checklist.length} checks passing`}
            />
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <Panel title="Live HTML Preview" icon={Eye}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {(["desktop", "tablet", "mobile"] as const).map((item) => (
                <button key={item} className={mode === item ? "tab-active" : "tab"} onClick={() => setMode(item)}>
                  {item}
                </button>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => void onRegenerate()}>
              <RefreshCw size={16} />
              Regenerate
            </button>
          </div>
          <div className="template-preview overflow-auto rounded-md border border-line bg-paper p-4">
            <iframe
              title="HTML template preview"
              className="mx-auto h-[720px] rounded-sm border border-line bg-white"
              style={{ width }}
              srcDoc={site.htmlTemplate.html}
            />
          </div>
        </Panel>

        <Panel title="Pre-flight Checklist" icon={CheckCircle2}>
          <div className="space-y-3">
            {site.htmlTemplate.checklist.map((item) => (
              <ChecklistRow key={item.id} item={item} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Template Code" icon={Code2}>
        <textarea className="code-editor min-h-[420px]" value={code} onChange={(event) => setCode(event.target.value)} />
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setCode(site.htmlTemplate.html)}>
            Reset
          </button>
          <button className="btn-primary" onClick={() => void saveTemplate()}>
            Save Template
          </button>
        </div>
      </Panel>
    </div>
  );
}

function ChatPanel({
  site,
  onPatchSite,
  onRegenerate
}: {
  site: Site;
  onPatchSite: (siteId: string, patch: Partial<Site>) => Promise<Site>;
  onRegenerate: (site?: Site) => Promise<void>;
}) {
  const [message, setMessage] = useState("");

  async function send() {
    const content = message.trim();
    if (!content) return;

    const lower = content.toLowerCase();
    const styleProfile = { ...site.styleProfile };
    let reply = "I checked the request against the template rules and kept the current structure unchanged.";
    let diff = "No code diff generated.";

    if (lower.includes("round")) {
      styleProfile.borderRadius = "24px";
      reply = "Updated the template radius token to 24px and preserved the pill CTA rule.";
      diff = "styleProfile.borderRadius: 24px";
    } else if (lower.includes("blue")) {
      styleProfile.primaryColor = "#1d4ed8";
      styleProfile.secondaryColor = "#0f3f9e";
      reply = "Adjusted the primary and hover colors to a darker blue pair.";
      diff = "primaryColor: #1d4ed8; secondaryColor: #0f3f9e";
    } else if (lower.includes("green") || lower.includes("whatsapp")) {
      styleProfile.accentColor = "#25D366";
      reply = "Set the accent color to WhatsApp green while keeping CTA hover behavior intact.";
      diff = "accentColor: #25D366";
    }

    const timestamp = new Date().toISOString();
    const updated = await onPatchSite(site.id, {
      styleProfile,
      chatHistory: [
        ...site.chatHistory,
        { id: crypto.randomUUID(), role: "user", content, timestamp },
        { id: crypto.randomUUID(), role: "assistant", content: reply, timestamp: new Date().toISOString(), templateDiff: diff }
      ]
    });
    setMessage("");
    await onRegenerate(updated);
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel title="Live Preview" icon={Eye}>
        <iframe title="chat preview" className="h-[720px] w-full rounded-md border border-line bg-white" srcDoc={site.htmlTemplate.html} />
      </Panel>
      <Panel title="Chatbot Panel" icon={Send}>
        <div className="flex h-[620px] flex-col">
          <div className="flex-1 space-y-3 overflow-auto rounded-md border border-line bg-paper p-3">
            {site.chatHistory.length === 0 ? (
              <p className="text-sm text-slate">No chat history yet.</p>
            ) : (
              site.chatHistory.map((item) => (
                <div key={item.id} className={item.role === "user" ? "chat-user" : "chat-assistant"}>
                  <p className="text-sm font-bold">{item.content}</p>
                  {item.templateDiff ? <p className="mt-2 rounded-sm bg-surface p-2 text-xs text-slate">{item.templateDiff}</p> : null}
                </div>
              ))
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a template adjustment" />
            <button className="btn-primary" onClick={() => void send()}>
              <Send size={16} />
              Send
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function IntegrationPanel({ site, kind }: { site: Site; kind: "github" | "deploy" }) {
  const isGithub = kind === "github";
  return (
    <Panel title={isGithub ? "GitHub Pages Preview" : "n8n Deployment Review"} icon={isGithub ? Github : Rocket}>
      <div className="grid gap-4 md:grid-cols-2">
        {(isGithub
          ? [
              ["Repository", site.githubRepoUrl || "Not connected"],
              ["Branch", "gh-pages"],
              ["Preview URL", "Waiting for GitHub token and repo connection"]
            ]
          : [
              ["Prompt validation", site.prompts.validation.unresolvedVariables.length === 0 ? "Pass" : "Needs attention"],
              ["Workflow JSON", site.workflow.validation.missingFields.length === 0 ? "Configured" : "Missing fields"],
              ["HTML checklist", `${site.htmlTemplate.checklist.filter((item) => item.passed).length}/${site.htmlTemplate.checklist.length} passing`]
            ]).map(([label, value]) => (
          <div key={label} className="rounded-md border border-line bg-paper p-4">
            <p className="text-xs font-black uppercase text-slate">{label}</p>
            <p className="mt-2 break-all font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
        {isGithub
          ? "Remote GitHub writes are intentionally gated behind a token connection."
          : "Deploy to n8n stays disabled until all pre-deployment checks pass and n8n API credentials are configured."}
      </div>
    </Panel>
  );
}

function SettingsPanel() {
  return (
    <div className="mb-5 rounded-md border border-line bg-surface p-5 shadow-panel">
      <div className="mb-4 flex items-center gap-2">
        <Settings size={18} />
        <h2 className="text-lg font-black">Settings</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {["Ahrefs API key", "DataForSEO login", "LLM provider key", "GitHub token"].map((label) => (
          <Field key={label} label={label}>
            <input className="input" type="password" placeholder="Not stored yet" />
          </Field>
        ))}
      </div>
    </div>
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

function Panel({ title, icon: Icon, children }: { title: string; icon: typeof Globe2; children: ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-surface p-5 shadow-panel">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} className="text-primary" />
        <h3 className="text-lg font-black">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] rounded-md border border-line bg-paper px-3 py-2">
      <p className="text-xs font-black uppercase text-slate">{label}</p>
      <p className="mt-1 text-sm font-black capitalize">{value}</p>
    </div>
  );
}

function ProfileRows({ profile }: { profile: StyleProfile }) {
  return (
    <div className="grid gap-2 text-sm">
      {[
        ["Primary", profile.primaryColor],
        ["Secondary", profile.secondaryColor],
        ["Accent", profile.accentColor],
        ["Text", profile.textColor],
        ["Font", profile.fontFamily],
        ["Radius", profile.borderRadius],
        ["Spacing", profile.spacing]
      ].map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 rounded-sm bg-paper px-3 py-2">
          <span className="font-bold">{label}</span>
          <span className="break-all text-right text-slate">{value}</span>
        </div>
      ))}
    </div>
  );
}

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 size={17} className="text-green-600" /> : <AlertTriangle size={17} className="text-amber-600" />}
        <p className="font-black">{label}</p>
      </div>
      <p className="mt-2 text-sm text-slate">{detail}</p>
    </div>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-paper p-3">
      {item.passed ? <CheckCircle2 size={18} className="mt-0.5 text-green-600" /> : <XCircle size={18} className="mt-0.5 text-red-600" />}
      <div>
        <p className="font-black">{item.label}</p>
        <p className="text-sm text-slate">{item.detail}</p>
      </div>
    </div>
  );
}

function nextBestStage(site: Site) {
  if (site.htmlTemplate.html) return "template";
  if (site.workflow.nodePreview.length) return "workflow";
  if (site.prompts.writingBlog) return "prompts";
  if (site.keywords.length) return "keywords";
  if (site.checks.length) return "discovery";
  return "input";
}

function unlockedStageIndex(site: Site) {
  if (site.htmlTemplate.html) return 9;
  if (site.workflow.nodePreview.length) return 5;
  if (site.prompts.writingBlog) return 4;
  if (site.keywords.length) return 3;
  if (site.checks.length) return 2;
  return 1;
}

function nextStage(current: string) {
  const index = stages.findIndex((stage) => stage.id === current);
  return stages[Math.min(stages.length - 1, Math.max(0, index + 1))]?.id ?? "input";
}

function previousStage(current: string) {
  const index = stages.findIndex((stage) => stage.id === current);
  return stages[Math.max(0, index - 1)]?.id ?? "input";
}

function downloadJson(site: Site) {
  const blob = new Blob([JSON.stringify(site.workflow.json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-n8n-workflow.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
