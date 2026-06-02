import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import * as XLSX from "xlsx";
import { clonerRouter } from "../routes.js";
import type { N8nWorkflow } from "../../../shared/types.js";

// Routes are exercised against an ephemeral Express server. Calls that the
// route handlers make to n8n (via global fetch) are intercepted by a mock that
// recognises the fake n8n origin; calls to our own server pass through to the
// real fetch implementation. No real n8n / Supabase / Google is contacted.

const N8N_BASE = "http://n8n.test";

const MOCK_WORKFLOW: N8nWorkflow = {
  id: "wf-1",
  name: "Old Site Automation",
  active: true,
  nodes: [
    {
      id: "n1",
      name: "Get Keywords",
      type: "n8n-nodes-base.googleSheets",
      parameters: {
        documentId: { __rl: true, value: "OLD_SHEET", mode: "id", cachedResultName: "Old" },
        sheetName: { __rl: true, value: 0, mode: "list", cachedResultName: "Sheet1" },
        operation: "read"
      },
      credentials: { googleSheetsOAuth2Api: { id: "gs-old", name: "GS Old" } }
    },
    {
      id: "n2",
      name: "Fetch",
      type: "n8n-nodes-base.httpRequest",
      parameters: { url: "https://www.oldsite.com/api/data", method: "GET" }
    },
    {
      id: "n3",
      name: "Transform",
      type: "n8n-nodes-base.code",
      parameters: { jsCode: "return 'https://www.oldsite.com/x';" }
    }
  ],
  connections: {},
  settings: { executionOrder: "v1" }
};

const realFetch = globalThis.fetch;
let createdWorkflowPayload: Record<string, any> | null = null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  // Pass calls to our own test server through to the real fetch.
  if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
    return realFetch(input as Parameters<typeof fetch>[0], init);
  }

  const parsed = new URL(url);
  const method = (init?.method ?? "GET").toUpperCase();

  if (parsed.origin === N8N_BASE) {
    const path = parsed.pathname;
    const apiKey = (init?.headers as Record<string, string> | undefined)?.["X-N8N-API-KEY"];

    if (method === "GET" && path === "/api/v1/workflows") {
      if (apiKey === "bad-key") return jsonResponse({ message: "unauthorized" }, 401);
      return jsonResponse({ data: [MOCK_WORKFLOW], nextCursor: null });
    }
    if (method === "GET" && path.startsWith("/api/v1/workflows/")) {
      return jsonResponse(MOCK_WORKFLOW);
    }
    if (method === "POST" && path === "/api/v1/workflows") {
      createdWorkflowPayload = init?.body ? JSON.parse(String(init.body)) : null;
      return jsonResponse({ id: "new-wf-1", name: createdWorkflowPayload?.name ?? "Cloned" });
    }
    if (method === "POST" && /\/api\/v1\/workflows\/.+\/activate$/.test(path)) {
      return jsonResponse({ id: "new-wf-1", active: true });
    }
    return jsonResponse({ message: "not found" }, 404);
  }

  // Anything else (e.g. an unreachable host) behaves like a network failure.
  throw new Error(`fetch failed: unexpected host in test ${method} ${url}`);
}

let server: Server;
let base = "";

before(async () => {
  globalThis.fetch = mockFetch as typeof fetch;
  const app = express();
  app.use(express.json());
  app.use((request, _response, next) => {
    request.userId = "test-user";
    next();
  });
  app.use("/api/cloner", clonerRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("cloner routes against a mock n8n instance", async (t) => {
  let sessionId = "";

  await t.test("POST /connect validates the connection and opens a session", async () => {
    const response = await fetch(`${base}/api/cloner/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceUrl: N8N_BASE, apiKey: "good-key" })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.ok(body.sessionId);
    assert.equal(body.workflowCount, 1);
    sessionId = body.sessionId;
  });

  await t.test("POST /upload-excel parses an uploaded .xlsx", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["keyword", "volume"],
      ["dog food", 100],
      ["cat food", 50]
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Keywords");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buffer)]), "keywords.xlsx");

    const response = await fetch(`${base}/api/cloner/upload-excel`, {
      method: "POST",
      headers: { "x-cloner-session": sessionId },
      body: form
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.fileName, "keywords.xlsx");
    assert.equal(body.sheets[0].name, "Keywords");
    assert.ok(body.sheets[0].rowCount >= 3);
  });

  await t.test("POST /preview dry-runs the clone and reports changes", async () => {
    const response = await fetch(`${base}/api/cloner/preview`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cloner-session": sessionId },
      body: JSON.stringify({
        sourceWorkflowId: "wf-1",
        mapping: { oldDomain: "https://www.oldsite.com", newDomain: "https://www.newsite.co.il" }
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.preview.totalNodes, 3);
    assert.ok(body.preview.changes.length >= 1);
    assert.ok(body.preview.changes.some((change: { change: string }) => change.change === "url"));
  });

  await t.test("POST /clone creates and activates the cloned workflow", async () => {
    const response = await fetch(`${base}/api/cloner/clone`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cloner-session": sessionId },
      body: JSON.stringify({
        sourceWorkflowId: "wf-1",
        mapping: { oldDomain: "https://www.oldsite.com", newDomain: "https://www.newsite.co.il" },
        options: { activate: true, createSheet: false }
      })
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.workflow.id, "new-wf-1");
    assert.equal(body.workflow.active, true);
    assert.ok(body.summary.httpRequestNodes >= 1);

    // The create payload sent to n8n must drop read-only ids (workflow + nodes).
    assert.ok(createdWorkflowPayload);
    assert.equal(createdWorkflowPayload?.id, undefined);
    assert.equal(createdWorkflowPayload?.nodes?.[0]?.id, undefined);
  });

  await t.test("POST /clone requires a session", async () => {
    const response = await fetch(`${base}/api/cloner/clone`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceWorkflowId: "wf-1",
        mapping: { oldDomain: "https://www.oldsite.com", newDomain: "https://www.newsite.co.il" }
      })
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
  });

  await t.test("POST /connect surfaces an n8n auth failure as a Hebrew error", async () => {
    const response = await fetch(`${base}/api/cloner/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceUrl: N8N_BASE, apiKey: "bad-key" })
    });
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /API Key|אימות/);
  });
});
