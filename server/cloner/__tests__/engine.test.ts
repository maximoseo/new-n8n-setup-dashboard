import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeWorkflow, cloneWorkflow, replaceDomainInString, updateResourceLocator } from "../engine.js";
import type { N8nNode, N8nWorkflow, SiteMapping } from "../../../shared/types.js";

// --- Helpers ----------------------------------------------------------------

/** A complete SiteMapping with sensible defaults; override only what a test needs. */
function makeMapping(overrides: Partial<SiteMapping> = {}): SiteMapping {
  return {
    oldDomain: "https://www.oldsite.com",
    newDomain: "https://www.newsite.co.il",
    wpUrl: "",
    wpUsername: "",
    wpAppPassword: "",
    newSheetId: "",
    newSheetUrl: "",
    newSheetTitle: "",
    sheetTabMappings: [],
    gsheetsCredentialId: "",
    gsheetsCredentialName: "",
    wpCredentialId: "",
    smtpEnabled: false,
    smtpHost: "",
    smtpPort: 587,
    smtpUser: "",
    smtpPass: "",
    smtpCredentialId: "",
    newWorkflowName: "",
    ...overrides
  };
}

function workflowWith(nodes: N8nNode[], name = "Old Site Automation"): N8nWorkflow {
  return { id: "wf-1", name, nodes, connections: {}, settings: { executionOrder: "v1" } };
}

function findNode(workflow: N8nWorkflow, name: string): N8nNode {
  const node = (workflow.nodes ?? []).find((candidate) => candidate.name === name);
  assert.ok(node, `expected to find node "${name}"`);
  return node;
}

function params(node: N8nNode): Record<string, any> {
  return (node.parameters ?? {}) as Record<string, any>;
}

// --- replaceDomainInString --------------------------------------------------

test("replaceDomainInString replaces the domain with and without protocol", () => {
  assert.equal(
    replaceDomainInString("Visit https://www.oldsite.com/page now", "www.oldsite.com", "www.newsite.co.il"),
    "Visit https://www.newsite.co.il/page now"
  );
  assert.equal(
    replaceDomainInString("bare ref www.oldsite.com here", "www.oldsite.com", "www.newsite.co.il"),
    "bare ref www.newsite.co.il here"
  );
});

test("replaceDomainInString is a no-op when the domain is absent or empty", () => {
  assert.equal(replaceDomainInString("nothing to change", "www.oldsite.com", "www.newsite.co.il"), "nothing to change");
  assert.equal(replaceDomainInString("keep https://www.oldsite.com", "", "www.newsite.co.il"), "keep https://www.oldsite.com");
});

// --- updateResourceLocator (__rl) -------------------------------------------

test("updateResourceLocator updates an __rl object in place and preserves the __rl marker", () => {
  const p: Record<string, any> = { documentId: { __rl: true, value: "OLD", mode: "id", cachedResultName: "Old" } };
  updateResourceLocator(p, "documentId", "NEW", "New Name", "https://example/new");
  assert.equal(p.documentId.__rl, true);
  assert.equal(p.documentId.value, "NEW");
  assert.equal(p.documentId.cachedResultName, "New Name");
  assert.equal(p.documentId.cachedResultUrl, "https://example/new");
});

test("updateResourceLocator replaces a bare string value and ignores missing keys", () => {
  const p: Record<string, any> = { sheetName: "Sheet1" };
  updateResourceLocator(p, "sheetName", 222);
  assert.equal(p.sheetName, 222);
  updateResourceLocator(p, "missing", "x"); // no throw, no key created
  assert.equal("missing" in p, false);
});

// --- WordPress node adaptation ----------------------------------------------

test("cloneWorkflow adapts a WordPress node: swaps the credential and rewrites domains in params", () => {
  const workflow = workflowWith([
    {
      id: "n1",
      name: "Publish Post",
      type: "n8n-nodes-base.wordpress",
      parameters: { additionalFields: { url: "https://www.oldsite.com/wp-json" } },
      credentials: { wordpressApi: { id: "wp-old", name: "WP Old" } }
    }
  ]);
  const { workflow: cloned, changes } = cloneWorkflow(workflow, makeMapping({ wpCredentialId: "wp-new-123" }));

  const node = findNode(cloned, "Publish Post");
  assert.equal(node.credentials?.wordpressApi?.id, "wp-new-123");
  assert.equal(node.credentials?.wordpressApi?.name, "www.newsite.co.il");
  // domain inside parameters was deep-replaced
  assert.match(JSON.stringify(node.parameters), /www\.newsite\.co\.il/);
  assert.doesNotMatch(JSON.stringify(node.parameters), /www\.oldsite\.com/);
  // a credential change was recorded
  assert.ok(changes.some((change) => change.nodeName === "Publish Post" && change.change === "credential"));
});

// --- Google Sheets node adaptation (incl. __rl) -----------------------------

test("cloneWorkflow adapts a Google Sheets node: documentId, sheetName gid, and credential", () => {
  const workflow = workflowWith([
    {
      id: "n1",
      name: "Get Keywords",
      type: "n8n-nodes-base.googleSheets",
      parameters: {
        documentId: { __rl: true, value: "OLD_SHEET_ID", mode: "id", cachedResultName: "Old Sheet" },
        sheetName: { __rl: true, value: 111, mode: "list", cachedResultName: "Keywords" },
        operation: "read"
      },
      credentials: { googleSheetsOAuth2Api: { id: "gs-old", name: "GS Old" } }
    }
  ]);
  const mapping = makeMapping({
    newSheetId: "NEW_SHEET_ID",
    newSheetTitle: "New Sheet",
    gsheetsCredentialId: "gs-new",
    gsheetsCredentialName: "GS New",
    sheetTabMappings: [
      { excelSheet: "Keywords", sourceGid: 111, sourceName: "Keywords", targetName: "Keywords", targetGid: 222, isNewTab: false }
    ]
  });

  const { workflow: cloned, changes } = cloneWorkflow(workflow, mapping);
  const node = findNode(cloned, "Get Keywords");

  assert.equal(params(node).documentId.value, "NEW_SHEET_ID");
  assert.equal(params(node).documentId.__rl, true);
  assert.equal(params(node).documentId.cachedResultName, "New Sheet");
  assert.equal(params(node).sheetName.value, 222);
  assert.equal(params(node).sheetName.cachedResultName, "Keywords");
  assert.equal(node.credentials?.googleSheetsOAuth2Api?.id, "gs-new");

  const kinds = changes.filter((change) => change.nodeName === "Get Keywords").map((change) => change.change);
  assert.ok(kinds.includes("documentId"));
  assert.ok(kinds.includes("sheetName"));
  assert.ok(kinds.includes("credential"));
});

// --- Code node jsCode find/replace ------------------------------------------

test("cloneWorkflow rewrites domains inside a Code node's jsCode", () => {
  const workflow = workflowWith([
    {
      id: "n1",
      name: "Transform",
      type: "n8n-nodes-base.code",
      parameters: { jsCode: "const endpoint = 'https://www.oldsite.com/api';\nreturn endpoint;" }
    }
  ]);
  const { workflow: cloned, changes } = cloneWorkflow(workflow, makeMapping());
  const node = findNode(cloned, "Transform");

  assert.match(String(params(node).jsCode), /www\.newsite\.co\.il/);
  assert.doesNotMatch(String(params(node).jsCode), /www\.oldsite\.com/);
  assert.ok(changes.some((change) => change.nodeName === "Transform" && change.change === "jsCode"));
});

// --- Deep parameter scanning ------------------------------------------------

test("cloneWorkflow deep-scans nested parameters of otherwise-unhandled nodes", () => {
  const workflow = workflowWith([
    {
      id: "n1",
      name: "Merge",
      type: "n8n-nodes-base.merge",
      parameters: {
        nested: { list: [{ link: "https://www.oldsite.com/deep" }, { keep: "no-domain-here" }] }
      }
    }
  ]);
  const { workflow: cloned, changes } = cloneWorkflow(workflow, makeMapping());
  const node = findNode(cloned, "Merge");

  assert.match(JSON.stringify(node.parameters), /www\.newsite\.co\.il\/deep/);
  assert.doesNotMatch(JSON.stringify(node.parameters), /www\.oldsite\.com/);
  assert.ok(changes.some((change) => change.nodeName === "Merge"));
});

// --- Full mock workflow: analyze + clone ------------------------------------

const MOCK_WORKFLOW: N8nWorkflow = {
  id: "wf-1",
  name: "oldsite.com Automation",
  active: true,
  versionId: "v-123",
  nodes: [
    {
      id: "n1",
      name: "Get Keywords",
      type: "n8n-nodes-base.googleSheets",
      parameters: {
        documentId: { __rl: true, value: "OLD_SHEET_ID", mode: "id", cachedResultName: "Old Sheet" },
        sheetName: { __rl: true, value: 0, mode: "list", cachedResultName: "Sheet1" },
        operation: "read"
      },
      credentials: { googleSheetsOAuth2Api: { id: "gs-old", name: "GS Old" } }
    },
    {
      id: "n2",
      name: "Publish",
      type: "n8n-nodes-base.wordpress",
      parameters: { additionalFields: {} },
      credentials: { wordpressApi: { id: "wp-old", name: "WP Old" } }
    },
    {
      id: "n3",
      name: "Fetch",
      type: "n8n-nodes-base.httpRequest",
      parameters: { url: "https://www.oldsite.com/api/data", method: "GET" }
    },
    {
      id: "n4",
      name: "Transform",
      type: "n8n-nodes-base.code",
      parameters: { jsCode: "return 'https://www.oldsite.com/x';" }
    }
  ],
  connections: { "Get Keywords": { main: [[{ node: "Publish", type: "main", index: 0 }]] } },
  settings: { executionOrder: "v1" }
};

test("analyzeWorkflow classifies nodes, domains, and credentials from a mock workflow", () => {
  const analysis = analyzeWorkflow(MOCK_WORKFLOW);

  assert.equal(analysis.totalNodes, 4);
  assert.equal(analysis.googleSheetsNodes.length, 1);
  assert.equal(analysis.wordpressNodes.length, 1);
  assert.equal(analysis.httpRequestNodes.length, 1);
  assert.equal(analysis.codeNodes.length, 1);
  assert.ok(analysis.domains.includes("www.oldsite.com"));
  // two distinct credentials (gs-old + wp-old) deduped
  assert.equal(analysis.credentialsUsed.length, 2);
  // the code node references the old domain
  assert.equal(analysis.codeNodes[0].hasDomainRefs, true);
});

test("cloneWorkflow strips read-only fields, renames, and logs changes on the full workflow", () => {
  const mapping = makeMapping({ newWorkflowName: "newsite.co.il Automation" });
  const { workflow: cloned, changes } = cloneWorkflow(MOCK_WORKFLOW, mapping);

  // read-only fields removed from the create payload
  assert.equal((cloned as Record<string, unknown>).id, undefined);
  assert.equal((cloned as Record<string, unknown>).versionId, undefined);
  assert.equal((cloned as Record<string, unknown>).active, undefined);
  // explicit new name wins
  assert.equal(cloned.name, "newsite.co.il Automation");
  // http + code nodes were rewritten
  assert.ok(changes.some((change) => change.nodeName === "Fetch" && change.change === "url"));
  assert.ok(changes.some((change) => change.nodeName === "Transform" && change.change === "jsCode"));
  // source workflow is untouched (deep clone)
  assert.equal(MOCK_WORKFLOW.name, "oldsite.com Automation");
  assert.match(String((MOCK_WORKFLOW.nodes[2].parameters as Record<string, any>).url), /www\.oldsite\.com/);
});
