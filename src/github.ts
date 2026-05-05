import type { FilterSort, PullRequestLabel, PullRequestResult, SavedFilter } from "./types.js";

const GITHUB_API_VERSION = "2022-11-28";
const STATE_QUALIFIER_PATTERN = /(^|\s)(is|state):(open|closed|merged|unmerged)\b/i;
const TYPE_QUALIFIER_PATTERN = /(^|\s)(is|type):(pr|pull-request|pullrequest)\b/i;
const DRAFT_QUALIFIER_PATTERN = /(^|\s)-?draft:(true|false)\b/i;

export const PAGE_SIZE = 30;

interface GitHubSearchResponse {
  items?: GitHubIssueSearchItem[];
  total_count?: number;
  message?: string;
}

interface GitHubIssueSearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft?: boolean;
  created_at: string;
  updated_at: string;
  user?: {
    login?: string;
  } | null;
  labels?: Array<{
    name?: string;
    color?: string;
  }>;
  pull_request?: unknown;
}

export interface SearchPullRequestsResult {
  results: PullRequestResult[];
  totalCount: number;
  page: number;
  hasMore: boolean;
}

export class GitHubApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export function buildSearchQuery(filter: SavedFilter): string {
  const repo = `repo:${filter.repoOwner.trim()}/${filter.repoName.trim()}`;
  const rawQuery = filter.query.trim();
  const qualifiers = [repo];

  if (!TYPE_QUALIFIER_PATTERN.test(rawQuery)) {
    qualifiers.push("type:pr");
  }

  if (!STATE_QUALIFIER_PATTERN.test(rawQuery)) {
    qualifiers.push("is:open");
  }

  if (filter.includeDrafts === false && !DRAFT_QUALIFIER_PATTERN.test(rawQuery)) {
    qualifiers.push("-draft:true");
  }

  if (rawQuery.length > 0) {
    qualifiers.push(rawQuery);
  }

  return qualifiers.join(" ").replace(/\s+/g, " ").trim();
}

export function buildFilterWebUrl(filter: SavedFilter): string {
  const query = buildSearchQuery(filter)
    .replace(new RegExp(`\\brepo:${escapeRegExp(filter.repoOwner)}/${escapeRegExp(filter.repoName)}\\b`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();

  return `https://github.com/${encodeURIComponent(filter.repoOwner)}/${encodeURIComponent(filter.repoName)}/pulls?q=${encodeURIComponent(query)}`;
}

export function buildSearchApiUrl(filter: SavedFilter, page = 1): string {
  const { sort, order } = mapSort(filter.sort);
  const url = new URL("https://api.github.com/search/issues");
  url.searchParams.set("q", buildSearchQuery(filter));
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", order);
  url.searchParams.set("per_page", String(PAGE_SIZE));

  if (page > 1) {
    url.searchParams.set("page", String(page));
  }

  return url.toString();
}

export async function searchPullRequests(
  token: string,
  filter: SavedFilter,
  page = 1
): Promise<SearchPullRequestsResult> {
  const response = await fetch(buildSearchApiUrl(filter, page), {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    }
  });

  const payload = (await response.json().catch(() => ({}))) as GitHubSearchResponse;

  if (!response.ok) {
    const message = payload.message || `GitHub request failed with status ${response.status}`;
    throw new GitHubApiError(message);
  }

  const totalCount = typeof payload.total_count === "number" ? payload.total_count : 0;
  const results = normalizeSearchResponse(payload);
  const hasMore = page * PAGE_SIZE < totalCount;

  return {
    results,
    totalCount,
    page,
    hasMore
  };
}

export async function validateGitHubToken(token: string): Promise<string> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION
    }
  });

  const payload = (await response.json().catch(() => ({}))) as { login?: string; message?: string };

  if (!response.ok) {
    throw new GitHubApiError(payload.message || "Token validation failed");
  }

  return payload.login || "GitHub user";
}

export function normalizeSearchResponse(payload: GitHubSearchResponse): PullRequestResult[] {
  return (payload.items || [])
    .filter((item) => Boolean(item.pull_request))
    .map((item) => ({
      id: item.id,
      number: item.number,
      title: item.title,
      url: item.html_url,
      author: item.user?.login || "unknown",
      labels: normalizeLabels(item.labels),
      state: item.state,
      draft: Boolean(item.draft),
      createdAt: item.created_at,
      updatedAt: item.updated_at
    }));
}

export function mapSort(sort: FilterSort): { sort: string; order: "asc" | "desc" } {
  switch (sort) {
    case "created-asc":
      return { sort: "created", order: "asc" };
    case "created-desc":
      return { sort: "created", order: "desc" };
    case "comments-desc":
      return { sort: "comments", order: "desc" };
    case "updated-desc":
    default:
      return { sort: "updated", order: "desc" };
  }
}

function normalizeLabels(labels: GitHubIssueSearchItem["labels"]): PullRequestLabel[] {
  return (labels || [])
    .filter((label) => Boolean(label.name))
    .map((label) => ({
      name: label.name || "",
      color: normalizeColor(label.color)
    }));
}

function normalizeColor(color: string | undefined): string {
  if (!color || !/^[0-9a-f]{6}$/i.test(color)) {
    return "d8dde5";
  }

  return color;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
