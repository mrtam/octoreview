export type FilterSort = "updated-desc" | "created-desc" | "created-asc" | "comments-desc";

export interface SavedFilter {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  query: string;
  icon?: string;
  enabled: boolean;
  sort: FilterSort;
  includeDrafts: boolean;
}

export interface PullRequestLabel {
  name: string;
  color: string;
}

export interface PullRequestResult {
  id: number;
  number: number;
  title: string;
  url: string;
  author: string;
  labels: PullRequestLabel[];
  state: "open" | "closed";
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FilterCacheEntry {
  fetchedAt: string;
  results: PullRequestResult[];
  totalCount?: number;
  loadedPage?: number;
  hasMore?: boolean;
  error?: string;
}

export type CacheByFilterId = Record<string, FilterCacheEntry>;

export interface StorageShape {
  githubToken?: string;
  filters: SavedFilter[];
  cacheByFilterId: CacheByFilterId;
}
