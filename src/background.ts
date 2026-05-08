import { searchPullRequests } from "./github.js";
import {
  getAppSettings,
  getCacheByFilterId,
  getFilters,
  getGitHubToken,
  getNotificationStateByFilterId,
  saveCacheByFilterId,
  saveNotificationStateByFilterId
} from "./storage.js";
import type {
  CacheByFilterId,
  FilterCacheEntry,
  FilterNotificationState,
  NotificationStateByFilterId,
  PullRequestResult,
  SavedFilter
} from "./types.js";

export const POLLING_ALARM_NAME = "gitmarks-poll";
export const DEFAULT_ICON_PATHS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png",
  48: "icons/icon-48.png",
  128: "icons/icon-128.png"
} as const;
export const UNREAD_ICON_PATHS = {
  16: "icons/icon-16-unread.png",
  32: "icons/icon-32-unread.png",
  48: "icons/icon-48-unread.png",
  128: "icons/icon-128-unread.png"
} as const;

export function getPollingFilters(filters: SavedFilter[]): SavedFilter[] {
  return filters.filter((filter) => filter.enabled && filter.pollingEnabled);
}

export function getNewPullRequestIds(
  results: PullRequestResult[],
  previousEntry: FilterCacheEntry | undefined
): number[] {
  if (!previousEntry) {
    return [];
  }

  const previousIds = new Set(previousEntry.results.map((result) => result.id));
  return results.filter((result) => !previousIds.has(result.id)).map((result) => result.id);
}

export function mergeUnreadPrIds(existingIds: number[], newIds: number[]): number[] {
  return Array.from(new Set([...existingIds, ...newIds]));
}

export function hasUnreadNotifications(state: NotificationStateByFilterId): boolean {
  return Object.values(state).some((entry) => entry.unreadPrIds.length > 0);
}

export function pruneNotificationState(
  state: NotificationStateByFilterId,
  activeFilterIds: Set<string>
): NotificationStateByFilterId {
  return Object.fromEntries(Object.entries(state).filter(([filterId]) => activeFilterIds.has(filterId)));
}

export async function reschedulePollingAlarm(): Promise<void> {
  const [token, filters, settings, notificationState] = await Promise.all([
    getGitHubToken(),
    getFilters(),
    getAppSettings(),
    getNotificationStateByFilterId()
  ]);
  const pollingFilters = token ? getPollingFilters(filters) : [];
  const activeFilterIds = new Set(pollingFilters.map((filter) => filter.id));
  const nextNotificationState = pruneNotificationState(notificationState, activeFilterIds);

  await chrome.alarms.clear(POLLING_ALARM_NAME);
  await Promise.all([
    saveNotificationStateByFilterId(nextNotificationState),
    updateUnreadBadge(nextNotificationState)
  ]);

  if (!token || pollingFilters.length === 0) {
    return;
  }

  await chrome.alarms.create(POLLING_ALARM_NAME, {
    delayInMinutes: settings.pollingIntervalMinutes,
    periodInMinutes: settings.pollingIntervalMinutes
  });
}

export async function pollConfiguredFilters(): Promise<void> {
  const [token, filters, cacheByFilterId, notificationState] = await Promise.all([
    getGitHubToken(),
    getFilters(),
    getCacheByFilterId(),
    getNotificationStateByFilterId()
  ]);

  if (!token) {
    return;
  }

  const pollingFilters = getPollingFilters(filters);
  const activeFilterIds = new Set(pollingFilters.map((filter) => filter.id));
  let nextCache: CacheByFilterId = { ...cacheByFilterId };
  let nextNotificationState = pruneNotificationState(notificationState, activeFilterIds);

  for (const filter of pollingFilters) {
    const previous = nextCache[filter.id];
    const polledAt = new Date().toISOString();

    try {
      const { results, totalCount, hasMore } = await searchPullRequests(token, filter, 1);
      const newIds = getNewPullRequestIds(results, previous);

      nextCache = {
        ...nextCache,
        [filter.id]: {
          fetchedAt: polledAt,
          results,
          totalCount,
          loadedPage: 1,
          hasMore
        }
      };

      nextNotificationState = {
        ...nextNotificationState,
        [filter.id]: createNotificationEntry(nextNotificationState[filter.id], newIds, polledAt)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to poll filter";
      nextCache = {
        ...nextCache,
        [filter.id]: createErrorCacheEntry(previous, message, polledAt)
      };
      nextNotificationState = {
        ...nextNotificationState,
        [filter.id]: createErrorNotificationEntry(nextNotificationState[filter.id], message, polledAt)
      };
    }
  }

  await Promise.all([
    saveCacheByFilterId(nextCache),
    saveNotificationStateByFilterId(nextNotificationState),
    updateUnreadBadge(nextNotificationState)
  ]);
}

export async function clearUnreadBadge(): Promise<void> {
  await Promise.all([
    chrome.action.setBadgeText({ text: "" }),
    chrome.action.setIcon({ path: DEFAULT_ICON_PATHS })
  ]);
}

export async function updateUnreadBadge(state: NotificationStateByFilterId): Promise<void> {
  if (hasUnreadNotifications(state)) {
    await Promise.all([
      chrome.action.setBadgeText({ text: "" }),
      chrome.action.setIcon({ path: UNREAD_ICON_PATHS })
    ]);
    return;
  }

  await clearUnreadBadge();
}

function createNotificationEntry(
  previous: FilterNotificationState | undefined,
  newIds: number[],
  polledAt: string
): FilterNotificationState {
  const unreadPrIds = mergeUnreadPrIds(previous?.unreadPrIds || [], newIds);
  const entry: FilterNotificationState = {
    unreadPrIds,
    lastPolledAt: polledAt
  };

  if (newIds.length > 0) {
    entry.lastNewPrIds = newIds;
  }

  return entry;
}

function createErrorNotificationEntry(
  previous: FilterNotificationState | undefined,
  message: string,
  polledAt: string
): FilterNotificationState {
  return {
    unreadPrIds: previous?.unreadPrIds || [],
    lastPolledAt: polledAt,
    lastError: message
  };
}

function createErrorCacheEntry(
  previous: FilterCacheEntry | undefined,
  message: string,
  polledAt: string
): FilterCacheEntry {
  const entry: FilterCacheEntry = {
    fetchedAt: previous?.fetchedAt || polledAt,
    results: previous?.results || [],
    error: message
  };

  if (previous?.totalCount !== undefined) {
    entry.totalCount = previous.totalCount;
  }

  if (previous?.loadedPage !== undefined) {
    entry.loadedPage = previous.loadedPage;
  }

  if (previous?.hasMore !== undefined) {
    entry.hasMore = previous.hasMore;
  }

  return entry;
}

if (typeof chrome !== "undefined" && chrome.alarms && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    void reschedulePollingAlarm();
  });

  chrome.runtime.onStartup.addListener(() => {
    void reschedulePollingAlarm();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && ("githubToken" in changes || "filters" in changes || "appSettings" in changes)) {
      void reschedulePollingAlarm();
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLLING_ALARM_NAME) {
      void pollConfiguredFilters();
    }
  });
}
