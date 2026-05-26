import type { Site, SiteInput, UserSettings } from "../shared/types";
import { supabase } from "./lib/supabase";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } };
  const headers = {
    "content-type": "application/json",
    ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
    ...(options?.headers ?? {})
  };
  const response = await fetch(url, {
    headers,
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

export function fetchUserSettings() {
  return request<{ settings: UserSettings }>("/api/user-settings");
}

export function updateUserSettings(settings: Partial<UserSettings>) {
  return request<{ settings: UserSettings }>("/api/user-settings", {
    method: "PATCH",
    body: JSON.stringify(settings)
  });
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
