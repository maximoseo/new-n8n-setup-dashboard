import type { Site, SiteInput } from "../shared/types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchSites() {
  return request<{ sites: Site[] }>("/api/sites");
}

export function createSite(input: SiteInput) {
  return request<{ site: Site }>("/api/sites", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function runDiscovery(siteId: string) {
  return request<{ site: Site }>(`/api/sites/${siteId}/discover`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function generateArtifacts(siteId: string) {
  return request<{ site: Site }>(`/api/sites/${siteId}/generate-artifacts`, {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function updateSite(siteId: string, patch: Partial<Site>) {
  return request<{ site: Site }>(`/api/sites/${siteId}`, {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}
