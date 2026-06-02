import type {
  CloneWorkflowResult,
  CodeNodeInfo,
  CredentialRefInfo,
  EmailNodeInfo,
  GoogleSheetsNodeInfo,
  HttpRequestNodeInfo,
  N8nNode,
  N8nWorkflow,
  NodeChange,
  OtherNodeInfo,
  SiteMapping,
  WordpressNodeInfo,
  WorkflowAnalysis
} from "../../shared/types.js";

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".css", ".js"];
const EXCLUDED_DOMAINS = new Set(["schemas.openxmlformats.org", "www.w3.org", "schemas.microsoft.com"]);
const READONLY_WORKFLOW_FIELDS = ["id", "createdAt", "updatedAt", "versionId", "sharedWith"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strip protocol and trailing slashes: "https://www.dtapet.com/" -> "www.dtapet.com". */
function cleanDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Extract the value from an n8n resource locator (__rl) field, or a bare string. */
function extractRlValue(rl: unknown): string | number | null {
  if (isRecord(rl) && rl.__rl) {
    const value = rl.value;
    return typeof value === "string" || typeof value === "number" ? value : null;
  }
  return typeof rl === "string" ? rl : null;
}

/** Extract the human-readable cached name from an n8n resource locator. */
function extractRlCachedName(rl: unknown): string {
  if (isRecord(rl) && rl.__rl && typeof rl.cachedResultName === "string") {
    return rl.cachedResultName;
  }
  return "";
}

function extractCredential(
  credentials: N8nNode["credentials"],
  credentialType: string
): CredentialRefInfo | null {
  if (!credentials) return null;
  for (const [key, value] of Object.entries(credentials)) {
    if (key.toLowerCase().includes(credentialType.toLowerCase())) {
      return { id: value?.id ?? null, name: value?.name ?? null };
    }
  }
  return null;
}

/** Find every external domain referenced inside a node's parameters. */
function findDomainsInNode(node: N8nNode): Set<string> {
  const domains = new Set<string>();
  const paramsString = JSON.stringify(node.parameters ?? {});
  const pattern = /https?:\/\/([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(paramsString)) !== null) {
    const domain = match[1].replace(/^\.+|\.+$/g, "").toLowerCase();
    if (IMAGE_EXTENSIONS.some((extension) => domain.endsWith(extension))) continue;
    if (EXCLUDED_DOMAINS.has(domain)) continue;
    domains.add(domain);
  }
  return domains;
}

/**
 * Analyze an n8n workflow JSON, classifying every node and surfacing the
 * domains, Google Sheets references and credentials that a clone must adapt.
 */
export function analyzeWorkflow(workflow: N8nWorkflow): WorkflowAnalysis {
  const nodes = workflow.nodes ?? [];
  const domains = new Set<string>();
  const googleSheetsNodes: GoogleSheetsNodeInfo[] = [];
  const wordpressNodes: WordpressNodeInfo[] = [];
  const httpRequestNodes: HttpRequestNodeInfo[] = [];
  const codeNodes: CodeNodeInfo[] = [];
  const emailNodes: EmailNodeInfo[] = [];
  const otherNodes: OtherNodeInfo[] = [];
  const credentialsUsed: CredentialRefInfo[] = [];

  for (const node of nodes) {
    const nodeType = node.type ?? "";
    const nodeName = node.name ?? "";
    const params = (node.parameters ?? {}) as Record<string, unknown>;
    const credentials = node.credentials;
    const nodeDomains = findDomainsInNode(node);
    for (const domain of nodeDomains) domains.add(domain);

    if (nodeType === "n8n-nodes-base.googleSheets") {
      googleSheetsNodes.push({
        nodeName,
        documentId: extractRlValue(params.documentId),
        documentIdName: extractRlCachedName(params.documentId),
        sheetName: extractRlValue(params.sheetName),
        sheetNameLabel: extractRlCachedName(params.sheetName),
        sheetGid: extractRlValue(params.sheetName),
        operation: typeof params.operation === "string" ? params.operation : "read",
        credential: extractCredential(credentials, "googleSheetsOAuth2Api")
      });
    } else if (nodeType === "n8n-nodes-base.wordpress") {
      wordpressNodes.push({
        nodeName,
        resource: typeof params.resource === "string" ? params.resource : "post",
        operation: typeof params.operation === "string" ? params.operation : "create",
        credential: extractCredential(credentials, "wordpressApi")
      });
    } else if (nodeType === "n8n-nodes-base.httpRequest") {
      httpRequestNodes.push({
        nodeName,
        url: typeof params.url === "string" ? params.url : "",
        method: typeof params.method === "string" ? params.method : "GET",
        hasDomainInUrl: nodeDomains.size > 0
      });
    } else if (nodeType === "n8n-nodes-base.code") {
      const jsCode = typeof params.jsCode === "string" ? params.jsCode : "";
      const pythonCode = typeof params.pythonCode === "string" ? params.pythonCode : "";
      const code = jsCode || pythonCode;
      codeNodes.push({
        nodeName,
        hasDomainRefs: Array.from(nodeDomains).some((domain) => code.includes(domain)),
        codeLength: code.length
      });
    } else if (nodeType.toLowerCase().includes("email") || nodeType.toLowerCase().includes("smtp")) {
      emailNodes.push({ nodeName, nodeType, credential: extractCredential(credentials, "smtp") });
    } else {
      otherNodes.push({ nodeName, nodeType });
    }

    if (credentials) {
      for (const [credentialType, info] of Object.entries(credentials)) {
        credentialsUsed.push({
          type: credentialType,
          id: info?.id ?? null,
          name: info?.name ?? null,
          usedByNode: nodeName
        });
      }
    }
  }

  const seen = new Set<string>();
  const uniqueCredentials: CredentialRefInfo[] = [];
  for (const credential of credentialsUsed) {
    const key = credential.id ?? `${credential.type ?? ""}:${credential.name ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCredentials.push(credential);
    }
  }

  return {
    workflowName: workflow.name ?? "",
    totalNodes: nodes.length,
    domains: Array.from(domains).sort(),
    googleSheetsNodes,
    wordpressNodes,
    httpRequestNodes,
    codeNodes,
    emailNodes,
    otherNodes,
    credentialsUsed: uniqueCredentials
  };
}

/** Replace an old domain with a new one in any string (with or without protocol). */
export function replaceDomainInString(text: string, oldDomain: string, newDomain: string): string {
  if (typeof text !== "string" || text.length === 0 || !oldDomain) return text;
  let result = text.split(`https://${oldDomain}`).join(`https://${newDomain}`);
  result = result.split(`http://${oldDomain}`).join(`http://${newDomain}`);
  result = result.split(oldDomain).join(newDomain);
  return result;
}

/** Update an n8n resource locator (__rl) field in place — handles both __rl objects and bare strings. */
export function updateResourceLocator(
  params: Record<string, unknown>,
  key: string,
  newValue: string | number,
  cachedName?: string,
  cachedUrl?: string
): void {
  if (!(key in params)) return;
  const rl = params[key];
  if (isRecord(rl) && rl.__rl) {
    rl.value = newValue;
    if (cachedName) rl.cachedResultName = cachedName;
    if (cachedUrl) rl.cachedResultUrl = cachedUrl;
  } else if (typeof rl === "string") {
    params[key] = newValue;
  }
}

/** Recursively replace domain references in every string value of an object/array, recording changes. */
function deepReplaceInValue(
  value: unknown,
  oldDomain: string,
  newDomain: string,
  changes: NodeChange[],
  nodeName: string,
  nodeType: string
): void {
  if (isRecord(value)) {
    for (const key of Object.keys(value)) {
      const child = value[key];
      if (typeof child === "string" && oldDomain && child.includes(oldDomain)) {
        const replaced = replaceDomainInString(child, oldDomain, newDomain);
        if (replaced !== child) {
          value[key] = replaced;
          changes.push({ nodeName, nodeType, change: `deep.${key}`, old: child.slice(0, 100), new: replaced.slice(0, 100) });
        }
      } else if (isRecord(child) || Array.isArray(child)) {
        deepReplaceInValue(child, oldDomain, newDomain, changes, nodeName, nodeType);
      }
    }
  } else if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      const item = value[index];
      if (typeof item === "string" && oldDomain && item.includes(oldDomain)) {
        const replaced = replaceDomainInString(item, oldDomain, newDomain);
        if (replaced !== item) {
          value[index] = replaced;
          changes.push({ nodeName, nodeType, change: `deep[${index}]`, old: item.slice(0, 100), new: replaced.slice(0, 100) });
        }
      } else if (isRecord(item) || Array.isArray(item)) {
        deepReplaceInValue(item, oldDomain, newDomain, changes, nodeName, nodeType);
      }
    }
  }
}

function getTargetGid(mapping: SiteMapping, sourceGid: string | number | null): number | null {
  if (sourceGid == null) return null;
  for (const tab of mapping.sheetTabMappings) {
    if (tab.sourceGid === sourceGid) return tab.targetGid;
  }
  return null;
}

function getTargetTabName(mapping: SiteMapping, sourceName: string): string | null {
  if (!sourceName) return null;
  for (const tab of mapping.sheetTabMappings) {
    if (tab.sourceName === sourceName) return tab.targetName;
  }
  return null;
}

/** Adapt a single node to the new site, returning the list of changes made. */
function adaptNode(node: N8nNode, mapping: SiteMapping): NodeChange[] {
  const nodeType = node.type ?? "";
  const nodeName = node.name ?? "";
  const params = (node.parameters ?? {}) as Record<string, unknown>;
  const oldDomain = cleanDomain(mapping.oldDomain);
  const newDomain = cleanDomain(mapping.newDomain);
  const changes: NodeChange[] = [];

  if (nodeType === "n8n-nodes-base.googleSheets") {
    if (mapping.newSheetId && "documentId" in params) {
      const oldId = extractRlValue(params.documentId);
      updateResourceLocator(
        params,
        "documentId",
        mapping.newSheetId,
        mapping.newSheetTitle,
        `https://docs.google.com/spreadsheets/d/${mapping.newSheetId}/edit`
      );
      changes.push({ nodeName, nodeType, change: "documentId", old: oldId == null ? null : String(oldId), new: mapping.newSheetId });
    }

    if ("sheetName" in params) {
      const sourceGid = extractRlValue(params.sheetName);
      const sourceName = extractRlCachedName(params.sheetName);
      const targetGid = getTargetGid(mapping, sourceGid);
      const targetName = getTargetTabName(mapping, sourceName);
      if (targetGid != null && targetName) {
        updateResourceLocator(
          params,
          "sheetName",
          targetGid,
          targetName,
          `https://docs.google.com/spreadsheets/d/${mapping.newSheetId}/edit#gid=${targetGid}`
        );
        changes.push({
          nodeName,
          nodeType,
          change: "sheetName",
          old: `${sourceName} (gid:${sourceGid ?? ""})`,
          new: `${targetName} (gid:${targetGid})`
        });
      }
    }

    if (mapping.gsheetsCredentialId) {
      const oldCredential = node.credentials?.googleSheetsOAuth2Api;
      node.credentials = {
        googleSheetsOAuth2Api: { id: mapping.gsheetsCredentialId, name: mapping.gsheetsCredentialName }
      };
      changes.push({
        nodeName,
        nodeType,
        change: "credential",
        old: oldCredential ? `${oldCredential.name ?? ""} (${oldCredential.id ?? ""})` : null,
        new: `${mapping.gsheetsCredentialName} (${mapping.gsheetsCredentialId})`
      });
    }
  } else if (nodeType === "n8n-nodes-base.wordpress") {
    if (mapping.wpCredentialId) {
      const oldCredential = node.credentials?.wordpressApi;
      node.credentials = { wordpressApi: { id: mapping.wpCredentialId, name: newDomain } };
      changes.push({ nodeName, nodeType, change: "credential", old: oldCredential?.name ?? null, new: newDomain });
    }
    deepReplaceInValue(params, oldDomain, newDomain, changes, nodeName, nodeType);
  } else if (nodeType === "n8n-nodes-base.httpRequest") {
    if (typeof params.url === "string") {
      const oldUrl = params.url;
      const newUrl = replaceDomainInString(oldUrl, oldDomain, newDomain);
      if (newUrl !== oldUrl) {
        params.url = newUrl;
        changes.push({ nodeName, nodeType, change: "url", old: oldUrl, new: newUrl });
      }
    }

    const headerParameters = params.headerParameters;
    if (isRecord(headerParameters) && Array.isArray(headerParameters.parameters)) {
      for (const header of headerParameters.parameters) {
        if (isRecord(header) && typeof header.value === "string") {
          const replaced = replaceDomainInString(header.value, oldDomain, newDomain);
          if (replaced !== header.value) {
            const headerName = typeof header.name === "string" ? header.name : "";
            changes.push({ nodeName, nodeType, change: `header.${headerName}`, old: header.value.slice(0, 100), new: replaced.slice(0, 100) });
            header.value = replaced;
          }
        }
      }
    }
  } else if (nodeType === "n8n-nodes-base.code") {
    for (const codeKey of ["jsCode", "pythonCode"]) {
      const code = params[codeKey];
      if (typeof code === "string") {
        const replaced = replaceDomainInString(code, oldDomain, newDomain);
        if (replaced !== code) {
          params[codeKey] = replaced;
          changes.push({
            nodeName,
            nodeType,
            change: codeKey,
            old: `(${code.length} chars, domain found)`,
            new: `(${replaced.length} chars, domain replaced)`
          });
        }
      }
    }
  } else if (nodeType === "n8n-nodes-base.set") {
    const container = params.assignments;
    const assignments = isRecord(container) && Array.isArray(container.assignments) ? container.assignments : [];
    for (const assignment of assignments) {
      if (isRecord(assignment) && typeof assignment.value === "string") {
        const replaced = replaceDomainInString(assignment.value, oldDomain, newDomain);
        if (replaced !== assignment.value) {
          const assignmentName = typeof assignment.name === "string" ? assignment.name : "";
          changes.push({ nodeName, nodeType, change: `assignment.${assignmentName}`, old: assignment.value.slice(0, 100), new: replaced.slice(0, 100) });
          assignment.value = replaced;
        }
      }
    }
  } else if (nodeType.toLowerCase().includes("email") || nodeType.toLowerCase().includes("smtp")) {
    if (mapping.smtpCredentialId && node.credentials) {
      for (const credentialKey of Object.keys(node.credentials)) {
        if (credentialKey.toLowerCase().includes("smtp") || credentialKey.toLowerCase().includes("email")) {
          const oldCredential = node.credentials[credentialKey];
          node.credentials[credentialKey] = { id: mapping.smtpCredentialId, name: `SMTP ${mapping.smtpUser}` };
          changes.push({ nodeName, nodeType, change: "credential", old: oldCredential?.name ?? null, new: `SMTP ${mapping.smtpUser}` });
        }
      }
    }
  } else if (nodeType === "n8n-nodes-base.if" || nodeType.startsWith("@n8n/n8n-nodes-langchain.")) {
    deepReplaceInValue(params, oldDomain, newDomain, changes, nodeName, nodeType);
  }

  // Catch-all: any node that produced no specific change still gets a deep domain scan.
  if (changes.length === 0) {
    deepReplaceInValue(params, oldDomain, newDomain, changes, nodeName, nodeType);
  }

  return changes;
}

/** Rebuild connection keys (which are node names) when a node name contained the old domain. */
function updateConnectionKeys(workflow: N8nWorkflow, mapping: SiteMapping): void {
  const connections = workflow.connections;
  if (!isRecord(connections)) return;
  const oldDomain = cleanDomain(mapping.oldDomain);
  const newDomain = cleanDomain(mapping.newDomain);
  const updated: Record<string, unknown> = {};
  for (const [nodeName, nodeConnections] of Object.entries(connections)) {
    updated[replaceDomainInString(nodeName, oldDomain, newDomain)] = nodeConnections;
  }
  workflow.connections = updated;
}

/**
 * Deep-clone an n8n workflow and adapt every node to the target site.
 * Returns the new workflow JSON (ready for POST /workflows) plus a full change log.
 */
export function cloneWorkflow(sourceWorkflow: N8nWorkflow, mapping: SiteMapping): CloneWorkflowResult {
  const cloned = structuredClone(sourceWorkflow);
  const mutable = cloned as Record<string, unknown>;
  for (const field of READONLY_WORKFLOW_FIELDS) {
    delete mutable[field];
  }

  const oldDomain = cleanDomain(mapping.oldDomain);
  const newDomain = cleanDomain(mapping.newDomain);
  cloned.name = mapping.newWorkflowName
    ? mapping.newWorkflowName
    : replaceDomainInString(cloned.name ?? "", oldDomain, newDomain);

  const changes: NodeChange[] = [];
  for (const node of cloned.nodes ?? []) {
    changes.push(...adaptNode(node, mapping));
  }

  updateConnectionKeys(cloned, mapping);

  if (Array.isArray(cloned.tags)) {
    for (const tag of cloned.tags) {
      if (isRecord(tag) && typeof tag.name === "string") {
        tag.name = replaceDomainInString(tag.name, oldDomain, newDomain);
      }
    }
  }

  delete mutable.active;

  return { workflow: cloned, changes };
}
