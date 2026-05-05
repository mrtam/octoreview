import { searchPullRequests } from "./github.js";
import {
  getCacheByFilterId,
  getFilters,
  getGitHubToken,
  saveFilterCacheEntry
} from "./storage.js";
import { formatRelativeTime } from "./time.js";
import type { CacheByFilterId, FilterCacheEntry, SavedFilter } from "./types.js";

interface PopupRenderState {
  tokenConfigured: boolean;
  loadingFilterIds: Set<string>;
  pagingFilterIds?: Set<string>;
  activeFilterId?: string | null;
  expandedFilterIds?: Set<string>;
}

interface PopupState {
  filters: SavedFilter[];
  cacheByFilterId: CacheByFilterId;
  token: string;
  loadingFilterIds: Set<string>;
  pagingFilterIds: Set<string>;
  activeFilterId: string | null;
  preserveScrollOnce: boolean;
}

const state: PopupState = {
  filters: [],
  cacheByFilterId: {},
  token: "",
  loadingFilterIds: new Set(),
  pagingFilterIds: new Set(),
  activeFilterId: null,
  preserveScrollOnce: false
};

let activeLoadMoreObserver: IntersectionObserver | null = null;

export function renderPopup(
  root: HTMLElement,
  filters: SavedFilter[],
  cacheByFilterId: CacheByFilterId,
  renderState: PopupRenderState
): void {
  root.replaceChildren();

  if (!renderState.tokenConfigured) {
    root.append(createNotice("Add a GitHub token", "Open options to save a read-only token before refreshing filters."));
    return;
  }

  const enabledFilters = filters.filter((filter) => filter.enabled);

  if (enabledFilters.length === 0) {
    root.append(createNotice("No enabled filters", "Open options to create or enable a saved PR filter."));
    return;
  }

  root.append(createMenuShell(enabledFilters, cacheByFilterId, renderState));
}

async function bootstrapPopup(): Promise<void> {
  const root = getElement("popup-root");
  const refreshButton = getElement("refresh-button") as HTMLButtonElement;
  const optionsButton = getElement("options-button") as HTMLButtonElement;

  [state.token, state.filters, state.cacheByFilterId] = await Promise.all([
    getGitHubToken(),
    getFilters(),
    getCacheByFilterId()
  ]);

  state.activeFilterId = state.filters.find((filter) => filter.enabled)?.id || null;
  render(root);

  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  refreshButton.addEventListener("click", () => {
    void refreshEnabledFilters(root);
  });

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest("button");

    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "select-filter") {
      selectFilter(button.dataset.filterId || "", root);
    }

    if (action === "open-url" && button.dataset.url) {
      const url = button.dataset.url;
      const mouseEvent = event as MouseEvent;
      const newTab = mouseEvent.metaKey || mouseEvent.ctrlKey || mouseEvent.button === 1;

      if (newTab) {
        void chrome.tabs.create({ url, active: false });
      } else {
        void chrome.tabs.update({ url });
        window.close();
      }
    }

    if (action === "load-more" && button.dataset.filterId) {
      void loadMoreFor(button.dataset.filterId, root);
    }
  });

  root.addEventListener("pointerover", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button[data-action='select-filter']");

    if (button) {
      selectFilter(button.dataset.filterId || "", root);
    }
  });

  root.addEventListener("focusin", (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLButtonElement>("button[data-action='select-filter']");

    if (button) {
      selectFilter(button.dataset.filterId || "", root);
    }
  });

  if (state.token) {
    void refreshEnabledFilters(root);
  }
}

async function refreshEnabledFilters(root: HTMLElement): Promise<void> {
  if (!state.token) {
    render(root);
    return;
  }

  const filters = state.filters.filter((filter) => filter.enabled);

  state.pagingFilterIds.clear();

  for (const filter of filters) {
    state.loadingFilterIds.add(filter.id);
  }

  render(root);

  await Promise.all(
    filters.map(async (filter) => {
      try {
        const { results, totalCount, hasMore } = await searchPullRequests(state.token, filter, 1);
        state.cacheByFilterId = await saveFilterCacheEntry(filter.id, {
          fetchedAt: new Date().toISOString(),
          results,
          totalCount,
          loadedPage: 1,
          hasMore
        });
      } catch (error) {
        const previous = state.cacheByFilterId[filter.id];
        const message = error instanceof Error ? error.message : "Unable to refresh filter";
        const entry: FilterCacheEntry = {
          fetchedAt: previous?.fetchedAt || new Date().toISOString(),
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
        state.cacheByFilterId = await saveFilterCacheEntry(filter.id, entry);
      } finally {
        state.loadingFilterIds.delete(filter.id);
        render(root);
      }
    })
  );
}

async function loadMoreFor(filterId: string, root: HTMLElement): Promise<void> {
  if (!state.token || state.pagingFilterIds.has(filterId)) {
    return;
  }

  const filter = state.filters.find((item) => item.id === filterId);
  const previous = state.cacheByFilterId[filterId];

  if (!filter || !previous?.hasMore) {
    return;
  }

  const nextPage = (previous.loadedPage || 1) + 1;

  state.pagingFilterIds.add(filterId);
  state.preserveScrollOnce = true;
  render(root);

  try {
    const { results, totalCount, hasMore } = await searchPullRequests(state.token, filter, nextPage);
    const merged: FilterCacheEntry = {
      fetchedAt: previous.fetchedAt,
      results: [...previous.results, ...results],
      totalCount,
      loadedPage: nextPage,
      hasMore
    };
    state.cacheByFilterId = await saveFilterCacheEntry(filterId, merged);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load more results";
    const entry: FilterCacheEntry = {
      fetchedAt: previous.fetchedAt,
      results: previous.results,
      error: message
    };
    if (previous.totalCount !== undefined) {
      entry.totalCount = previous.totalCount;
    }
    if (previous.loadedPage !== undefined) {
      entry.loadedPage = previous.loadedPage;
    }
    if (previous.hasMore !== undefined) {
      entry.hasMore = previous.hasMore;
    }
    state.cacheByFilterId = await saveFilterCacheEntry(filterId, entry);
  } finally {
    state.pagingFilterIds.delete(filterId);
    state.preserveScrollOnce = true;
    render(root);
  }
}

function render(root: HTMLElement): void {
  const previousPanel = root.querySelector<HTMLElement>(".menu-panel");
  const previousScroll = state.preserveScrollOnce && previousPanel ? previousPanel.scrollTop : 0;
  const shouldPreserve = state.preserveScrollOnce;
  state.preserveScrollOnce = false;

  activeLoadMoreObserver?.disconnect();
  activeLoadMoreObserver = null;

  renderPopup(root, state.filters, state.cacheByFilterId, {
    tokenConfigured: Boolean(state.token),
    loadingFilterIds: state.loadingFilterIds,
    pagingFilterIds: state.pagingFilterIds,
    activeFilterId: state.activeFilterId
  });

  const newPanel = root.querySelector<HTMLElement>(".menu-panel");

  if (shouldPreserve && newPanel) {
    newPanel.scrollTop = previousScroll;
  }

  const refreshButton = document.getElementById("refresh-button");
  refreshButton?.classList.toggle("is-loading", state.loadingFilterIds.size > 0);

  attachLoadMoreObserver(root, newPanel);
}

function attachLoadMoreObserver(root: HTMLElement, panel: HTMLElement | null): void {
  if (!panel || typeof IntersectionObserver === "undefined") {
    return;
  }

  const button = panel.querySelector<HTMLButtonElement>("button[data-action='load-more']:not([disabled])");

  if (!button) {
    return;
  }

  const filterId = button.dataset.filterId || "";

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          if (activeLoadMoreObserver === observer) {
            activeLoadMoreObserver = null;
          }
          void loadMoreFor(filterId, root);
          return;
        }
      }
    },
    { root: panel, rootMargin: "0px 0px 80px 0px", threshold: 0 }
  );

  observer.observe(button);
  activeLoadMoreObserver = observer;
}

function createMenuShell(
  filters: SavedFilter[],
  cacheByFilterId: CacheByFilterId,
  renderState: PopupRenderState
): HTMLElement {
  const shell = document.createElement("div");
  shell.className = "menu-shell";

  const activeFilterId = getActiveFilterId(filters, renderState);
  const activeFilter = filters.find((filter) => filter.id === activeFilterId) || filters[0];

  if (!activeFilter) {
    return shell;
  }

  const menu = document.createElement("nav");
  menu.className = "filter-menu";
  menu.setAttribute("aria-label", "Saved pull request filters");

  for (const filter of filters) {
    menu.append(createFilterMenuItem(filter, cacheByFilterId[filter.id], {
      active: filter.id === activeFilter.id,
      loading: renderState.loadingFilterIds.has(filter.id)
    }));
  }

  const panel = document.createElement("section");
  panel.className = "menu-panel";
  panel.append(createFilterDetail(activeFilter, cacheByFilterId[activeFilter.id], renderState));

  shell.append(menu, panel);
  return shell;
}

function createFilterMenuItem(
  filter: SavedFilter,
  cacheEntry: CacheByFilterId[string] | undefined,
  options: { active: boolean; loading: boolean }
): HTMLElement {
  const item = document.createElement("button");
  item.className = "filter-menu-item";
  item.type = "button";
  item.dataset.action = "select-filter";
  item.dataset.filterId = filter.id;
  item.setAttribute("aria-selected", String(options.active));

  const icon = document.createElement("span");
  icon.className = "filter-icon";
  const hasIcon = Boolean(filter.icon);
  const isEmoji = hasIcon ? isEmojiIcon(filter.icon as string) : false;
  icon.classList.toggle("filter-icon-emoji", isEmoji);
  icon.classList.toggle("filter-icon-custom", hasIcon && !isEmoji);
  icon.textContent = filter.icon || "";
  icon.setAttribute("aria-hidden", "true");

  const content = document.createElement("span");
  content.className = "filter-menu-content";

  const title = document.createElement("span");
  title.className = "filter-title";
  title.textContent = filter.name;

  const repo = document.createElement("span");
  repo.className = "filter-meta filter-meta-repo";
  const org = document.createElement("span");
  org.className = "filter-meta-org";
  org.textContent = `${filter.repoOwner}/`;
  const repoName = document.createElement("span");
  repoName.className = "filter-meta-repo-name";
  repoName.textContent = filter.repoName;
  repo.append(org, repoName);
  repo.title = `${filter.repoOwner}/${filter.repoName}`;

  content.append(title, repo);

  const count = document.createElement("span");
  count.className = "count";
  const cachedTotal = cacheEntry?.totalCount;
  const cachedResultLength = cacheEntry?.results.length ?? 0;
  const total = cachedTotal ?? cachedResultLength;
  const isFirstFetch = cachedTotal === undefined && cachedResultLength === 0;
  count.dataset.state = total > 0 ? "has" : "empty";

  if (options.loading && isFirstFetch) {
    count.textContent = "...";
  } else {
    count.textContent = formatTotalCount(total);
  }

  const chevron = document.createElement("span");
  chevron.className = "chevron";
  chevron.textContent = "›";
  chevron.setAttribute("aria-hidden", "true");

  item.append(icon, content, count, chevron);
  return item;
}

function createFilterDetail(
  filter: SavedFilter,
  cacheEntry: CacheByFilterId[string] | undefined,
  renderState: PopupRenderState
): HTMLElement {
  const detail = document.createElement("div");
  detail.className = "filter-detail";
  detail.setAttribute("aria-label", `${filter.name} pull requests`);

  const loading = renderState.loadingFilterIds.has(filter.id);
  const paging = renderState.pagingFilterIds?.has(filter.id) ?? false;
  const results = cacheEntry?.results || [];

  const body = document.createElement("div");
  body.className = "filter-body";

  if (cacheEntry?.error) {
    const error = document.createElement("div");
    error.className = "filter-message filter-error";
    error.textContent = cacheEntry.error;
    body.append(error);
  }

  if (loading && results.length === 0) {
    body.append(createMessage("Refreshing..."));
  } else if (results.length === 0) {
    body.append(createMessage("No matching PRs."));
  } else {
    const list = document.createElement("div");
    list.className = "pr-list";

    for (const result of results) {
      list.append(createPullRequestRow(result));
    }

    body.append(list);

    if (cacheEntry?.hasMore) {
      body.append(createLoadMoreButton(filter.id, results.length, cacheEntry.totalCount, paging));
    }
  }

  detail.append(body);
  return detail;
}

function createLoadMoreButton(
  filterId: string,
  loaded: number,
  totalCount: number | undefined,
  loading: boolean
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "pr-load-more";
  button.type = "button";
  button.dataset.action = "load-more";
  button.dataset.filterId = filterId;
  button.disabled = loading;

  if (loading) {
    button.textContent = "Loading…";
  } else if (typeof totalCount === "number" && totalCount > loaded) {
    const remaining = totalCount - loaded;
    button.textContent = `Load more (${remaining} remaining)`;
  } else {
    button.textContent = "Load more";
  }

  return button;
}

function createPullRequestRow(result: CacheByFilterId[string]["results"][number]): HTMLElement {
  const row = document.createElement("button");
  row.className = "pr-row";
  row.type = "button";
  row.dataset.action = "open-url";
  row.dataset.url = result.url;
  row.dataset.draft = String(result.draft);

  const title = document.createElement("div");
  title.className = "pr-title";
  title.textContent = result.title;

  const meta = document.createElement("div");
  meta.className = "pr-meta";
  meta.textContent = `#${result.number} · ${result.author}${result.draft ? " · draft" : ""} · updated ${formatRelativeTime(result.updatedAt)}`;

  row.append(title, meta);

  if (result.labels.length > 0) {
    const labels = document.createElement("div");
    labels.className = "pr-labels";

    const visibleLabels = result.labels.slice(0, 4);

    for (const label of visibleLabels) {
      const labelNode = document.createElement("span");
      labelNode.className = "label";
      const dot = document.createElement("span");
      dot.className = "label-dot";
      dot.style.backgroundColor = `#${label.color}`;
      const text = document.createElement("span");
      text.className = "label-text";
      text.textContent = label.name;
      labelNode.append(dot, text);
      labels.append(labelNode);
    }

    const hiddenCount = result.labels.length - visibleLabels.length;

    if (hiddenCount > 0) {
      const overflow = document.createElement("span");
      overflow.className = "label label-overflow";
      overflow.textContent = `+${hiddenCount}`;
      labels.append(overflow);
    }

    row.append(labels);
  }

  return row;
}

function formatTotalCount(total: number): string {
  return total >= 1000 ? "1000+" : String(total);
}

function isEmojiIcon(value: string): boolean {
  return value.length > 0 && /\p{Extended_Pictographic}/u.test(value) && !/[\p{L}\p{N}]/u.test(value);
}

function createMessage(message: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "filter-message";
  node.textContent = message;
  return node;
}

function createNotice(title: string, message: string): HTMLElement {
  const notice = document.createElement("section");
  notice.className = "notice";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const body = document.createElement("p");
  body.textContent = message;

  notice.append(heading, body);
  return notice;
}

function getActiveFilterId(filters: SavedFilter[], renderState: PopupRenderState): string {
  if (renderState.activeFilterId && filters.some((filter) => filter.id === renderState.activeFilterId)) {
    return renderState.activeFilterId;
  }

  const legacyExpandedId = Array.from(renderState.expandedFilterIds || []).find((filterId) =>
    filters.some((filter) => filter.id === filterId)
  );

  return legacyExpandedId || filters[0]?.id || "";
}

function selectFilter(filterId: string, root: HTMLElement): void {
  if (!filterId || state.activeFilterId === filterId) {
    return;
  }

  state.activeFilterId = filterId;
  render(root);
}

function getElement(id: string): HTMLElement {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }

  return element;
}

if (typeof document !== "undefined" && document.body?.dataset.page === "popup") {
  void bootstrapPopup();
}
