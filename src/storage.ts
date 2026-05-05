import type { CacheByFilterId, FilterCacheEntry, SavedFilter } from "./types.js";

const TOKEN_KEY = "githubToken";
const FILTERS_KEY = "filters";
const CACHE_KEY = "cacheByFilterId";

export async function getGitHubToken(): Promise<string> {
  return getStorageValue(TOKEN_KEY, "");
}

export async function saveGitHubToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token.trim() });
}

export async function clearGitHubToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY);
}

export async function getFilters(): Promise<SavedFilter[]> {
  const filters = await getStorageValue<SavedFilter[]>(FILTERS_KEY, []);
  return filters.map(normalizeStoredFilter);
}

export async function saveFilters(filters: SavedFilter[]): Promise<void> {
  await chrome.storage.local.set({ [FILTERS_KEY]: filters.map(normalizeStoredFilter) });
}

export async function getCacheByFilterId(): Promise<CacheByFilterId> {
  return getStorageValue<CacheByFilterId>(CACHE_KEY, {});
}

export async function saveCacheByFilterId(cache: CacheByFilterId): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function saveFilterCacheEntry(filterId: string, entry: FilterCacheEntry): Promise<CacheByFilterId> {
  const cache = await getCacheByFilterId();
  const nextCache = { ...cache, [filterId]: entry };
  await saveCacheByFilterId(nextCache);
  return nextCache;
}

export function normalizeStoredFilter(filter: SavedFilter): SavedFilter {
  return {
    id: filter.id,
    name: filter.name.trim(),
    repoOwner: filter.repoOwner.trim(),
    repoName: filter.repoName.trim(),
    query: filter.query.trim(),
    icon: normalizeIcon(filter.icon),
    enabled: filter.enabled,
    sort: filter.sort || "updated-desc",
    includeDrafts: filter.includeDrafts !== false
  };
}

async function getStorageValue<T>(key: string, fallback: T): Promise<T> {
  const values = await chrome.storage.local.get(key);
  return (values[key] as T | undefined) ?? fallback;
}

function normalizeIcon(icon: string | undefined): string {
  return Array.from((icon || "").trim()).slice(0, 4).join("");
}
