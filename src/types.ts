export type FilterSort = "updated-desc" | "created-desc" | "created-asc" | "comments-desc";
export type PollingIntervalMinutes = 1 | 5 | 15 | 30 | 60;

export interface SavedFilter {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  query: string;
  icon?: string;
  enabled: boolean;
  pollingEnabled: boolean;
  sort: FilterSort;
  includeDrafts: boolean;
  categoryId?: string;
}

export interface Category {
  id: string;
  name: string;
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

export interface AppSettings {
  pollingIntervalMinutes: PollingIntervalMinutes;
  collapsedCategoryIds: string[];
}

export interface FilterNotificationState {
  unreadPrIds: number[];
  lastPolledAt?: string;
  lastNewPrIds?: number[];
  lastError?: string;
}

export type NotificationStateByFilterId = Record<string, FilterNotificationState>;

export interface StorageShape {
  githubToken?: string;
  filters: SavedFilter[];
  categories: Category[];
  cacheByFilterId: CacheByFilterId;
  appSettings: AppSettings;
  notificationStateByFilterId: NotificationStateByFilterId;
}
