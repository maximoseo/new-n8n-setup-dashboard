import type { N8nWorkflow } from "../../shared/types.js";

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build the create payload n8n will accept — only writable keys, with node ids stripped. */
function cleanForCreate(workflow: Partial<N8nWorkflow> | Record<string, unknown>): Record<string, unknown> {
  const source = structuredClone(workflow) as Record<string, unknown>;
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  for (const node of nodes) {
    if (isRecord(node)) {
      delete node.id;
      delete node.webhookId;
    }
  }
  const cleaned: Record<string, unknown> = {
    name: typeof source.name === "string" ? source.name : "Cloned workflow",
    nodes,
    connections: isRecord(source.connections) ? source.connections : {},
    settings: isRecord(source.settings) ? source.settings : { executionOrder: "v1" }
  };
  if (source.staticData !== undefined) cleaned.staticData = source.staticData;
  return cleaned;
}

/**
 * Read + write client for the n8n public REST API.
 *
 * n8n authenticates with the `X-N8N-API-KEY` header; we additionally send an
 * `Authorization: Bearer` header for compatibility with the task spec and any
 * reverse proxy in front of the instance (n8n ignores the header it does not use).
 * Calls are rate-limited to ~10/sec and retried with exponential backoff on 429.
 */
export class N8nClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private lastRequestAt = 0;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "X-N8N-API-KEY": this.apiKey,
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    };
  }

  private async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    let url = `${this.baseUrl}/${path.replace(/^\/+/, "")}`;
    if (options.query) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined) search.set(key, String(value));
      }
      const queryString = search.toString();
      if (queryString) url += `?${queryString}`;
    }

    const maxAttempts = 3;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const sinceLast = Date.now() - this.lastRequestAt;
      if (sinceLast < 100) await sleep(100 - sinceLast);
      this.lastRequestAt = Date.now();

      try {
        const response = await fetch(url, {
          method,
          headers: this.headers(),
          body: options.body != null ? JSON.stringify(options.body) : undefined,
          signal: AbortSignal.timeout(30000)
        });

        if (response.status === 429 && attempt < maxAttempts - 1) {
          await sleep(2 ** attempt * 1000);
          continue;
        }

        const text = await response.text();
        if (!response.ok) {
          throw new Error(`n8n ${method} ${path} failed: ${response.status} ${text}`);
        }
        return (text ? JSON.parse(text) : {}) as T;
      } catch (error) {
        lastError = error;
        const isHttpError = error instanceof Error && error.message.startsWith("n8n ");
        if (isHttpError || attempt >= maxAttempts - 1) throw error;
        await sleep(1000);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("n8n request failed");
  }

  /** Validate connectivity + API key. Resolves true, or throws on auth/network failure. */
  async testConnection(): Promise<boolean> {
    await this.request("GET", "/api/v1/workflows", { query: { limit: 1 } });
    return true;
  }

  async listWorkflows(options: { limit?: number; cursor?: string } = {}): Promise<{ data: N8nWorkflow[]; nextCursor: string | null }> {
    const result = await this.request<{ data?: N8nWorkflow[]; nextCursor?: string | null }>("GET", "/api/v1/workflows", {
      query: { limit: options.limit ?? 100, cursor: options.cursor }
    });
    return { data: result.data ?? [], nextCursor: result.nextCursor ?? null };
  }

  /** Follow cursor pagination to fetch every workflow on the instance. */
  async listAllWorkflows(pageLimit = 100): Promise<N8nWorkflow[]> {
    const all: N8nWorkflow[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listWorkflows({ limit: pageLimit, cursor });
      all.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    return all;
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("GET", `/api/v1/workflows/${encodeURIComponent(id)}`);
  }

  async createWorkflow(payload: Partial<N8nWorkflow> | Record<string, unknown>): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("POST", "/api/v1/workflows", { body: cleanForCreate(payload) });
  }

  async activateWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("POST", `/api/v1/workflows/${encodeURIComponent(id)}/activate`);
  }

  async deactivateWorkflow(id: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>("POST", `/api/v1/workflows/${encodeURIComponent(id)}/deactivate`);
  }

  async createCredential(payload: { name: string; type: string; data: Record<string, unknown> }): Promise<{ id: string; name: string; type: string }> {
    return this.request<{ id: string; name: string; type: string }>("POST", "/api/v1/credentials", { body: payload });
  }

  async listCredentials(): Promise<Array<{ id: string; name: string; type: string }>> {
    const result = await this.request<{ data?: Array<{ id: string; name: string; type: string }> } | Array<{ id: string; name: string; type: string }>>(
      "GET",
      "/api/v1/credentials"
    );
    if (Array.isArray(result)) return result;
    return result.data ?? [];
  }
}
