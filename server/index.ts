import path from "node:path";
import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import { z } from "zod";
import { authMiddleware } from "./authMiddleware.js";
import { generateArtifacts } from "./artifacts.js";
import { discoverSite, normalizeUrl } from "./discovery.js";
import { getSite, getUserSettings, listSites, upsertSite, upsertUserSettings } from "./storage.js";
import { clonerRouter } from "./cloner/routes.js";
import type { PromptBundle, Site, SiteInput, UserSettings, WorkflowBundle } from "../shared/types.js";

const app = express();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "0.0.0.0";
const siteInputSchema = z.object({
  url: z.string().url().or(z.string().min(3)),
  googleSheetsUrl: z.string().min(1),
  webhookUrl: z.string().min(1),
  aboutPageUrl: z.string().optional(),
  sitemapUrl: z.string().optional(),
  language: z.enum(["he", "en"]).optional(),
  siteType: z.enum(["regular", "ecommerce"]).optional()
});

app.use(cors({ origin: true }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "new-site-onboarding-dashboard", timestamp: new Date().toISOString() });
});

app.use("/api", authMiddleware);

app.get("/api/user-settings", async (request, response, next) => {
  try {
    response.json({ settings: await getUserSettings(request.userId!) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/user-settings", async (request, response, next) => {
  try {
    const settings = userSettingsSchema.parse(request.body);
    response.json({ settings: await upsertUserSettings(request.userId!, settings) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sites", async (request, response, next) => {
  try {
    response.json({ sites: await listSites(request.userId!) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sites", async (request, response, next) => {
  try {
    const input = siteInputSchema.parse(request.body);
    const site = createSite(input);
    const savedSite = await upsertSite(site, request.userId!);
    response.status(201).json({ site: savedSite });
  } catch (error) {
    next(error);
  }
});

app.get("/api/sites/:siteId", async (request, response, next) => {
  try {
    const site = await getSite(request.params.siteId, request.userId!);
    if (!site) {
      response.status(404).json({ error: "Site not found" });
      return;
    }

    response.json({ site });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sites/:siteId/discover", async (request, response, next) => {
  try {
    const site = await getSite(request.params.siteId, request.userId!);
    if (!site) {
      response.status(404).json({ error: "Site not found" });
      return;
    }

    const input = siteInputSchema.parse({
      url: site.url,
      googleSheetsUrl: site.googleSheetsUrl,
      webhookUrl: site.webhookUrl,
      aboutPageUrl: request.body?.aboutPageUrl ?? site.aboutPageUrl,
      sitemapUrl: request.body?.sitemapUrl ?? site.sitemapUrl,
      language: request.body?.language ?? site.language,
      siteType: request.body?.siteType ?? site.siteType
    });
    const discoveredSite = await discoverSite(input, { ...site, status: "discovery" });
    const savedSite = await upsertSite(discoveredSite, request.userId!);
    response.json({ site: savedSite });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sites/:siteId/generate-artifacts", async (request, response, next) => {
  try {
    const site = await getSite(request.params.siteId, request.userId!);
    if (!site) {
      response.status(404).json({ error: "Site not found" });
      return;
    }

    const updated = generateArtifacts(site);
    const savedSite = await upsertSite(updated, request.userId!);
    response.json({ site: savedSite });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/sites/:siteId", async (request, response, next) => {
  try {
    const site = await getSite(request.params.siteId, request.userId!);
    if (!site) {
      response.status(404).json({ error: "Site not found" });
      return;
    }

    const updated: Site = {
      ...site,
      ...request.body,
      styleProfile: {
        ...site.styleProfile,
        ...(request.body?.styleProfile ?? {})
      },
      updatedAt: new Date().toISOString()
    };
    const savedSite = await upsertSite(updated, request.userId!);
    response.json({ site: savedSite });
  } catch (error) {
    next(error);
  }
});

app.use("/api/cloner", clonerRouter);

const distPath = path.resolve(process.cwd(), "dist");
app.use(express.static(distPath));
app.get("*", (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: "Invalid request", details: error.flatten() });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown server error";
  response.status(500).json({ error: message });
});

app.listen(port, host, () => {
  console.log(`New Site Onboarding Dashboard API listening on http://${host}:${port}`);
});

function createSite(input: SiteInput): Site {
  const url = normalizeUrl(input.url);
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    url,
    name: hostname,
    language: input.language ?? "en",
    direction: input.language === "he" ? "rtl" : "ltr",
    siteType: input.siteType ?? "regular",
    sitemapUrl: input.sitemapUrl ?? "",
    aboutPageUrl: input.aboutPageUrl ?? "",
    contactPageUrl: "",
    styleProfile: {
      primaryColor: "#1d4ed8",
      secondaryColor: "#0f766e",
      accentColor: "#f59e0b",
      textColor: "#111827",
      bgColor: "#ffffff",
      borderColor: "#d9dee8",
      fontFamily: "system-ui",
      borderRadius: "8px",
      shadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
      spacing: "balanced",
      palette: ["#1d4ed8", "#0f766e", "#f59e0b", "#111827", "#ffffff", "#d9dee8"]
    },
    logoUrl: "",
    logoVerified: false,
    phone: "",
    whatsapp: "",
    socialLinks: {},
    authorName: hostname,
    authorBio: "",
    authorImageUrl: "",
    googleSheetsUrl: input.googleSheetsUrl,
    webhookUrl: input.webhookUrl,
    prompts: emptyPrompts(),
    workflow: emptyWorkflow(),
    htmlTemplate: { html: "", checklist: [] },
    keywords: [],
    checks: [],
    status: "input",
    createdAt: now,
    updatedAt: now,
    chatHistory: []
  };
}

const userSettingsSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]).optional(),
    ahrefsApiKeyEncrypted: z.string().nullable().optional(),
    dataforseoLoginEncrypted: z.string().nullable().optional(),
    llmProviderKeyEncrypted: z.string().nullable().optional(),
    githubTokenEncrypted: z.string().nullable().optional()
  })
  .strict() satisfies z.ZodType<Partial<UserSettings>>;

function emptyPrompts(): PromptBundle {
  return {
    writingBlog: "",
    imagePlanning: "",
    htmlRedesign: "",
    validation: {
      n8nExpressionsIntact: true,
      unresolvedVariables: [],
      expressionCount: 0
    }
  };
}

function emptyWorkflow(): WorkflowBundle {
  return {
    json: {},
    nodePreview: [],
    validation: {
      configuredNodes: 0,
      attentionNodes: 0,
      missingFields: []
    }
  };
}
