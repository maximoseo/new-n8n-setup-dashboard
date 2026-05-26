import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppState, Site } from "../shared/types.js";

const statePath = path.join(process.cwd(), "data", "state.json");

const initialState: AppState = { sites: [] };

async function ensureDataDir() {
  await mkdir(path.dirname(statePath), { recursive: true });
}

export async function readState(): Promise<AppState> {
  await ensureDataDir();

  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as AppState;
    return { sites: Array.isArray(parsed.sites) ? parsed.sites : [] };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await writeState(initialState);
      return initialState;
    }

    throw error;
  }
}

export async function writeState(state: AppState): Promise<void> {
  await ensureDataDir();
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export async function listSites(): Promise<Site[]> {
  const state = await readState();
  return state.sites.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSite(siteId: string): Promise<Site | undefined> {
  const state = await readState();
  return state.sites.find((site) => site.id === siteId);
}

export async function upsertSite(site: Site): Promise<Site> {
  const state = await readState();
  const index = state.sites.findIndex((item) => item.id === site.id);

  if (index >= 0) {
    state.sites[index] = site;
  } else {
    state.sites.push(site);
  }

  await writeState(state);
  return site;
}
